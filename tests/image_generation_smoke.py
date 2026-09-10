"""Offline regressions; provider, authentication boundary and billing transport are mocked."""
from __future__ import annotations
import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from backend.chatbot import image_generation as provider, image_routes as routes
from backend.chatbot.premium_credits import PremiumCreditStore, CreditReservation, CreditServiceError, EDUCATIONAL_IMAGE_CREDIT_COST
from backend.chatbot.rate_limit import SlidingWindowRateLimiter

REAL_CLIENT = httpx.AsyncClient
SPEC = dict(topic="Volcano", description="An educational volcanic eruption illustration",
            required_labels=["Magma", "Lava"], educational_context="Grade 9", style="clean_educational",
            aspect_ratio="landscape")
BODY = dict(SPEC, idempotency_key="study-image:test-00000001", action="educationalImage",
            visual_type="educational_illustration", alt_text="Volcanic eruption")


def png():
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), "blue").save(buffer, format="PNG")
    return buffer.getvalue()


def mock_client(handler):
    return lambda **kwargs: REAL_CLIENT(transport=httpx.MockTransport(handler), **kwargs)


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_key_isolation(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(provider.image_api_key(), ("", ""))
            os.environ["OPENAI_API_KEY"] = "test-fallback"
            self.assertFalse(provider.image_generation_configured())
            os.environ["TUTORLY_ENV"] = "development"
            self.assertEqual(provider.image_api_key()[1], "OPENAI_API_KEY_LOCAL_FALLBACK")
            for name, value in (("RENDER", "true"), ("NODE_ENV", "production"), ("ENVIRONMENT", "production")):
                os.environ[name] = value
                self.assertFalse(provider.image_generation_configured())
                del os.environ[name]
            os.environ["OPENAI_IMAGE_API_KEY"] = "test-dedicated"
            os.environ["RENDER"] = "true"
            self.assertEqual(provider.image_api_key()[1], "OPENAI_IMAGE_API_KEY")
            self.assertEqual(provider.image_api_key()[0], "test-dedicated")

    async def test_real_provider_payload_and_png_validation(self):
        calls = []
        def handler(request):
            calls.append(request)
            self.assertEqual(str(request.url), "https://api.openai.com/v1/images/generations")
            self.assertEqual(request.headers["Authorization"], "Bearer test-dedicated")
            body = json.loads(request.content)
            self.assertEqual(body["n"], 1)
            self.assertEqual(body["size"], "1536x1024")
            self.assertEqual(body["output_format"], "png")
            return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(png()).decode()}]})
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"OPENAI_IMAGE_API_KEY": "test-dedicated"}):
            service = provider.ImageGenerationService(Path(folder))
            with patch.object(provider.httpx, "AsyncClient", mock_client(handler)):
                result = await service.generate(**SPEC, image_id="a" * 32)
            self.assertEqual(result.url, "/uploads/generated/study-" + "a" * 32 + ".png")
            self.assertTrue((Path(folder) / result.filename).is_file())
            self.assertEqual((result.width, result.height), (64, 64))
            self.assertEqual(len(calls), 1)
            with Image.open(Path(folder) / result.filename) as image:
                self.assertEqual(image.format, "PNG")

    async def test_provider_failures(self):
        cases = [
            (429, {}, "rate_limited"), (401, {}, "authentication_failed"),
            (500, {}, "provider_error"), (200, {"data": [{"url": "https://untrusted.invalid/a.png"}]}, "invalid_provider_output"),
            (200, {"data": [{"b64_json": base64.b64encode(b"<svg>not a raster</svg>").decode()}]}, "invalid_provider_output"),
            (200, {"data": [{"b64_json": "%%"}]}, "invalid_provider_output"),
        ]
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {"OPENAI_IMAGE_API_KEY": "test-dedicated"}):
            service = provider.ImageGenerationService(Path(folder))
            for status, body, expected in cases:
                with patch.object(provider.httpx, "AsyncClient", mock_client(lambda _: httpx.Response(status, json=body))):
                    with self.assertRaises(provider.ImageGenerationError) as caught:
                        await service.generate(**SPEC)
                    self.assertEqual(caught.exception.status, expected)
            self.assertFalse(list(Path(folder).iterdir()))
            def timeout(_):
                raise httpx.ReadTimeout("private diagnostic")
            with patch.object(provider.httpx, "AsyncClient", mock_client(timeout)):
                with self.assertRaises(provider.ImageGenerationError) as caught:
                    await service.generate(**SPEC)
                self.assertEqual(str(caught.exception), "timeout")

    async def test_signed_existing_credit_bridge(self):
        secret = "test-bridge-secret-" * 3
        def handler(request):
            stamp = request.headers["x-tutorly-timestamp"]
            operation = request.url.path.rsplit("/", 1)[1]
            expected = hmac.new(secret.encode(), f"{stamp}\n{operation}\n".encode() + request.content, hashlib.sha256).hexdigest()
            self.assertEqual(request.headers["x-tutorly-signature"], expected)
            self.assertEqual(json.loads(request.content)["user_id"], "23")
            return httpx.Response(200, json={"status": "reserved", "remaining": 92, "reservation_token": "a" * 64})
        store = PremiumCreditStore()
        with patch.dict(os.environ, {"TUTORLY_CREDIT_SERVICE_URL": "https://billing.test", "TUTORLY_CREDIT_SERVICE_SECRET": secret}):
            with patch("backend.chatbot.premium_credits.httpx.AsyncClient", mock_client(handler)):
                result = await store.reserve(user_id="23", idempotency_key=BODY["idempotency_key"], request_hash="a" * 64, action="educationalImage")
                self.assertEqual(result.remaining, 92)
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(CreditServiceError):
                await store.reserve(user_id="23")
        with patch.dict(os.environ, {"TUTORLY_CREDIT_SERVICE_URL": "http://remote.test", "TUTORLY_CREDIT_SERVICE_SECRET": secret}):
            with self.assertRaises(CreditServiceError):
                await store.reserve(user_id="23")


