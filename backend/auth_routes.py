from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote, unquote, urlencode, urlsplit

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel

try:
    from backend.oauth_providers import OAuthProviderError, pkce_challenge, provider_configs
    from backend.voice_agents import voice_agent
except ImportError:
    from oauth_providers import OAuthProviderError, pkce_challenge, provider_configs
    from voice_agents import voice_agent


router = APIRouter(prefix="/api/auth", tags=["authentication"])
PROJECT_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = PROJECT_DIR / "tutor.db"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
OTP_TTL_SECONDS = 10 * 60
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
OTP_MAX_REQUESTS_PER_HOUR = 5
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
PASSWORD_ITERATIONS = 240_000
OAUTH_STATE_TTL_SECONDS = 10 * 60
OAUTH_RESULT_TTL_SECONDS = 2 * 60
OAUTH_MAX_STARTS_PER_HOUR = 30
DEGREE_MAX_BYTES = 5 * 1024 * 1024
LOGGER = logging.getLogger("tutorly.auth")


class EmailRequest(BaseModel):
    email: str


class OtpVerifyRequest(BaseModel):
    email: str
    code: str


class PasswordLoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str


class OAuthCompleteRequest(BaseModel):
    result_code: str


class AcademicProfileRequest(BaseModel):
    grade: str
    board: str
    school: str = ""
    full_name: str | None = None
    age: int | None = None


class OnboardingRequest(BaseModel):
    role: str
    full_name: str
    age: int | None = None
    grade: str | int | None = None
    board: str = ""
    school: str = ""
    subjects: list[str] = []
    boards: list[str] = []
    grade_min: int | None = None
    grade_max: int | None = None
    gender: str = ""
    teaching_personality: list[str] = []
    preferred_days: list[str] = []
    preferred_start_time: str = ""
    preferred_end_time: str = ""
    consent: bool = False


class TeacherProfileRequest(BaseModel):
    full_name: str | None = None
    school: str | None = None
    subjects: list[str] | None = None
    boards: list[str] | None = None
    grade_min: int | None = None
    grade_max: int | None = None
    gender: str | None = None
    teaching_personality: list[str] | None = None
    preferred_days: list[str] | None = None
    preferred_start_time: str | None = None
    preferred_end_time: str | None = None


class VoicePreferenceRequest(BaseModel):
    preferred_voice_agent: str
    voice_onboarding_completed: bool = True


class PersonalizationRequest(BaseModel):
    teaching_style: str = "friendly"
    answer_detail: str = "balanced"
    learning_approach: str = "explain_first"
    use_examples: bool = True
    show_diagrams: bool = True
    show_formulas: bool = True
    suggest_follow_ups: bool = False
    quick_answers: bool = True
    language: str = "auto"
    voice_language: str = "auto"
    voice_intelligence: str = "standard"


DEFAULT_PERSONALIZATION = {
    "teaching_style": "friendly",
    "answer_detail": "balanced",
    "learning_approach": "explain_first",
    "use_examples": True,
    "show_diagrams": True,
    "show_formulas": True,
    "suggest_follow_ups": False,
    "quick_answers": True,
    "language": "auto",
    "voice_language": "auto",
    "voice_intelligence": "standard",
}
PERSONALIZATION_OPTIONS = {
    "teaching_style": {"friendly", "encouraging", "direct", "calm"},
    "answer_detail": {"short", "balanced", "detailed"},
    "learning_approach": {"explain_first", "step_by_step", "ask_questions", "challenge_me"},
    "language": {
        "auto", "en-US", "en-IN", "en-GB", "hi-IN", "te-IN", "ta-IN",
        "bn-IN", "mr-IN", "es-ES", "fr-FR", "de-DE",
    },
    "voice_language": {
        "auto", "en-US", "en-IN", "en-GB", "hi-IN", "te-IN", "ta-IN",
        "bn-IN", "mr-IN", "es-ES", "fr-FR", "de-DE",
    },
    "voice_intelligence": {"standard", "deep"},
}


@contextmanager
def _connection():
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript(
            """
        CREATE TABLE IF NOT EXISTS tutorly_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL DEFAULT '',
            password_hash TEXT,
            password_salt TEXT,
            role TEXT NOT NULL DEFAULT 'student',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tutorly_login_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            request_ip TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            consumed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_tutorly_otp_email_created
            ON tutorly_login_otps(email, created_at DESC);
        CREATE TABLE IF NOT EXISTS tutorly_auth_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
        );
        CREATE TABLE IF NOT EXISTS tutorly_social_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            provider_user_id TEXT NOT NULL,
            provider_email TEXT NOT NULL DEFAULT '',
            provider_email_verified INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            last_login_at INTEGER NOT NULL,
            UNIQUE(provider, provider_user_id),
            FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_tutorly_social_user
            ON tutorly_social_identities(user_id);
        CREATE TABLE IF NOT EXISTS tutorly_oauth_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state_hash TEXT NOT NULL UNIQUE,
            provider TEXT NOT NULL,
            flow TEXT NOT NULL,
            request_ip TEXT NOT NULL,
            nonce TEXT NOT NULL,
            code_verifier TEXT NOT NULL DEFAULT '',
            user_id INTEGER,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_tutorly_oauth_state_ip_created
            ON tutorly_oauth_states(request_ip, created_at DESC);
        CREATE TABLE IF NOT EXISTS tutorly_oauth_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code_hash TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
        );
        CREATE TABLE IF NOT EXISTS tutorly_teacher_degrees (
            user_id INTEGER PRIMARY KEY,
            id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size INTEGER NOT NULL,
            document BLOB NOT NULL,
            uploaded_at INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
        );
            """
        )
        _ensure_user_columns(connection)
        connection.commit()
        yield connection
        connection.commit()
    finally:
        connection.close()


