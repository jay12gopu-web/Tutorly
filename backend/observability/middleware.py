from __future__ import annotations

import asyncio
from time import perf_counter

from fastapi import Request

from .context import current_error_code, new_request_id, reset_request_id, set_error_code, set_request_id
from .store import observability_store


def _service(path: str) -> str:
    for marker, service in (("/auth", "auth"), ("/vision", "vision"), ("/voice", "voice"),
                            ("/transcribe", "voice"), ("/chat", "chat"), ("/test", "tests"),
                            ("/quest", "quests"), ("/payment", "payments"), ("/curriculum", "curriculum")):
        if marker in path.lower():
            return service
    return "backend"


def _error_code(status: int) -> str | None:
    return {401: "AUTHENTICATION_FAILURE", 403: "PERMISSION_DENIED", 429: "RATE_LIMIT",
            502: "PROVIDER_ERROR", 503: "SERVICE_UNAVAILABLE", 504: "PROVIDER_TIMEOUT"}.get(status,
            f"HTTP_{status}" if status >= 400 else None)


async def observability_middleware(request: Request, call_next):
    request_id = new_request_id()
    token = set_request_id(request_id)
    set_error_code(None)
    request.state.request_id = request_id
    started = perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        latency_ms = round((perf_counter() - started) * 1000)
        if request.url.path not in {"/health", "/favicon.ico"} and not request.url.path.startswith("/uploads/"):
            message = None if status < 400 else "Request failed safely; use the request ID for investigation."
            await asyncio.to_thread(observability_store.record_request, method=request.method,
                                    endpoint=request.url.path, status_code=status, latency_ms=latency_ms,
                                    service=_service(request.url.path), error_code=current_error_code() or _error_code(status),
                                    safe_message=message, request_id=request_id)
        reset_request_id(token)