class FakeCredits:
    def __init__(self, remaining=100):
        self.remaining = remaining
        self.entries = {}
        self.unavailable = False
        self.ambiguous = False

    def find(self, args):
        key = (args["user_id"], args["idempotency_key"])
        entry = self.entries.get(key)
        if entry and entry["hash"] != args["request_hash"]:
            raise CreditServiceError("idempotency_conflict", 409)
        return key, entry

    def result(self, entry):
        return CreditReservation(entry["status"], self.remaining, entry.get("url", ""), "b" * 64)

    async def status(self, **args):
        _, entry = self.find(args)
        if not entry:
            raise CreditServiceError("credit_reservation_missing")
        return self.result(entry)

    async def reserve(self, **args):
        if self.unavailable:
            raise CreditServiceError("credit_account_unlinked")
        key, entry = self.find(args)
        if entry and entry["status"] == "completed":
            return self.result(entry)
        if entry and entry["status"] == "reserved":
            raise CreditServiceError("generation_in_progress", 409)
        if self.remaining < EDUCATIONAL_IMAGE_CREDIT_COST:
            raise CreditServiceError("insufficient_credits", 402, self.remaining)
        self.remaining -= EDUCATIONAL_IMAGE_CREDIT_COST
        entry = {"status": "reserved", "hash": args["request_hash"]}
        self.entries[key] = entry
        return self.result(entry)

    async def complete(self, **args):
        _, entry = self.find(args)
        entry.update(status="completed", url=args["result_url"])
        if self.ambiguous:
            self.ambiguous = False
            raise CreditServiceError()
        return self.result(entry)

    async def release(self, **args):
        _, entry = self.find(args)
        if entry["status"] == "reserved":
            entry["status"] = "released"
            self.remaining += EDUCATIONAL_IMAGE_CREDIT_COST
        return self.result(entry)


class FakeImages(provider.ImageGenerationService):
    calls = 0
    fail = False
    async def generate(self, **args):
        self.calls += 1
        if self.fail:
            raise provider.ImageGenerationError("provider_error")
        return self._validate_and_save(png(), args["image_id"])


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = FakeImages(Path(self.temp.name))
        self.credit = FakeCredits()
        def auth(header):
            if header != "Bearer test-session":
                raise HTTPException(401, "Please log in.")
            return {"id": 23}
        self.patches = [
            patch.object(routes, "service", self.service), patch.object(routes, "credits", self.credit),
            patch.object(routes, "image_generation_configured", lambda: True),
            patch.object(routes, "authenticated_user_context", auth),
            patch.object(routes, "limiter", SlidingWindowRateLimiter(requests_per_minute=100, requests_per_hour=200)),
        ]
        for item in self.patches:
            item.start()
        app = FastAPI()
        app.include_router(routes.router)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def post(self, data=None):
        return self.client.post("/api/images/generate", json=data or BODY, headers={"Authorization": "Bearer test-session"})

    def test_success_retry_and_request_binding(self):
        first = self.post()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.credit.remaining, 100 - EDUCATIONAL_IMAGE_CREDIT_COST)
        again = self.post()
        self.assertEqual(again.status_code, 200, again.text)
        self.assertTrue(again.json()["cached"])
        self.assertEqual(self.service.calls, 1)
        self.assertEqual(self.credit.remaining, 92)
        changed = self.post(dict(BODY, description="A different description"))
        self.assertEqual(changed.status_code, 409)

    def test_no_credit_no_provider(self):
        self.credit.remaining = 2
        response = self.post()
        self.assertEqual(response.status_code, 402)
        self.assertEqual(response.json()["detail"]["remaining"], 2)
        self.assertEqual(self.service.calls, 0)

    def test_provider_failure_refunds_then_retry_once(self):
        self.service.fail = True
        self.assertEqual(self.post().status_code, 502)
        self.assertEqual(self.credit.remaining, 100)
        self.service.fail = False
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.credit.remaining, 92)
        self.assertEqual(self.service.calls, 2)

    def test_lost_settlement_response_recovers_without_regeneration(self):
        self.credit.ambiguous = True
        self.assertEqual(self.post().status_code, 503)
        self.assertEqual(self.credit.remaining, 92)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.service.calls, 1)
        self.assertEqual(self.credit.remaining, 92)

    def test_no_unverified_account_or_client_balance(self):
        self.credit.unavailable = True
        self.assertEqual(self.post().status_code, 503)
        self.assertEqual(self.service.calls, 0)
        self.assertEqual(self.post(dict(BODY, user_id=99, credits=999)).status_code, 422)
        self.assertEqual(self.client.post("/api/images/generate", json=BODY).status_code, 401)

    def test_invalid_input_and_rate_limit(self):
        for change in ({"description": " "}, {"topic": "x" * 161}, {"style": "unsafe"},
                       {"required_labels": ["x"] * 8}, {"idempotency_key": "../../secret"}):
            self.assertEqual(self.post(dict(BODY, **change)).status_code, 422)
        with patch.object(routes, "limiter", SlidingWindowRateLimiter(requests_per_minute=1, requests_per_hour=2)):
            self.assertEqual(self.post().status_code, 200)
            self.assertEqual(self.post().status_code, 429)

    def test_provider_disabled_leaves_credit_untouched(self):
        with patch.object(routes, "image_generation_configured", lambda: False):
            self.assertEqual(self.post().status_code, 503)
        self.assertEqual(self.credit.remaining, 100)
        self.assertEqual(self.service.calls, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
