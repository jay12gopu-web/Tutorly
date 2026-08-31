from __future__ import annotations

import asyncio
import io
import os
import sys
import zipfile
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient


PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend.chatbot.sarvam_vision import (
    SarvamVisionError,
    SarvamVisionService,
    VisionExtraction,
    clean_document_text,
    normalize_document_language,
)


def output_archive(markdown: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("document.md", markdown.encode("utf-8"))
        archive.writestr("manifest.json", b'{}')
    return buffer.getvalue()


async def extract_with_mock(markdown: str, language: str = "en-IN"):
    archive = output_archive(markdown)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        if request.url.path == "/doc-ai/v1/job/digitise":
            assert request.headers["api-subscription-key"] == "server-only-test-key"
            assert "multipart/form-data" in request.headers["content-type"]
            body = request.content
            assert b'name="file"' in body
            assert b'name="language"' in body
            return httpx.Response(201, json={"job_id": "job_test_123", "status": "pending"})
        if request.url.path == "/doc-ai/v1/job/job_test_123/status":
            return httpx.Response(200, json={"job_id": "job_test_123", "status": "completed"})
        if request.url.path == "/doc-ai/v1/job/job_test_123/download-url":
            return httpx.Response(200, json={"method": "GET", "url": "https://download.sarvam.test/result.zip"})
        if request.url.host == "download.sarvam.test":
            return httpx.Response(200, content=archive, headers={"content-type": "application/zip"})
        return httpx.Response(404)

    service = SarvamVisionService(
        api_base="https://api.sarvam.test",
        timeout_seconds=5,
        poll_interval_seconds=0,
        transport=httpx.MockTransport(handler),
    )
    result = await service.extract(
        image=b"not-real-image-bytes",
        filename="worksheet.jpg",
        mime_type="image/jpeg",
        language=language,
    )
    assert calls == [
        "POST /doc-ai/v1/job/digitise",
        "GET /doc-ai/v1/job/job_test_123/status",
        "GET /doc-ai/v1/job/job_test_123/download-url",
        "GET /result.zip",
    ]
    return result


async def check_documents() -> None:
    english = "Q1. Read the passage.\n(a) Who is the speaker?\n(b) What happens next?"
    english_result = await extract_with_mock(english)
    assert english_result.text == english

    mathematics = (
        "Q1. Simplify $\\frac{-8}{2\\cdot2}$.\n\n"
        "| Step | Working |\n|---|---|\n| 1 | $2\\cdot2=4$ |\n| 2 | $-8/4=-2$ |"
    )
    mathematics_result = await extract_with_mock(mathematics)
    assert mathematics_result.text == mathematics
    assert "\\frac" in mathematics_result.text and "\\cdot" in mathematics_result.text

    indic = "प्रश्न १: सही उत्तर लिखिए।\n(क) जल क्या है?\n\nప్రశ్న 2: సమాధానం రాయండి."
    hindi_result = await extract_with_mock(indic, "hi-IN")
    telugu_result = await extract_with_mock(indic, "te-IN")
    assert hindi_result.language == "hi-IN" and telugu_result.language == "te-IN"
    assert hindi_result.text == indic and telugu_result.text == indic

    multi_question = "Q1\n(a) One\n(b) Two\n(c) Three\n\nQ2\n(i) Four\n(ii) Five"
    multi_result = await extract_with_mock(multi_question)
    assert multi_result.text.splitlines() == multi_question.splitlines()


async def check_failures() -> None:
    def blank_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/digitise"):
            return httpx.Response(201, json={"job_id": "blank", "status": "completed"})
        if request.url.path.endswith("/download-url"):
            return httpx.Response(200, json={"url": "https://download.sarvam.test/blank.zip", "method": "GET"})
        return httpx.Response(200, content=output_archive(" \n\n "))

    blank_service = SarvamVisionService(
        api_base="https://api.sarvam.test",
        timeout_seconds=5,
        poll_interval_seconds=0,
        transport=httpx.MockTransport(blank_handler),
    )
    try:
        await blank_service.extract(
            image=b"blurry",
            filename="blurry.jpg",
            mime_type="image/jpeg",
            language="en-IN",
        )
        raise AssertionError("Blank OCR output should fail so the browser can use its fallback")
    except SarvamVisionError as error:
        assert error.status == "no_text"

    def failure_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"code": "provider_unavailable"}})

    failed_service = SarvamVisionService(
        api_base="https://api.sarvam.test",
        timeout_seconds=5,
        poll_interval_seconds=0,
        transport=httpx.MockTransport(failure_handler),
    )
    try:
        await failed_service.extract(
            image=b"worksheet",
            filename="worksheet.png",
            mime_type="image/png",
            language="en-IN",
        )
        raise AssertionError("Provider failure should reach the browser fallback")
    except SarvamVisionError as error:
        assert error.status == "provider_unavailable"


