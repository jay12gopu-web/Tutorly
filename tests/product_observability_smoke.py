"""Real route/middleware contracts with offline providers and an isolated auth DB."""
from __future__ import annotations

import asyncio
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

from backend import auth_routes
from backend.chatbot import routes
from backend.chatbot.schemas import ChatbotResponse, StreamEvent
from backend.observability.context import current_request_id, set_error_code, set_product_service
from backend.observability.middleware import observability_middleware
from backend.observability.store import _safe_id, observability_store


class ProductObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.records = []
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        for target, value in (
            ("backend.auth_routes.DATABASE_PATH", Path(self.temporary.name) / "accounts.db"),
            ("backend.observability.store.observability_store.record_request", self.capture),
            ("backend.observability.store.observability_store.record_provider", lambda **_values: None),
            ("backend.chatbot.routes.enforce_chat_rate_limit", lambda _request: None),
            ("backend.chatbot.routes.orchestrator.respond", self.reply),
            ("backend.chatbot.routes.orchestrator.stream", self.stream),
        ):
            change = patch(target, value)
            change.start()
            self.addCleanup(change.stop)
        self.app = FastAPI()
        self.app.middleware("http")(observability_middleware)
        self.app.include_router(routes.router)
        self.app.include_router(auth_routes.router)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def capture(self, **record):
        self.records.append(record)

    async def reply(self, request):
        await asyncio.sleep(0)
        return ChatbotResponse(
            conversation_id="private-conversation", mode=request.mode, subject="science", answer="private answer",
            analytics={"subject": "science", "difficulty": "school", "confidence": 1.0},
            metadata={"generation": {"provider": "groq", "status": "generated"}},
        )

    async def stream(self, _request):
        yield StreamEvent(stage="final_response", message="private streaming answer", done=True)

    def test_study_and_general_chat_are_separate_without_private_fields(self):
        for route, mode, service in (("/api/chat", "study", "study_bot"),
                                     ("/api/chatbot/respond", "prime", "chat"),
                                     ("/api/chatbot/stream", "study", "study_bot")):
            response = self.client.post(route, json={
                "mode": mode, "message": "private homework question", "user_id": "private-person",
                "conversation_id": "private-conversation", "client_context": {
                    "service": "injected label", "study_session": {"topic": "private topic", "plan_id": "private-plan"},
                },
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.records[-1]["service"], service)
            self.assertEqual(self.records[-1]["method"], "POST")
            self.assertEqual(self.records[-1]["request_id"], response.headers["X-Request-ID"])
        recorded = str(self.records)
        for secret in ("private", "injected", "study_session", "plan_id"):
            self.assertNotIn(secret, recorded)

    def test_unvalidated_mode_cannot_create_arbitrary_service(self):
        response = self.client.post("/api/chat", json={"mode": "private student name", "message": "private text"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.records[-1]["service"], "chat")
        self.assertNotIn("private", str(self.records))

    def test_teacher_onboarding_tag_survives_sync_threadpool(self):
        for role, expected in (("teacher", "human_tutor"), ("student", "auth")):
            response = self.client.post("/api/auth/onboarding", json={"role": role, "full_name": "Private Name"})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(self.records[-1]["service"], expected)
        denied = self.client.post("/api/auth/onboarding", json={"role": "admin", "full_name": "Private Name"})
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(self.records[-1]["service"], "auth")
        self.assertNotIn("Private Name", str(self.records))

    def test_teacher_routes_keep_authorization_and_no_degree_content(self):
        for method, route, options in (
            ("PUT", "/api/auth/teacher-profile", {"json": {}}),
            ("PUT", "/api/auth/teacher-degree", {"content": b"private document"}),
            ("GET", "/api/auth/teacher-degree", {}),
            ("DELETE", "/api/auth/teacher-degree", {}),
        ):
            response = self.client.request(method, route, **options)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(self.records[-1]["service"], "human_tutor")
            self.assertEqual(self.records[-1]["method"], method)
        self.assertNotIn("private document", str(self.records))

    def test_dynamic_paths_query_strings_and_unmatched_urls_are_not_stored(self):
        @self.app.get("/api/test/{account_id}")
        def matched(account_id: str):
            return {"ok": True}

        self.client.get("/api/test/private-person?token=private-token")
        self.assertEqual(self.records[-1]["endpoint"], "/api/test/{account_id}")
        self.assertEqual(_safe_id(self.records[-1]["endpoint"], 240), "/api/test/{account_id}")
        self.client.get("/private-password-and-chat-content?email=private@example.test")
        self.assertEqual(self.records[-1]["endpoint"], "/unmatched")
        self.assertEqual(self.records[-1]["status_code"], 404)
        self.assertNotIn("private", str(self.records))

    def test_handler_error_and_whitelisted_tag_reach_outer_middleware(self):
        @self.app.get("/api/vision/probe")
        def failure():
            set_product_service("private student name")
            set_error_code("RATE_LIMIT")
            raise HTTPException(502, "private upstream response")

        response = self.client.get("/api/vision/probe")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(self.records[-1]["service"], "vision")
        self.assertEqual(self.records[-1]["error_code"], "RATE_LIMIT")
        self.client.get("/api/voice/config")
        self.assertEqual(self.records[-1]["service"], "voice")
        self.assertIsNone(self.records[-1]["error_code"])

    def test_concurrent_requests_do_not_mix_ids_or_product_tags(self):
        async def exercise():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://testserver") as client:
                return await asyncio.gather(*[
                    client.post("/api/chat", json={"mode": mode, "message": "private homework"})
                    for mode in ("study", "prime", "study", "prime")
                ])

        responses = asyncio.run(exercise())
        by_id = {row["request_id"]: row for row in self.records}
        self.assertEqual(len(by_id), 4)
        for response, expected in zip(responses, ("study_bot", "chat", "study_bot", "chat")):
            self.assertEqual(response.status_code, 200)
            self.assertEqual(by_id[response.headers["X-Request-ID"]]["service"], expected)

    def test_public_capabilities_report_coverage_without_fake_provider_health(self):
        response = self.client.get("/api/chatbot/health")
        self.assertEqual(response.status_code, 200)
        coverage = response.json()["observability"]
        self.assertEqual(coverage["version"], 2)
        self.assertEqual(coverage["collection"], "http_requests")
        self.assertIn("study_bot", coverage["services"])
        self.assertIn("human_tutor", coverage["services"])
        self.assertFalse(coverage["websocket"])
        self.assertIsInstance(coverage["storage_configured"], bool)
        self.assertNotIn("healthy", str(coverage))


if __name__ == "__main__":
    unittest.main()
