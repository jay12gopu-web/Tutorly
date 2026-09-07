from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend.observability.logging import sanitize
from backend.observability.middleware import observability_middleware
from backend.observability.store import observability_store


def main() -> None:
    captured: list[dict] = []
    original = observability_store.record_request
    observability_store.record_request = lambda **values: captured.append(values)
    try:
        app = FastAPI()
        app.middleware("http")(observability_middleware)

        @app.get("/api/test")
        def ok():
            return {"ok": True}

        @app.get("/api/vision/fail")
        def failed():
            raise HTTPException(status_code=504, detail="private upstream detail")

        client = TestClient(app)
        response = client.get("/api/test")
        assert response.status_code == 200
        assert response.headers["X-Request-ID"].startswith("req_")
        failure = client.get("/api/vision/fail")
        assert failure.status_code == 504
        assert failure.headers["X-Request-ID"].startswith("req_")
        assert captured[0]["status_code"] == 200
        assert captured[1]["service"] == "vision"
        assert captured[1]["error_code"] == "PROVIDER_TIMEOUT"
        assert "private upstream detail" not in str(captured)
        redacted = sanitize("password=hunter2 Authorization: Bearer abc.def gsk_secret student@example.com")
        assert "hunter2" not in redacted and "abc.def" not in redacted and "gsk_secret" not in redacted
        assert "student@example.com" not in redacted
    finally:
        observability_store.record_request = original

    print("Tutorly request IDs, privacy-safe structured logging, and provider error classification checks passed.")


if __name__ == "__main__":
    main()
