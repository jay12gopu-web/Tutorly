"""Compatibility adapter for privacy-safe operational telemetry.

Legacy callers keep their current function signatures, but message text, answers,
student IDs, grade, feedback, transcripts and images are deliberately ignored.
"""
from __future__ import annotations

import re
import uuid

try:
    from backend.observability import current_request_id, observability_store
except ImportError:
    from observability import current_request_id, observability_store


def _status(value: str) -> str:
    return "success" if str(value or "").lower() in {"generated", "success", "succeeded", "completed"} else "failed"


def _error_code(value: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9_]+", "_", str(value or "").upper()).strip("_")
    return (cleaned or "BACKEND_ERROR")[:100]


class ActivityStore:
    """Records anonymous provider outcomes only; never student content or identity."""

    @property
    def configured(self) -> bool:
        return observability_store.configured

    def record_chat(self, *, provider: str, provider_status: str, latency_ms: int, **_private_fields) -> str | None:
        status = _status(provider_status)
        observability_store.record_provider(
            provider=provider, operation="chat_completion", status=status, latency_ms=latency_ms,
            error_code=None if status == "success" else _error_code(f"AI_PROVIDER_{provider_status}"),
        )
        return current_request_id()

    def record_failure(self, *, provider: str, error_code: str, latency_ms: int, **_private_fields) -> None:
        observability_store.record_provider(
            provider=provider, operation="chat_completion", status="failed", latency_ms=latency_ms,
            error_code=_error_code(error_code),
        )

    def record_provider(self, *, provider: str, operation: str, status: str, latency_ms: int | None,
                        error_code: str | None = None) -> None:
        observability_store.record_provider(provider=provider, operation=operation, status=status,
                                            latency_ms=latency_ms, error_code=_error_code(error_code) if error_code else None)

    def record_feedback(self, **_private_fields) -> str:
        # Feedback remains in Tutorly's product system; observability stores only
        # the anonymous HTTP request count via middleware.
        return f"feedback_{uuid.uuid4().hex}"


activity_store = ActivityStore()
