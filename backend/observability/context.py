from __future__ import annotations

import contextvars
import uuid


_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("tutorly_request_id", default="")
_error_code: contextvars.ContextVar[str] = contextvars.ContextVar("tutorly_error_code", default="")
_request_attributes: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar(
    "tutorly_request_attributes", default=None,
)
_SERVICES = frozenset({
    "backend", "auth", "chat", "study_bot", "human_tutor", "images", "voice", "vision",
    "curriculum", "quests", "tests", "payments",
})


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex}"


def set_request_id(value: str):
    return _request_id.set(value)


def reset_request_id(token) -> None:
    _request_id.reset(token)


def current_request_id() -> str:
    return _request_id.get() or new_request_id()


def set_error_code(value: str | None) -> None:
    value = str(value or "")[:100]
    _error_code.set(value)
    attributes = _request_attributes.get()
    if attributes is not None:
        attributes["error_code"] = value


def current_error_code() -> str:
    attributes = _request_attributes.get()
    if attributes is not None:
        return attributes.get("error_code", "")
    return _error_code.get()


def set_request_attributes(attributes: dict[str, str]):
    # Share one bounded object with the route/threadpool. BaseHTTPMiddleware does
    # not propagate scalar ContextVar changes from handlers back to middleware.
    return _request_attributes.set(attributes)


def reset_request_attributes(token) -> None:
    _request_attributes.reset(token)


def set_product_service(service: str) -> None:
    """Accept only a fixed operational category, never student-supplied labels."""
    attributes = _request_attributes.get()
    if attributes is not None and service in _SERVICES:
        attributes["service"] = service
