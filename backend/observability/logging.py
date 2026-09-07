from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone


_SENSITIVE = re.compile(
    r"(?i)(authorization\s*[:=]\s*bearer\s+\S+|bearer\s+\S+|gsk_[a-z0-9_-]+|sk-[a-z0-9_-]+|"
    r"(?:api[_-]?key|password|secret|token|cookie|authorization)\s*[:=]\s*\S+)"
)
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def sanitize(value: object, limit: int = 500) -> str:
    text = str(value or "").replace("\x00", "")
    text = _SENSITIVE.sub("[REDACTED]", text)
    text = _EMAIL.sub("[REDACTED_EMAIL]", text)
    return text[:limit]


class SafeJsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname if record.levelname in {"INFO", "WARN", "WARNING", "ERROR"} else "INFO",
            "service": sanitize(record.name, 80),
            "message": sanitize(record.getMessage()),
        }
        return json.dumps(payload, separators=(",", ":"))


def configure_structured_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_tutorly_structured", False):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(SafeJsonFormatter())
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    root._tutorly_structured = True
