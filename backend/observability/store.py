from __future__ import annotations

import logging
import os
import re
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from .context import current_request_id
from .logging import sanitize


LOGGER = logging.getLogger("tutorly.observability")
_IDENTIFIER = re.compile(r"[^a-zA-Z0-9_./:-]+")

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS tutorly_request_logs (
        request_id VARCHAR(100) PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL,
        level VARCHAR(10) NOT NULL, service VARCHAR(50) NOT NULL, method VARCHAR(10) NOT NULL,
        endpoint VARCHAR(240) NOT NULL, status_code INTEGER NOT NULL, latency_ms BIGINT NOT NULL,
        error_code VARCHAR(100), safe_message VARCHAR(500))""",
    """CREATE TABLE IF NOT EXISTS tutorly_provider_events (
        id VARCHAR(100) PRIMARY KEY, request_id VARCHAR(100), provider VARCHAR(50) NOT NULL,
        operation VARCHAR(80) NOT NULL, status VARCHAR(20) NOT NULL, latency_ms BIGINT,
        error_code VARCHAR(100), created_at TIMESTAMPTZ NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS tutorly_admin_audit (
        id VARCHAR(100) PRIMARY KEY, admin_user_id VARCHAR(150) NOT NULL,
        action VARCHAR(100) NOT NULL, safe_metadata VARCHAR(500), created_at TIMESTAMPTZ NOT NULL)""",
    "CREATE INDEX IF NOT EXISTS idx_request_logs_created_desc ON tutorly_request_logs (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_request_logs_level ON tutorly_request_logs (level)",
    "CREATE INDEX IF NOT EXISTS idx_request_logs_service ON tutorly_request_logs (service)",
    "CREATE INDEX IF NOT EXISTS idx_provider_events_created_desc ON tutorly_provider_events (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_admin_audit_created_desc ON tutorly_admin_audit (created_at DESC)",
)


def _safe_id(value: object, limit: int) -> str:
    return _IDENTIFIER.sub("_", str(value or "").strip())[:limit]


class ObservabilityStore:
    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = (database_url if database_url is not None else os.getenv("DATABASE_URL", "")).strip()
        self._ready = False
        self._lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        import psycopg
        return psycopg.connect(self.database_url, connect_timeout=8)

    def _ensure_schema(self, connection) -> None:
        if self._ready:
            return
        with self._lock:
            if self._ready:
                return
            with connection.cursor() as cursor:
                for statement in SCHEMA:
                    cursor.execute(statement)
                now = datetime.now(timezone.utc)
                cursor.execute("DELETE FROM tutorly_request_logs WHERE level = 'INFO' AND created_at < %s", (now - timedelta(days=7),))
                cursor.execute("DELETE FROM tutorly_request_logs WHERE level IN ('WARN','ERROR') AND created_at < %s", (now - timedelta(days=30),))
                cursor.execute("DELETE FROM tutorly_provider_events WHERE created_at < %s", (now - timedelta(days=30),))
            self._ready = True

    def _write(self, operation: Callable[[Any], Any]) -> Any | None:
        if not self.configured:
            return None
        try:
            with self._connect() as connection:
                self._ensure_schema(connection)
                result = operation(connection)
                connection.commit()
                return result
        except Exception as error:
            LOGGER.warning("telemetry_write_failed error_type=%s", type(error).__name__)
            return None

    def record_request(self, *, method: str, endpoint: str, status_code: int, latency_ms: int,
                       service: str, error_code: str | None = None, safe_message: str | None = None,
                       request_id: str | None = None) -> None:
        request_id = _safe_id(request_id or current_request_id(), 100)
        status_code = int(status_code)
        level = "ERROR" if status_code >= 500 else "WARN" if status_code >= 400 else "INFO"
        now = datetime.now(timezone.utc)
        def operation(connection):
            with connection.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO tutorly_request_logs
                       (request_id, created_at, level, service, method, endpoint, status_code, latency_ms, error_code, safe_message)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (request_id) DO NOTHING""",
                    (request_id, now, level, _safe_id(service, 50) or "backend", _safe_id(method, 10),
                     _safe_id(endpoint, 240) or "/", status_code, max(0, int(latency_ms)),
                     _safe_id(error_code, 100) or None, sanitize(safe_message, 500) or None),
                )
        self._write(operation)

    def record_provider(self, *, provider: str, operation: str, status: str, latency_ms: int | None,
                        error_code: str | None = None, request_id: str | None = None) -> None:
        now = datetime.now(timezone.utc)
        def write(connection):
            with connection.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO tutorly_provider_events
                       (id, request_id, provider, operation, status, latency_ms, error_code, created_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (f"provider_{uuid.uuid4().hex}", _safe_id(request_id or current_request_id(), 100),
                     _safe_id(provider, 50) or "unknown", _safe_id(operation, 80) or "request",
                     _safe_id(status, 20) or "failed", None if latency_ms is None else max(0, int(latency_ms)),
                     _safe_id(error_code, 100) or None, now),
                )
        self._write(write)


observability_store = ObservabilityStore()
