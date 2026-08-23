from __future__ import annotations

import os
import re
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Callable


SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS tutorly_users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(150),
        display_name VARCHAR(200),
        grade VARCHAR(50),
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_active_at TIMESTAMPTZ
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutorly_chats (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        subject VARCHAR(80),
        tutorly_mode VARCHAR(80),
        ai_model VARCHAR(150),
        question TEXT,
        answer TEXT,
        response_status VARCHAR(30),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutorly_feedback (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        chat_id VARCHAR(100),
        feedback_type VARCHAR(40) NOT NULL,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutorly_ai_requests (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        chat_id VARCHAR(100),
        provider VARCHAR(80),
        model VARCHAR(150),
        status VARCHAR(30) NOT NULL,
        latency_ms BIGINT,
        endpoint VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutorly_errors (
        id VARCHAR(100) PRIMARY KEY,
        error_code VARCHAR(100) NOT NULL,
        category VARCHAR(80),
        route VARCHAR(200),
        user_id VARCHAR(100),
        http_status INTEGER,
        safe_message VARCHAR(1000),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutorly_activity_logs (
        id VARCHAR(100) PRIMARY KEY,
        level VARCHAR(20) NOT NULL,
        event_type VARCHAR(80) NOT NULL,
        actor VARCHAR(150),
        safe_message VARCHAR(1000),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_users_created_desc ON tutorly_users (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_users_active_desc ON tutorly_users (last_active_at DESC NULLS LAST)",
    "CREATE INDEX IF NOT EXISTS idx_chats_created_desc ON tutorly_chats (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_feedback_created_desc ON tutorly_feedback (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ai_requests_created_desc ON tutorly_ai_requests (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_errors_created_desc ON tutorly_errors (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_activity_created_desc ON tutorly_activity_logs (created_at DESC)",
)


def _text(value: Any, limit: int) -> str:
    return str(value or "").replace("\x00", "").strip()[:limit]


def _ai_status(provider_status: str) -> str:
    return "success" if provider_status.lower() in {"generated", "success", "succeeded", "completed"} else "failed"


def _feedback_type(value: str) -> str:
    return {
        "up": "positive",
        "understood": "helpful",
        "down": "negative",
        "confused": "unhelpful",
        "simpler": "user_correction",
        "examples": "user_correction",
    }.get(value.lower(), _text(value, 40) or "unknown")


def _error_code(value: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9_]+", "_", value.upper()).strip("_")
    return (cleaned or "BACKEND_ERROR")[:100]


class ActivityStore:
    """Best-effort writes to the privacy-minimized Tutorly admin schema.

    Operational storage must never make a student answer fail. Connection errors
    are logged only by exception type so credentials and connection URLs cannot
    leak into application logs.
    """

    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = (database_url if database_url is not None else os.getenv("DATABASE_URL", "")).strip()
        self._schema_ready = False
        self._schema_lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.database_url)

    def _connect(self):
        import psycopg

        return psycopg.connect(self.database_url, connect_timeout=8)

    def _ensure_schema(self, connection) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if self._schema_ready:
                return
            with connection.cursor() as cursor:
                for statement in SCHEMA_STATEMENTS:
                    cursor.execute(statement)
            self._schema_ready = True

    def _write(self, operation: Callable[[Any], Any]) -> Any | None:
        if not self.configured:
            return None
        try:
            with self._connect() as connection:
                self._ensure_schema(connection)
                connection.commit()
                result = operation(connection)
                connection.commit()
                return result
        except Exception as error:
            print(f"[Tutorly][activity-store] write failed type={type(error).__name__}")
            return None

    @staticmethod
    def _upsert_user(cursor, *, user_id: str, grade: str, now: datetime) -> None:
        cursor.execute(
            """
            INSERT INTO tutorly_users (id, username, grade, status, created_at, last_active_at)
            VALUES (%s, %s, %s, 'active', %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                grade = COALESCE(NULLIF(EXCLUDED.grade, ''), tutorly_users.grade),
                status = 'active',
                last_active_at = EXCLUDED.last_active_at
            """,
            (user_id, user_id, grade or None, now, now),
        )

    def record_chat(
        self,
        *,
        user_id: str,
        grade: str,
        question: str,
        answer: str,
        subject: str,
        mode: str,
        provider: str,
        model: str,
        provider_status: str,
        latency_ms: int,
        endpoint: str = "/api/chat",
    ) -> str | None:
        chat_id = f"chat_{uuid.uuid4().hex}"
        request_id = f"req_{uuid.uuid4().hex}"
        log_id = f"log_{uuid.uuid4().hex}"
        error_id = f"err_{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)
        safe_user = _text(user_id, 100) or "guest"
        safe_status = _ai_status(provider_status)

        def operation(connection):
            with connection.cursor() as cursor:
                self._upsert_user(cursor, user_id=safe_user, grade=_text(grade, 50), now=now)
                cursor.execute(
                    """
                    INSERT INTO tutorly_chats
                        (id, user_id, subject, tutorly_mode, ai_model, question, answer,
                         response_status, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        chat_id, safe_user, _text(subject, 80) or "Other", _text(mode, 80),
                        _text(model, 150), _text(question, 20000), _text(answer, 100000),
                        safe_status, now, now,
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO tutorly_ai_requests
                        (id, user_id, chat_id, provider, model, status, latency_ms, endpoint, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        request_id, safe_user, chat_id, _text(provider, 80), _text(model, 150),
                        safe_status, max(0, int(latency_ms)), _text(endpoint, 200), now,
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO tutorly_activity_logs
                        (id, level, event_type, actor, safe_message, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        log_id, "INFO" if safe_status == "success" else "WARN", "CHAT_COMPLETED",
                        safe_user, f"{_text(subject, 80) or 'Other'} chat {safe_status}", now,
                    ),
                )
                if safe_status != "success":
                    cursor.execute(
                        """
                        INSERT INTO tutorly_errors
                            (id, error_code, category, route, user_id, http_status, safe_message, created_at)
                        VALUES (%s, %s, 'ai_provider', %s, %s, 503, %s, %s)
                        """,
                        (
                            error_id, _error_code(f"AI_PROVIDER_{provider_status}"), _text(endpoint, 200),
                            safe_user, "The AI request did not complete successfully.", now,
                        ),
                    )
            return chat_id

        return self._write(operation)

    def record_failure(
        self,
        *,
        user_id: str,
        grade: str,
        provider: str,
        model: str,
        error_code: str,
        http_status: int,
        latency_ms: int,
        endpoint: str = "/api/chat",
    ) -> None:
        request_id = f"req_{uuid.uuid4().hex}"
        error_id = f"err_{uuid.uuid4().hex}"
        log_id = f"log_{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)
        safe_user = _text(user_id, 100) or "guest"

        def operation(connection):
            with connection.cursor() as cursor:
                self._upsert_user(cursor, user_id=safe_user, grade=_text(grade, 50), now=now)
                cursor.execute(
                    """
                    INSERT INTO tutorly_ai_requests
                        (id, user_id, provider, model, status, latency_ms, endpoint, created_at)
                    VALUES (%s, %s, %s, %s, 'failed', %s, %s, %s)
                    """,
                    (request_id, safe_user, _text(provider, 80), _text(model, 150), max(0, int(latency_ms)), _text(endpoint, 200), now),
                )
                cursor.execute(
                    """
                    INSERT INTO tutorly_errors
                        (id, error_code, category, route, user_id, http_status, safe_message, created_at)
                    VALUES (%s, %s, 'backend', %s, %s, %s, %s, %s)
                    """,
                    (error_id, _error_code(error_code), _text(endpoint, 200), safe_user, int(http_status), "The chat request failed.", now),
                )
                cursor.execute(
                    """
                    INSERT INTO tutorly_activity_logs
                        (id, level, event_type, actor, safe_message, created_at)
                    VALUES (%s, 'ERROR', 'CHAT_FAILED', %s, %s, %s)
                    """,
                    (log_id, safe_user, _error_code(error_code), now),
                )

        self._write(operation)

    def record_feedback(
        self,
        *,
        user_id: str,
        chat_id: str | None,
        conversation_id: str | None,
        feedback_type: str,
    ) -> str | None:
        feedback_id = f"feedback_{uuid.uuid4().hex}"
        log_id = f"log_{uuid.uuid4().hex}"
        now = datetime.now(timezone.utc)
        safe_user = _text(user_id, 100) or "guest"
        safe_chat = _text(chat_id or conversation_id, 100) or None
        normalized = _feedback_type(feedback_type)

        def operation(connection):
            with connection.cursor() as cursor:
                self._upsert_user(cursor, user_id=safe_user, grade="", now=now)
                cursor.execute(
                    """
                    INSERT INTO tutorly_feedback (id, user_id, chat_id, feedback_type, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (feedback_id, safe_user, safe_chat, normalized, now),
                )
                cursor.execute(
                    """
                    INSERT INTO tutorly_activity_logs
                        (id, level, event_type, actor, safe_message, created_at)
                    VALUES (%s, 'INFO', 'FEEDBACK_RECEIVED', %s, %s, %s)
                    """,
                    (log_id, safe_user, normalized, now),
                )
            return feedback_id

        return self._write(operation)


activity_store = ActivityStore()