def check_static_wiring() -> None:
    app_source = (PROJECT_DIR / "js" / "app.js").read_text(encoding="utf-8")
    routes_source = (PROJECT_DIR / "backend" / "chatbot" / "routes.py").read_text(encoding="utf-8")
    env_example = (PROJECT_DIR / ".env.example").read_text(encoding="utf-8")

    assert 'getBackendEndpoint("/api/vision/extract")' in app_source
    assert "extractImageTextWithSarvam(ocrFile)" in app_source
    assert "Online reading unavailable. Trying the backup reader" in app_source
    assert 'Tesseract.recognize(ocrFile, "eng"' in app_source
    assert '@router.post("/vision/extract")' in routes_source
    assert "SARVAM_API_KEY=" in env_example
    assert "SARVAM_API_KEY" not in app_source
    assert "credit" not in routes_source[routes_source.index('@router.post("/vision/extract")'):routes_source.index('@router.options("/chat")')].lower()


def check_endpoint() -> None:
    from backend.chatbot import routes as chatbot_routes

    class SuccessfulVision:
        async def extract(self, **kwargs):
            assert kwargs["mime_type"] == "image/jpeg"
            assert kwargs["language"] == "te-IN"
            return VisionExtraction(
                text="ప్రశ్న 1\n(a) సమాధానం",
                language="te-IN",
                job_id="endpoint_job",
            )

    class FailedVision:
        async def extract(self, **kwargs):
            raise SarvamVisionError("provider_unavailable")

    application = FastAPI()
    application.include_router(chatbot_routes.router)
    client = TestClient(application)
    original_service = chatbot_routes.sarvam_vision
    try:
        chatbot_routes.sarvam_vision = SuccessfulVision()
        response = client.post(
            "/api/vision/extract",
            files={"image": ("worksheet.jpg", b"jpeg-bytes", "image/jpeg")},
            data={"language": "te-IN", "session_id": "vision-test-success"},
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "text": "ప్రశ్న 1\n(a) సమాధానం",
            "language": "te-IN",
            "provider": "sarvam-vision",
            "partial": False,
        }

        chatbot_routes.sarvam_vision = FailedVision()
        failed = client.post(
            "/api/vision/extract",
            files={"image": ("worksheet.jpg", b"jpeg-bytes", "image/jpeg")},
            data={"language": "en-IN", "session_id": "vision-test-failure"},
        )
        assert failed.status_code == 502
        assert "backup image reader" in failed.json()["detail"]

        invalid = client.post(
            "/api/vision/extract",
            files={"image": ("worksheet.webp", b"webp-bytes", "image/webp")},
            data={"session_id": "vision-test-invalid"},
        )
        assert invalid.status_code == 400
    finally:
        chatbot_routes.sarvam_vision = original_service


def main() -> None:
    os.environ["SARVAM_API_KEY"] = "server-only-test-key"
    try:
        assert normalize_document_language("en-US") == "en-IN"
        assert normalize_document_language("hi") == "hi-IN"
        assert normalize_document_language("te-IN") == "te-IN"
        assert clean_document_text("Q1\r\n(a) A\x00\r\n(b) B") == "Q1\n(a) A\n(b) B"
        asyncio.run(check_documents())
        asyncio.run(check_failures())
        check_static_wiring()
        check_endpoint()
    finally:
        os.environ.pop("SARVAM_API_KEY", None)
    print("Tutorly Sarvam Vision OCR and client-fallback checks passed.")


if __name__ == "__main__":
    main()