def _ensure_user_columns(connection: sqlite3.Connection) -> None:
    """Apply the additive auth migration without touching existing accounts."""
    columns = {str(row["name"]) for row in connection.execute("PRAGMA table_info(tutorly_users)")}
    additions = {
        "grade": "TEXT NOT NULL DEFAULT ''",
        "board": "TEXT NOT NULL DEFAULT ''",
        "school": "TEXT NOT NULL DEFAULT ''",
        "avatar_url": "TEXT NOT NULL DEFAULT ''",
        "academic_onboarding_completed": "INTEGER NOT NULL DEFAULT 0",
        "preferred_voice_agent": "TEXT NOT NULL DEFAULT ''",
        "voice_onboarding_completed": "INTEGER NOT NULL DEFAULT 0",
        "personalization_json": "TEXT NOT NULL DEFAULT '{}'",
        "role": "TEXT NOT NULL DEFAULT 'student'",
        "age": "INTEGER",
        "onboarding_completed": "INTEGER NOT NULL DEFAULT 0",
        "teacher_profile_json": "TEXT NOT NULL DEFAULT '{}'",
        "teacher_verification_status": "TEXT NOT NULL DEFAULT 'pending'",
        "last_login_at": "INTEGER",
    }
    for name, definition in additions.items():
        if name not in columns:
            connection.execute(f"ALTER TABLE tutorly_users ADD COLUMN {name} {definition}")
    # Run only while introducing the column. Never reclassify a new incomplete
    # account just because an old client writes grade/board through /profile.
    if "onboarding_completed" not in columns:
        connection.execute(
            """UPDATE tutorly_users SET onboarding_completed = 1
               WHERE (academic_onboarding_completed = 1 AND grade <> '' AND board <> '')
                  OR lower(role) IN ('teacher', 'admin')"""
        )


def _normalize_email(value: str) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return email


def _otp_secret() -> bytes:
    value = os.getenv("TUTORLY_OTP_SECRET", "").strip()
    if len(value) < 24:
        raise HTTPException(status_code=503, detail="Email login is temporarily unavailable.")
    return value.encode("utf-8")


def _hash_otp(email: str, code: str) -> str:
    return hmac.new(_otp_secret(), f"{email}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def _hash_session(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _hash_oauth_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS).hex()


def _bearer_token(authorization: str | None) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return ""


def _authenticated_user(connection: sqlite3.Connection, authorization: str | None) -> sqlite3.Row:
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    now = int(time.time())
    user = connection.execute(
        """
        SELECT u.*
        FROM tutorly_auth_sessions AS s
        JOIN tutorly_users AS u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.revoked = 0 AND s.expires_at > ?
        """,
        (_hash_session(token), now),
    ).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    return user


def _effective_role(user: sqlite3.Row) -> str:
    configured_admins = {
        email.strip().lower()
        for email in os.getenv("TUTORLY_ADMIN_EMAILS", "").split(",")
        if email.strip()
    }
    if str(user["email"] or "").strip().lower() in configured_admins:
        return "admin"
    value = str(user["role"] or "student").strip().lower()
    return value if value in {"student", "teacher", "admin"} else "student"


def require_role(authorization: str | None, *allowed_roles: str) -> dict[str, str | int]:
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        role = _effective_role(user)
        if role not in set(allowed_roles):
            raise HTTPException(status_code=403, detail="Forbidden")
        if role == "teacher" and user["teacher_verification_status"] != "verified":
            raise HTTPException(status_code=403, detail="Teacher verification is pending.")
        return {"id": int(user["id"]), "role": role}


def authenticated_user_context(authorization: str | None) -> dict[str, str | int]:
    """Return the minimum safe account context needed by other backend services."""
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        return {
            "id": int(user["id"]),
            "full_name": str(user["full_name"] or "Tutorly Student"),
            "email": str(user["email"] or ""),
            "role": _effective_role(user),
            "age": user["age"],
        }


def _frontend_origin() -> str:
    configured = (
        os.getenv("TUTORLY_FRONTEND_ORIGIN", "").strip()
        or os.getenv("APP_ORIGIN", "").strip()
        or "https://mytutor.co.in"
    ).rstrip("/")
    parsed = urlsplit(configured)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"}:
        return "https://mytutor.co.in"
    return configured


def _frontend_url(page: str, **params: str) -> str:
    allowed_pages = {"login.html", "sign_up.html", "info.html", "maths_gpt.html", "profile.html"}
    safe_page = page if page in allowed_pages else "login.html"
    query = urlencode({key: value for key, value in params.items() if value})
    return f"{_frontend_origin()}/{safe_page}{'?' + query if query else ''}"


def _provider_or_404(provider: str):
    config = provider_configs().get(provider.lower())
    if not config:
        raise HTTPException(status_code=404, detail="That sign-in provider is not supported.")
    if not config.enabled:
        raise HTTPException(status_code=503, detail=f"{config.label} sign-in is not configured yet.")
    return config


def _clean_profile_value(value: str, *, required: bool, max_length: int, label: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "").strip())
    if required and not cleaned:
        raise HTTPException(status_code=400, detail=f"Select your {label}.")
    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{label.title()} is too long.")
    return cleaned


def _normalized_grade(value: object) -> str:
    grade = re.sub(r"^(?:grade|class)\s*", "", str(value or "").strip(), flags=re.I)
    if not grade.isdigit() or not 1 <= int(grade) <= 12:
        raise HTTPException(status_code=400, detail="Choose a grade from 1 to 12.")
    return str(int(grade))


def _normalized_board(value: str) -> str:
    board = _clean_profile_value(value, required=True, max_length=160, label="board")
    alias = re.sub(r"[^a-z0-9]", "", board.lower())
    if alias in {"cbse", "ncert", "cbsencert", "centralboard", "centralboardofsecondaryeducation"}:
        return "CBSE"
    if alias in {"cisce", "icse", "isc", "councilfortheindianschoolcertificateexaminations"}:
        return "CISCE"
    # Board identity is independent of curriculum import availability.
    return board


def _profile_list(values: list[str], label: str) -> list[str]:
    if not values or len(values) > 40:
        raise HTTPException(status_code=400, detail=f"Choose between 1 and 40 {label}.")
    result: list[str] = []
    for value in values:
        cleaned = _normalized_board(value) if label == "boards" else _clean_profile_value(
            value, required=True, max_length=100, label=label
        )
        if cleaned.casefold() not in {item.casefold() for item in result}:
            result.append(cleaned)
    return result


def _validated_age(value: int | None, *, required: bool = False) -> int | None:
    if value is None and not required:
        return None
    if value is None or not 5 <= value <= 120:
        raise HTTPException(status_code=400, detail="Enter an age between 5 and 120.")
    return value


def _degree_metadata(connection: sqlite3.Connection, user_id: int) -> dict[str, object] | None:
    row = connection.execute(
        "SELECT id, name, size, content_type FROM tutorly_teacher_degrees WHERE user_id = ?", (user_id,)
    ).fetchone()
    return dict(row) if row else None


