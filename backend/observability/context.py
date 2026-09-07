from __future__ import annotations

import contextvars
import uuid


_request_id: contextvars.ContextVar[str] = contextvars.ContextVar("tutorly_request_id", default="")
_error_code: contextvars.ContextVar[str] = contextvars.ContextVar("tutorly_error_code", default="")


def new_request_id() -> str:
    return f"req_{uuid.uuid4().hex}"


def set_request_id(value: str):
    return _request_id.set(value)


def reset_request_id(token) -> None:
    _request_id.reset(token)


def current_request_id() -> str:
    return _request_id.get() or new_request_id()


def set_error_code(value: str | None) -> None:
    _error_code.set(str(value or "")[:100])


def current_error_code() -> str:
    return _error_code.get()
