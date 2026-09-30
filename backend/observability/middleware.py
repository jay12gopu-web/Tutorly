from __future__ import annotations

import asyncio
from time import perf_counter

from fastapi import Request

from .context import (
    current_error_code, new_request_id, reset_request_attributes, reset_request_id,
    set_error_code, set_request_attributes, set_request_id,
)
from .store import observability_store


def _service(path: str) -> str:
    if path in {"/api/auth/teacher-profile", "/api/auth/teacher-degree"}:
        return "human_tutor"
    if path in {"/chat", "/chat-feedback"}:
        return "chat"
    if path == "/upload-image":
        return "vision"
    for marker, service in (("/api/auth", "auth"), ("/api/vision", "vision"), ("/api/voice", "voice"),
                            ("/api/transcribe", "voice"), ("/api/chat", "chat"), ("/api/chatbot", "chat"),
                            ("/api/images", "images"), ("/api/tests", "tests"), ("/api/quests", "quests"),
                            ("/api/payments", "payments"), ("/api/curriculum", "curriculum")):
        if path == marker or path.startswith(marker + "/"):
            return service
    return "backend"


def _endpoint(request: Request) -> str:
    # The matched template is developer-owned. Raw URLs may contain account IDs,
    # filenames or secrets even when query strings have been excluded.
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    return template if isinstance(template, str) and template.startswith("/") else "/unmatched"


def _error_code(status: int) -> str | None:
    return {401: "AUTHENTICATION_FAILURE", 403: "PERMISSION_DENIED", 429: "RATE_LIMIT",
            502: "PROVIDER_ERROR", 503: "SERVICE_UNAVAILABLE", 504: "PROVIDER_TIMEOUT"}.get(status,
            f"HTTP_{status}" if status >= 400 else None)


async def observability_middleware(request: Request, call_next):
    request_id = new_request_id()
    token = set_request_id(request_id)
    attributes: dict[str, str] = {}
    attributes_token = set_request_attributes(attributes)
    set_error_code(None)
    request.state.request_id = request_id
    request.state.observability = attributes
    started = perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        latency_ms = round((perf_counter() - started) * 1000)
        try:
            if request.url.path not in {"/health", "/favicon.ico"} and not request.url.path.startswith("/uploads/"):
                endpoint = _endpoint(request)
                message = None if status < 400 else "Request failed safely; use the request ID for investigation."
                await asyncio.to_thread(observability_store.record_request, method=request.method,
                                        endpoint=endpoint, status_code=status, latency_ms=latency_ms,
                                        service=attributes.get("service") or _service(endpoint),
                                        error_code=current_error_code() or _error_code(status),
                                        safe_message=message, request_id=request_id)
        finally:
            reset_request_attributes(attributes_token)
            reset_request_id(token)