TEACHER_PROFILE_FIELDS = (
    "subjects", "boards", "grade_min", "grade_max", "gender", "teaching_personality",
    "preferred_days", "preferred_start_time", "preferred_end_time", "timezone", "consented_at",
)
TEACHING_PERSONALITIES = {
    "caring", "focused", "funny", "strict", "patient", "calm", "energetic", "friendly",
    "encouraging", "practical", "detailed", "straightforward",
}


def _teacher_preferences(values: dict) -> dict:
    """Gender is self-description only; never an input to access or verification."""
    gender = values.get("gender", "")
    if gender not in {"male", "female", "non_binary", "prefer_not_to_say"}:
        raise HTTPException(400, "Select a gender option, including Prefer not to say.")
    personalities = values.get("teaching_personality", [])
    if not personalities or len(personalities) > 12 or any(value not in TEACHING_PERSONALITIES for value in personalities):
        raise HTTPException(400, "Choose one or more teaching personality options.")
    days = values.get("preferred_days", [])
    weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    if not days or len(days) > 7 or any(day not in weekdays for day in days):
        raise HTTPException(400, "Choose at least one preferred day.")
    times = []
    for key in ("preferred_start_time", "preferred_end_time"):
        value = values.get(key, "")
        if not isinstance(value, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):(?:00|15|30|45)", value):
            raise HTTPException(400, "Choose valid times in 15-minute increments.")
        hour, minute = map(int, value.split(":"))
        times.append(hour * 60 + minute)
    if not 15 <= times[1] - times[0] <= 120:
        raise HTTPException(400, "Choose a same-day time range of 15 minutes to 2 hours.")
    return {
        "gender": gender, "teaching_personality": list(dict.fromkeys(personalities)),
        "preferred_days": [day for day in weekdays if day in days],
        "preferred_start_time": values["preferred_start_time"],
        "preferred_end_time": values["preferred_end_time"], "timezone": "Asia/Kolkata",
    }


def _canonical_user(connection: sqlite3.Connection, user: sqlite3.Row) -> dict[str, object]:
    connected = [row["provider"] for row in connection.execute(
        "SELECT provider FROM tutorly_social_identities WHERE user_id = ? ORDER BY provider", (user["id"],)
    )]
    teacher = {}
    try:
        saved = json.loads(user["teacher_profile_json"] or "{}")
        if isinstance(saved, dict):
            teacher = {key: saved[key] for key in TEACHER_PROFILE_FIELDS if key in saved}
    except (TypeError, ValueError):
        pass
    teacher["verification_status"] = user["teacher_verification_status"] if user["teacher_verification_status"] in {
        "pending", "verified", "rejected"
    } else "pending"
    teacher["degree"] = _degree_metadata(connection, user["id"])
    return {
        "id": str(user["id"]), "email": user["email"], "full_name": user["full_name"],
        "role": _effective_role(user), "age": user["age"], "grade": user["grade"],
        "board": user["board"], "school": user["school"], "avatar_url": user["avatar_url"],
        "onboarding_completed": bool(user["onboarding_completed"]),
        "academic_onboarding_completed": bool(user["academic_onboarding_completed"]),
        "teacher_profile": teacher,
        "connected_providers": connected,
        "preferred_voice_agent": user["preferred_voice_agent"],
        "voice_onboarding_completed": bool(user["voice_onboarding_completed"]),
        "personalization": _personalization_from_user(user),
    }


def _profile_payload(connection: sqlite3.Connection, user_id: int) -> dict[str, object]:
    user = connection.execute("SELECT * FROM tutorly_users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    return {
        "authenticated": True,
        "onboarding_required": not bool(user["onboarding_completed"]),
        "role_selection_required": not bool(user["onboarding_completed"]),
        "user": _canonical_user(connection, user),
    }


def _personalization_from_value(value: object) -> dict[str, object]:
    source: dict[str, object] = {}
    if isinstance(value, str) and value.strip():
        try:
            decoded = json.loads(value)
            if isinstance(decoded, dict):
                source = decoded
        except (TypeError, ValueError, json.JSONDecodeError):
            source = {}
    elif isinstance(value, dict):
        source = value

    preferences = dict(DEFAULT_PERSONALIZATION)
    for key, allowed in PERSONALIZATION_OPTIONS.items():
        candidate = str(source.get(key, preferences[key]) or "").strip()
        if candidate in allowed:
            preferences[key] = candidate
    for key in ("use_examples", "show_diagrams", "show_formulas", "suggest_follow_ups", "quick_answers"):
        if key in source and isinstance(source[key], bool):
            preferences[key] = source[key]
    return preferences


def _personalization_from_user(user: sqlite3.Row) -> dict[str, object]:
    try:
        value = user["personalization_json"]
    except (IndexError, KeyError):
        value = ""
    return _personalization_from_value(value)


def _validated_personalization(value: dict[str, object]) -> dict[str, object]:
    for key, allowed in PERSONALIZATION_OPTIONS.items():
        candidate = str(value.get(key, DEFAULT_PERSONALIZATION[key]) or "").strip()
        if candidate not in allowed:
            raise HTTPException(status_code=400, detail=f"Choose a valid {key.replace('_', ' ')}.")
    return _personalization_from_value(value)


def _smtp_config() -> dict[str, object]:
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", username).strip()
    if not host or not username or not password or not sender:
        raise HTTPException(status_code=503, detail="Email login is temporarily unavailable.")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError as error:
        raise HTTPException(status_code=503, detail="Email login is temporarily unavailable.") from error
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "sender": sender,
        "use_ssl": os.getenv("SMTP_USE_SSL", "").strip().lower() in {"1", "true", "yes"} or port == 465,
    }


def _email_delivery_configured() -> bool:
    required = (
        os.getenv("SMTP_HOST", "").strip(),
        os.getenv("SMTP_USERNAME", "").strip(),
        os.getenv("SMTP_PASSWORD", "").strip(),
        os.getenv("SMTP_FROM_EMAIL", "").strip(),
    )
    try:
        port_valid = int(os.getenv("SMTP_PORT", "587")) > 0
    except ValueError:
        port_valid = False
    return all(required) and port_valid and len(os.getenv("TUTORLY_OTP_SECRET", "").strip()) >= 24


def _send_otp_email(email: str, code: str) -> None:
    config = _smtp_config()
    message = EmailMessage()
    message["Subject"] = "Your Tutorly login code"
    message["From"] = f"Tutorly <{config['sender']}>"
    message["To"] = email
    message.set_content(
        f"Your Tutorly verification code is {code}.\n\n"
        "It expires in 10 minutes. If you did not request this code, you can ignore this email."
    )
    context = ssl.create_default_context()
    if config["use_ssl"]:
        with smtplib.SMTP_SSL(str(config["host"]), int(config["port"]), timeout=15, context=context) as client:
            client.login(str(config["username"]), str(config["password"]))
            client.send_message(message)
    else:
        with smtplib.SMTP(str(config["host"]), int(config["port"]), timeout=15) as client:
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
            client.login(str(config["username"]), str(config["password"]))
            client.send_message(message)


def _create_session(connection: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    connection.execute(
        "INSERT INTO tutorly_auth_sessions(user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (user_id, _hash_session(token), now, now + SESSION_TTL_SECONDS),
    )
    return token


@router.get("/health")
def auth_health():
    """Report auth deployment readiness without exposing credentials or user data."""
    providers = provider_configs()
    return {
        "status": "ok",
        "auth_routes": "ready",
        "email_delivery": "configured" if _email_delivery_configured() else "configuration_required",
        "social_auth": {
            name: "configured" if config.enabled else "configuration_required"
            for name, config in providers.items()
        },
    }


def _session_payload(connection: sqlite3.Connection, user_id: int) -> dict[str, object]:
    result = _profile_payload(connection, user_id)
    result["session_token"] = _create_session(connection, user_id)
    connection.execute("UPDATE tutorly_users SET last_login_at = ? WHERE id = ?", (int(time.time()), user_id))
    return result


@router.get("/providers")
def auth_providers():
    """Expose availability only; credentials and provider internals stay server-side."""
    return {
        "providers": [
            {"id": config.provider, "label": config.label, "enabled": config.enabled}
            for config in provider_configs().values()
        ]
    }


@router.get("/me")
def current_user(authorization: str | None = Header(default=None)):
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        return _profile_payload(connection, user["id"])


@router.get("/admin-session")
def admin_session(authorization: str | None = Header(default=None)):
    """Role assertion for trusted admin clients; returns no profile or secret data."""
    context = require_role(authorization, "admin")
    return {"authenticated": True, "role": "admin", "user_id": str(context["id"])}


@router.get("/personalization")
def get_personalization(authorization: str | None = Header(default=None)):
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        return {"personalization": _personalization_from_user(user)}


@router.put("/personalization")
def update_personalization(
    payload: PersonalizationRequest,
    authorization: str | None = Header(default=None),
):
    raw = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    preferences = _validated_personalization(raw)
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        connection.execute(
            """
            UPDATE tutorly_users
            SET personalization_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(preferences, ensure_ascii=False, separators=(",", ":")), int(time.time()), user["id"]),
        )
    return {"saved": True, "personalization": preferences}


@router.get("/voice-preferences")
def get_voice_preferences(authorization: str | None = Header(default=None)):
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        voice_key = str(user["preferred_voice_agent"] or "").strip().lower()
        valid = voice_agent(voice_key) is not None
        return {
            "preferred_voice_agent": voice_key if valid else "",
            "voice_onboarding_completed": bool(user["voice_onboarding_completed"] and valid),
        }


@router.put("/voice-preferences")
def update_voice_preferences(
    payload: VoicePreferenceRequest,
    authorization: str | None = Header(default=None),
):
    voice_key = str(payload.preferred_voice_agent or "").strip().lower()
    if voice_agent(voice_key) is None:
        raise HTTPException(status_code=400, detail="Choose a valid Tutorly voice.")
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        completed = 1 if payload.voice_onboarding_completed else 0
        connection.execute(
            """
            UPDATE tutorly_users
            SET preferred_voice_agent = ?, voice_onboarding_completed = ?, updated_at = ?
            WHERE id = ?
            """,
            (voice_key, completed, int(time.time()), user["id"]),
        )
    return {
        "saved": True,
        "preferred_voice_agent": voice_key,
        "voice_onboarding_completed": bool(completed),
    }


@router.post("/profile")
def update_academic_profile(
    payload: AcademicProfileRequest,
    authorization: str | None = Header(default=None),
):
    grade = _normalized_grade(payload.grade)
    board = _normalized_board(payload.board)
    age = _validated_age(payload.age)
    school = _clean_profile_value(payload.school, required=False, max_length=160, label="school")
    full_name = None
    if payload.full_name is not None:
        full_name = _clean_profile_value(payload.full_name, required=True, max_length=120, label="name")
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        if _effective_role(user) == "teacher":
            raise HTTPException(status_code=400, detail="Use your teacher profile settings.")
        connection.execute(
            """
            UPDATE tutorly_users
            SET grade = ?, board = ?, school = ?,
                full_name = CASE WHEN ? IS NULL THEN full_name ELSE ? END,
                age = COALESCE(?, age), updated_at = ?
            WHERE id = ?
            """,
            (grade, board, school, full_name, full_name, age, int(time.time()), user["id"]),
        )
        return {
            "saved": True,
            "grade": grade,
            "board": board,
            "school": school,
            "full_name": full_name if full_name is not None else user["full_name"],
            "age": age if age is not None else user["age"],
        }


@router.post("/onboarding")
def complete_onboarding(payload: OnboardingRequest, authorization: str | None = Header(default=None)):
    role = payload.role.strip().lower()
    if role not in {"student", "teacher"}:
        raise HTTPException(status_code=400, detail="Choose Student or Teacher.")
    full_name = _clean_profile_value(payload.full_name, required=True, max_length=120, label="name")
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Enter your full name.")
    school = _clean_profile_value(payload.school, required=False, max_length=160, label="school")
    with _connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        user = _authenticated_user(connection, authorization)
        if user["onboarding_completed"]:
            if role != _effective_role(user):
                raise HTTPException(status_code=409, detail="Your account role is already saved.")
            # An uncertain retry is idempotent, never overwrites a finished profile.
            return {"saved": True, **_profile_payload(connection, user["id"])}
        if role == "student":
            grade = _normalized_grade(payload.grade)
            board = _normalized_board(payload.board)
            age = _validated_age(payload.age, required=True)
            connection.execute(
                """UPDATE tutorly_users SET role = 'student', full_name = ?, age = ?,
                   grade = ?, board = ?, school = ?, academic_onboarding_completed = 1,
                   onboarding_completed = 1, updated_at = ? WHERE id = ?""",
                (full_name, age, grade, board, school, int(time.time()), user["id"]),
            )
            # A person who changes their role choice before completion should not
            # leave an unnecessary degree document in their student account.
            connection.execute("DELETE FROM tutorly_teacher_degrees WHERE user_id = ?", (user["id"],))
        else:
            if not _degree_metadata(connection, user["id"]):
                raise HTTPException(status_code=400, detail="Upload your degree before continuing.")
            subjects = _profile_list(payload.subjects, "subjects")
            boards = _profile_list(payload.boards, "boards")
            lower, upper = payload.grade_min, payload.grade_max
            if lower is None or upper is None or not 1 <= lower <= upper <= 12:
                raise HTTPException(status_code=400, detail="Choose a grade range between 1 and 12.")
            teacher = {"subjects": subjects, "boards": boards, "grade_min": lower, "grade_max": upper}
            teacher.update(_teacher_preferences({
                "gender": payload.gender, "teaching_personality": payload.teaching_personality,
                "preferred_days": payload.preferred_days, "preferred_start_time": payload.preferred_start_time,
                "preferred_end_time": payload.preferred_end_time,
            }))
            if payload.consent is not True:
                raise HTTPException(400, "Confirm the Terms of Service and Privacy Policy to finish.")
            teacher["consented_at"] = int(time.time())
            connection.execute(
                """UPDATE tutorly_users SET role = 'teacher', full_name = ?, school = ?,
                   teacher_profile_json = ?, teacher_verification_status = 'pending',
                   onboarding_completed = 1, updated_at = ? WHERE id = ?""",
                (full_name, school, json.dumps(teacher, ensure_ascii=False), int(time.time()), user["id"]),
            )
        return {"saved": True, **_profile_payload(connection, user["id"])}


def _degree_upload_user(connection: sqlite3.Connection, authorization: str | None) -> sqlite3.Row:
    user = _authenticated_user(connection, authorization)
    if user["onboarding_completed"] and _effective_role(user) != "teacher":
        raise HTTPException(status_code=403, detail="Degree uploads are for teacher profiles.")
    return user


@router.put("/teacher-profile")
def update_teacher_profile(payload: TeacherProfileRequest, authorization: str | None = Header(default=None)):
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        if _effective_role(user) != "teacher" or not user["onboarding_completed"]:
            raise HTTPException(status_code=403, detail="Complete your teacher profile first.")
        full_name = str(user["full_name"])
        school = str(user["school"])
        if payload.full_name is not None:
            full_name = _clean_profile_value(payload.full_name, required=True, max_length=120, label="name")
            if len(full_name) < 2:
                raise HTTPException(status_code=400, detail="Enter your full name.")
        if payload.school is not None:
            school = _clean_profile_value(payload.school, required=False, max_length=160, label="school")
        stored = _canonical_user(connection, user)["teacher_profile"]
        teacher = {key: stored[key] for key in TEACHER_PROFILE_FIELDS if key in stored}
        preferences = ("gender", "teaching_personality", "preferred_days", "preferred_start_time", "preferred_end_time")
        if any(getattr(payload, key) is not None for key in preferences):
            values = {key: getattr(payload, key) if getattr(payload, key) is not None else teacher.get(key) for key in preferences}
            teacher.update(_teacher_preferences(values))
        if payload.subjects is not None:
            teacher["subjects"] = _profile_list(payload.subjects, "subjects")
        if payload.boards is not None:
            teacher["boards"] = _profile_list(payload.boards, "boards")
        if payload.grade_min is not None or payload.grade_max is not None:
            lower = payload.grade_min if payload.grade_min is not None else teacher.get("grade_min", 1)
            upper = payload.grade_max if payload.grade_max is not None else teacher.get("grade_max", 12)
            if not 1 <= lower <= upper <= 12:
                raise HTTPException(status_code=400, detail="Choose a grade range between 1 and 12.")
            teacher.update(grade_min=lower, grade_max=upper)
        connection.execute(
            "UPDATE tutorly_users SET full_name = ?, school = ?, teacher_profile_json = ?, updated_at = ? WHERE id = ?",
            (full_name, school, json.dumps(teacher, ensure_ascii=False), int(time.time()), user["id"]),
        )
        return {"saved": True, **_profile_payload(connection, user["id"])}


def _store_degree(authorization: str | None, name: str, content_type: str, document: bytes):
    with _connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        user = _degree_upload_user(connection, authorization)
        connection.execute(
            """INSERT INTO tutorly_teacher_degrees(user_id, id, name, content_type, size, document, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET id = excluded.id, name = excluded.name,
               content_type = excluded.content_type, size = excluded.size,
               document = excluded.document, uploaded_at = excluded.uploaded_at""",
            (user["id"], secrets.token_urlsafe(24), name, content_type, len(document), document, int(time.time())),
        )
        connection.execute(
            "UPDATE tutorly_users SET teacher_verification_status = 'pending', updated_at = ? WHERE id = ?",
            (int(time.time()), user["id"]),
        )
        return {"degree": _degree_metadata(connection, user["id"]), "verification_status": "pending"}


@router.put("/teacher-degree")
async def upload_teacher_degree(request: Request, authorization: str | None = Header(default=None)):
    # Authenticate before accepting any file data; no public upload path exists.
    with _connection() as connection:
        _degree_upload_user(connection, authorization)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    name = unquote(request.headers.get("x-filename", "")).strip()
    suffixes = {"application/pdf": {".pdf"}, "image/jpeg": {".jpg", ".jpeg"}, "image/png": {".png"}}
    if (content_type not in suffixes or not name or len(name) > 160
            or re.search(r"[\x00-\x1f\x7f/\\]", name)
            or Path(name).suffix.lower() not in suffixes.get(content_type, set())):
        raise HTTPException(status_code=400, detail="Choose a PDF, JPG, JPEG or PNG degree document.")
    try:
        declared_size = int(request.headers.get("content-length", "0"))
    except ValueError:
        raise HTTPException(status_code=400, detail="The upload size is invalid.") from None
    if declared_size > DEGREE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Your degree document must be 5 MB or smaller.")
    document = bytearray()
    async for chunk in request.stream():
        if len(document) + len(chunk) > DEGREE_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Your degree document must be 5 MB or smaller.")
        document.extend(chunk)
    signatures = {
        "application/pdf": document.startswith(b"%PDF-") and b"%%EOF" in document[-2048:],
        "image/jpeg": document.startswith(b"\xff\xd8\xff") and document.endswith(b"\xff\xd9"),
        "image/png": document.startswith(b"\x89PNG\r\n\x1a\n") and b"IEND" in document[-16:],
    }
    if not document or not signatures[content_type]:
        raise HTTPException(status_code=400, detail="This file does not match its document type. Choose another file.")
    return await run_in_threadpool(_store_degree, authorization, name, content_type, bytes(document))


@router.get("/teacher-degree")
def download_teacher_degree(authorization: str | None = Header(default=None)):
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        degree = connection.execute(
            "SELECT name, content_type, document FROM tutorly_teacher_degrees WHERE user_id = ?", (user["id"],)
        ).fetchone()
        if not degree:
            raise HTTPException(status_code=404, detail="No degree document has been uploaded.")
        return Response(
            content=bytes(degree["document"]), media_type=degree["content_type"],
            headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(degree["name"], safe=""),
                     "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                     "Content-Security-Policy": "sandbox"},
        )


@router.delete("/teacher-degree")
def remove_teacher_degree(authorization: str | None = Header(default=None)):
    with _connection() as connection:
        user = _degree_upload_user(connection, authorization)
        connection.execute("DELETE FROM tutorly_teacher_degrees WHERE user_id = ?", (user["id"],))
        connection.execute(
            "UPDATE tutorly_users SET teacher_verification_status = 'pending', updated_at = ? WHERE id = ?",
            (int(time.time()), user["id"]),
        )
    return {"removed": True, "degree": None, "verification_status": "pending"}


@router.post("/request-otp")
async def request_otp(payload: EmailRequest, request: Request):
    email = _normalize_email(payload.email)
    _otp_secret()
    _smtp_config()
    now = int(time.time())
    request_ip = request.client.host if request.client else "unknown"
    with _connection() as connection:
        latest = connection.execute(
            "SELECT created_at FROM tutorly_login_otps WHERE email = ? ORDER BY created_at DESC LIMIT 1",
            (email,),
        ).fetchone()
        if latest and now - int(latest["created_at"]) < OTP_RESEND_SECONDS:
            raise HTTPException(status_code=429, detail="Please wait a minute before requesting another code.")
        request_count = connection.execute(
            "SELECT COUNT(*) AS count FROM tutorly_login_otps WHERE (email = ? OR request_ip = ?) AND created_at >= ?",
            (email, request_ip, now - 3600),
        ).fetchone()["count"]
        if int(request_count) >= OTP_MAX_REQUESTS_PER_HOUR:
            raise HTTPException(status_code=429, detail="Too many code requests. Please try again later.")

        code = f"{secrets.randbelow(1_000_000):06d}"
        cursor = connection.execute(
            "INSERT INTO tutorly_login_otps(email, otp_hash, request_ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (email, _hash_otp(email, code), request_ip, now, now + OTP_TTL_SECONDS),
        )
        otp_id = cursor.lastrowid

    try:
        await run_in_threadpool(_send_otp_email, email, code)
    except HTTPException:
        with _connection() as connection:
            connection.execute("DELETE FROM tutorly_login_otps WHERE id = ?", (otp_id,))
        raise
    except Exception:
        with _connection() as connection:
            connection.execute("DELETE FROM tutorly_login_otps WHERE id = ?", (otp_id,))
        raise HTTPException(status_code=503, detail="We couldn't send the code. Please try again.") from None

    return {"sent": True, "expires_in": OTP_TTL_SECONDS}


@router.post("/verify-otp")
def verify_otp(payload: OtpVerifyRequest):
    email = _normalize_email(payload.email)
    code = re.sub(r"\D", "", str(payload.code or ""))
    if len(code) != 6:
        raise HTTPException(status_code=400, detail="Enter the complete 6-digit code.")
    now = int(time.time())
    with _connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        otp = connection.execute(
            "SELECT * FROM tutorly_login_otps WHERE email = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1",
            (email,),
        ).fetchone()
        if not otp or int(otp["expires_at"]) < now:
            raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")
        if int(otp["attempts"]) >= OTP_MAX_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Too many incorrect attempts. Request a new code.")
        if not hmac.compare_digest(str(otp["otp_hash"]), _hash_otp(email, code)):
            connection.execute("UPDATE tutorly_login_otps SET attempts = attempts + 1 WHERE id = ?", (otp["id"],))
            connection.commit()  # Keep the attempt counter even though the response is an error.
            raise HTTPException(status_code=400, detail="That code is incorrect. Try again.")

        connection.execute("UPDATE tutorly_login_otps SET consumed = 1 WHERE id = ?", (otp["id"],))
        user = connection.execute("SELECT id FROM tutorly_users WHERE email = ?", (email,)).fetchone()
        if user:
            user_id = int(user["id"])
        else:
            display_name = email.split("@", 1)[0].replace(".", " ").replace("_", " ").strip().title()
            cursor = connection.execute(
                "INSERT INTO tutorly_users(email, full_name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (email, display_name, now, now),
            )
            user_id = int(cursor.lastrowid)
        return _session_payload(connection, user_id)


@router.post("/register")
def register(payload: RegisterRequest, authorization: str | None = Header(default=None)):
    """Legacy password setup, only after OTP/OAuth has proved account ownership.

    The public auth entry uses OTP/OAuth for new identities. Keep this endpoint
    for authenticated older clients, not as unverified account registration.
    """
    email = _normalize_email(payload.email)
    full_name = re.sub(r"\s+", " ", str(payload.full_name or "").strip())
    password = str(payload.password or "")
    if len(full_name) < 2 or len(full_name) > 80:
        raise HTTPException(status_code=400, detail="Enter your full name.")
    if not 8 <= len(password) <= 1024:
        raise HTTPException(status_code=400, detail="Use between 8 and 1024 characters for your password.")
    now = int(time.time())
    salt = secrets.token_bytes(16)
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        if not hmac.compare_digest(email, str(user["email"])):
            raise HTTPException(status_code=403, detail="Authenticate with this email before setting a password.")
        if user["password_hash"]:
            raise HTTPException(status_code=409, detail="A password is already configured for your account.")
        connection.execute(
            "UPDATE tutorly_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
            (_hash_password(password, salt), salt.hex(), now, user["id"]),
        )
        return _session_payload(connection, int(user["id"]))


@router.post("/password-login")
def password_login(payload: PasswordLoginRequest):
    email = _normalize_email(payload.email)
    password = str(payload.password or "")
    if len(password) > 1024:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    with _connection() as connection:
        user = connection.execute(
            "SELECT id, password_hash, password_salt FROM tutorly_users WHERE email = ?",
            (email,),
        ).fetchone()
        valid = False
        if user and user["password_hash"] and user["password_salt"]:
            computed = _hash_password(password, bytes.fromhex(str(user["password_salt"])))
            valid = hmac.compare_digest(str(user["password_hash"]), computed)
        else:
            # Missing/passwordless accounts perform the same expensive operation.
            _hash_password(password, b"tutorly-dummy-salt")
        if not valid:
            raise HTTPException(status_code=401, detail="Incorrect email or password.")
        return _session_payload(connection, int(user["id"]))


def _new_oauth_state(provider: str, flow: str, request_ip: str, user_id: int | None = None) -> tuple[str, str, str]:
    config = _provider_or_404(provider)
    now = int(time.time())
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64) if config.pkce else ""
    with _connection() as connection:
        connection.execute(
            "DELETE FROM tutorly_oauth_states WHERE created_at < ?",
            (now - 24 * 60 * 60,),
        )
        starts = connection.execute(
            "SELECT COUNT(*) AS count FROM tutorly_oauth_states WHERE request_ip = ? AND created_at >= ?",
            (request_ip, now - 3600),
        ).fetchone()["count"]
        if int(starts) >= OAUTH_MAX_STARTS_PER_HOUR:
            raise HTTPException(status_code=429, detail="Too many sign-in attempts. Please try again later.")
        connection.execute(
            """
            INSERT INTO tutorly_oauth_states(
                state_hash, provider, flow, request_ip, nonce, code_verifier,
                user_id, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                _hash_oauth_value(state),
                provider,
                flow,
                request_ip,
                nonce,
                verifier,
                user_id,
                now,
                now + OAUTH_STATE_TTL_SECONDS,
            ),
        )
    return state, nonce, verifier


def _consume_oauth_state(provider: str, state: str) -> sqlite3.Row:
    if not state or len(state) > 256:
        raise OAuthProviderError("invalid_state")
    now = int(time.time())
    with _connection() as connection:
        row = connection.execute(
            "SELECT * FROM tutorly_oauth_states WHERE state_hash = ?",
            (_hash_oauth_value(state),),
        ).fetchone()
        if (
            not row
            or row["provider"] != provider
            or row["consumed"]
            or int(row["expires_at"]) < now
        ):
            raise OAuthProviderError("invalid_state")
        updated = connection.execute(
            "UPDATE tutorly_oauth_states SET consumed = 1 WHERE id = ? AND consumed = 0",
            (row["id"],),
        )
        if updated.rowcount != 1:
            raise OAuthProviderError("invalid_state")
        return row


def _new_oauth_result(connection: sqlite3.Connection, user_id: int) -> str:
    code = secrets.token_urlsafe(32)
    now = int(time.time())
    connection.execute(
        "DELETE FROM tutorly_oauth_results WHERE expires_at < ? OR consumed = 1",
        (now - 60,),
    )
    connection.execute(
        "INSERT INTO tutorly_oauth_results(code_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (_hash_oauth_value(code), user_id, now, now + OAUTH_RESULT_TTL_SECONDS),
    )
    return code


def _oauth_error_redirect(provider: str, flow: str, code: str) -> RedirectResponse:
    page = "sign_up.html" if flow == "signup" else "profile.html" if flow == "connect" else "login.html"
    return RedirectResponse(_frontend_url(page, oauth_error=code, provider=provider), status_code=303)


@router.get("/oauth/{provider}/start")
def oauth_start(provider: str, request: Request, flow: str = "login"):
    normalized_provider = provider.strip().lower()
    config = _provider_or_404(normalized_provider)
    normalized_flow = flow.strip().lower()
    if normalized_flow not in {"login", "signup"}:
        raise HTTPException(status_code=400, detail="Invalid sign-in flow.")
    request_ip = request.client.host if request.client else "unknown"
    state, nonce, verifier = _new_oauth_state(normalized_provider, normalized_flow, request_ip)
    challenge = pkce_challenge(verifier) if verifier else ""
    return RedirectResponse(config.authorization_url(state, nonce, challenge), status_code=302)


@router.post("/oauth/{provider}/connect-start")
def oauth_connect_start(
    provider: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    normalized_provider = provider.strip().lower()
    config = _provider_or_404(normalized_provider)
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        user_id = int(user["id"])
    request_ip = request.client.host if request.client else "unknown"
    state, nonce, verifier = _new_oauth_state(normalized_provider, "connect", request_ip, user_id)
    challenge = pkce_challenge(verifier) if verifier else ""
    return {"authorization_url": config.authorization_url(state, nonce, challenge)}


@router.api_route("/oauth/{provider}/callback", methods=["GET", "POST"])
async def oauth_callback(provider: str, request: Request):
    normalized_provider = provider.strip().lower()
    try:
        config = _provider_or_404(normalized_provider)
    except HTTPException:
        return _oauth_error_redirect(normalized_provider, "login", "provider_unavailable")

    values: dict[str, str] = {key: value for key, value in request.query_params.items()}
    if request.method == "POST":
        try:
            form = await request.form()
            values.update({str(key): str(value) for key, value in form.items()})
        except Exception:
            return _oauth_error_redirect(normalized_provider, "login", "callback_invalid")

    state_value = values.get("state", "")
    try:
        state_row = _consume_oauth_state(normalized_provider, state_value)
    except OAuthProviderError as error:
        LOGGER.warning("OAuth callback rejected provider=%s category=%s", normalized_provider, error.category)
        return _oauth_error_redirect(normalized_provider, "login", "state_invalid")

    flow = str(state_row["flow"])
    provider_error = values.get("error", "")
    if provider_error:
        category = "cancelled" if provider_error in {"access_denied", "user_cancelled_authorize"} else "provider_failed"
        LOGGER.info("OAuth ended provider=%s category=%s", normalized_provider, category)
        return _oauth_error_redirect(normalized_provider, flow, category)

    code = values.get("code", "")
    if not code or len(code) > 8192:
        return _oauth_error_redirect(normalized_provider, flow, "callback_invalid")

    apple_user: dict[str, object] = {}
    raw_apple_user = values.get("user", "")
    if raw_apple_user and len(raw_apple_user) <= 8192:
        try:
            decoded_user = json.loads(raw_apple_user)
            if isinstance(decoded_user, dict):
                apple_user = decoded_user
        except json.JSONDecodeError:
            apple_user = {}

    try:
        identity = await config.exchange_and_verify(
            code=code,
            nonce=str(state_row["nonce"]),
            code_verifier=str(state_row["code_verifier"]),
            apple_user=apple_user,
        )
        if normalized_provider in {"google", "apple"} and not identity.email_verified:
            raise OAuthProviderError("unverified_identity")
    except OAuthProviderError as error:
        LOGGER.warning("OAuth verification failed provider=%s category=%s", normalized_provider, error.category)
        return _oauth_error_redirect(normalized_provider, flow, "identity_invalid")

    now = int(time.time())
    try:
        with _connection() as connection:
            social = connection.execute(
                "SELECT id, user_id FROM tutorly_social_identities WHERE provider = ? AND provider_user_id = ?",
                (normalized_provider, identity.provider_user_id),
            ).fetchone()

            if flow == "connect":
                connecting_user_id = int(state_row["user_id"] or 0)
                if not connecting_user_id:
                    return _oauth_error_redirect(normalized_provider, flow, "link_failed")
                if social and int(social["user_id"]) != connecting_user_id:
                    return _oauth_error_redirect(normalized_provider, flow, "identity_in_use")
                if social:
                    connection.execute(
                        """
                        UPDATE tutorly_social_identities
                        SET provider_email = ?, provider_email_verified = ?, last_login_at = ?
                        WHERE id = ?
                        """,
                        (identity.email, int(identity.email_verified), now, social["id"]),
                    )
                else:
                    connection.execute(
                        """
                        INSERT INTO tutorly_social_identities(
                            user_id, provider, provider_user_id, provider_email,
                            provider_email_verified, created_at, last_login_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            connecting_user_id,
                            normalized_provider,
                            identity.provider_user_id,
                            identity.email,
                            int(identity.email_verified),
                            now,
                            now,
                        ),
                    )
                LOGGER.info("OAuth provider connected provider=%s", normalized_provider)
                return RedirectResponse(
                    _frontend_url("profile.html", oauth_connected=normalized_provider),
                    status_code=303,
                )

            if social:
                user_id = int(social["user_id"])
                connection.execute(
                    """
                    UPDATE tutorly_social_identities
                    SET provider_email = ?, provider_email_verified = ?, last_login_at = ?
                    WHERE id = ?
                    """,
                    (identity.email, int(identity.email_verified), now, social["id"]),
                )
                connection.execute(
                    """
                    UPDATE tutorly_users
                    SET full_name = CASE WHEN full_name = '' THEN ? ELSE full_name END,
                        avatar_url = CASE WHEN avatar_url = '' THEN ? ELSE avatar_url END,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (identity.full_name, identity.avatar_url, now, user_id),
                )
            else:
                existing_email = connection.execute(
                    "SELECT id FROM tutorly_users WHERE email = ?",
                    (identity.email,),
                ).fetchone()
                if existing_email:
                    LOGGER.info("OAuth account conflict provider=%s", normalized_provider)
                    return _oauth_error_redirect(normalized_provider, flow, "account_exists")

                fallback_name = identity.email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
                cursor = connection.execute(
                    """
                    INSERT INTO tutorly_users(
                        email, full_name, avatar_url, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (identity.email, identity.full_name or fallback_name, identity.avatar_url, now, now),
                )
                user_id = int(cursor.lastrowid)
                connection.execute(
                    """
                    INSERT INTO tutorly_social_identities(
                        user_id, provider, provider_user_id, provider_email,
                        provider_email_verified, created_at, last_login_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        normalized_provider,
                        identity.provider_user_id,
                        identity.email,
                        int(identity.email_verified),
                        now,
                        now,
                    ),
                )

            result_code = _new_oauth_result(connection, user_id)
            LOGGER.info("OAuth sign-in succeeded provider=%s", normalized_provider)
            page = "sign_up.html" if flow == "signup" else "login.html"
            return RedirectResponse(
                _frontend_url(page, oauth_result=result_code, provider=normalized_provider),
                status_code=303,
            )
    except sqlite3.IntegrityError:
        LOGGER.warning("OAuth persistence conflict provider=%s", normalized_provider)
        return _oauth_error_redirect(normalized_provider, flow, "account_conflict")


@router.post("/oauth/complete")
def oauth_complete(payload: OAuthCompleteRequest):
    result_code = str(payload.result_code or "").strip()
    if not result_code or len(result_code) > 256:
        raise HTTPException(status_code=400, detail="That sign-in link is invalid or expired.")
    now = int(time.time())
    with _connection() as connection:
        result = connection.execute(
            "SELECT * FROM tutorly_oauth_results WHERE code_hash = ?",
            (_hash_oauth_value(result_code),),
        ).fetchone()
        if not result or result["consumed"] or int(result["expires_at"]) < now:
            raise HTTPException(status_code=400, detail="That sign-in link is invalid or expired.")
        updated = connection.execute(
            "UPDATE tutorly_oauth_results SET consumed = 1 WHERE id = ? AND consumed = 0",
            (result["id"],),
        )
        if updated.rowcount != 1:
            raise HTTPException(status_code=400, detail="That sign-in link is invalid or expired.")
        return _session_payload(connection, int(result["user_id"]))


@router.get("/connected-accounts")
def connected_accounts(authorization: str | None = Header(default=None)):
    configs = provider_configs()
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        rows = {
            str(row["provider"]): row
            for row in connection.execute(
                "SELECT provider, provider_email FROM tutorly_social_identities WHERE user_id = ?",
                (user["id"],),
            )
        }
        return {
            "accounts": [
                {
                    "provider": name,
                    "label": config.label,
                    "configured": config.enabled,
                    "connected": name in rows,
                    "email": str(rows[name]["provider_email"]) if name in rows else "",
                }
                for name, config in configs.items()
            ],
            "has_password": bool(user["password_hash"]),
        }


@router.delete("/connected-accounts/{provider}")
def disconnect_account(provider: str, authorization: str | None = Header(default=None)):
    normalized_provider = provider.strip().lower()
    if normalized_provider not in provider_configs():
        raise HTTPException(status_code=404, detail="That sign-in provider is not supported.")
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        identities = connection.execute(
            "SELECT id, provider FROM tutorly_social_identities WHERE user_id = ?",
            (user["id"],),
        ).fetchall()
        target = next((row for row in identities if row["provider"] == normalized_provider), None)
        if not target:
            return {"disconnected": False}
        usable_methods = len(identities) + (1 if user["password_hash"] else 0)
        if usable_methods <= 1:
            raise HTTPException(
                status_code=409,
                detail="Add another sign-in method before disconnecting your only login.",
            )
        connection.execute("DELETE FROM tutorly_social_identities WHERE id = ?", (target["id"],))
        return {"disconnected": True}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _bearer_token(authorization)
    if token:
        with _connection() as connection:
            connection.execute(
                "UPDATE tutorly_auth_sessions SET revoked = 1 WHERE token_hash = ?",
                (_hash_session(token),),
            )
    return {"logged_out": True}
