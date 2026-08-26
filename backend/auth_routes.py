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
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
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


class VoicePreferenceRequest(BaseModel):
    preferred_voice_agent: str
    voice_onboarding_completed: bool = True


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
            """
        )
        _ensure_user_columns(connection)
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
    }
    for name, definition in additions.items():
        if name not in columns:
            connection.execute(f"ALTER TABLE tutorly_users ADD COLUMN {name} {definition}")


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


def authenticated_user_context(authorization: str | None) -> dict[str, str | int]:
    """Return the minimum safe account context needed by other backend services."""
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        return {
            "id": int(user["id"]),
            "full_name": str(user["full_name"] or "Tutorly Student"),
            "email": str(user["email"] or ""),
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
    user = connection.execute(
        """
        SELECT id, email, full_name, grade, board, school, avatar_url,
               academic_onboarding_completed
        FROM tutorly_users WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Account not found.")
    token = _create_session(connection, user_id)
    onboarding_required = not bool(user["academic_onboarding_completed"] and user["grade"] and user["board"])
    return {
        "authenticated": True,
        "session_token": token,
        "onboarding_required": onboarding_required,
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "grade": user["grade"],
            "board": user["board"],
            "school": user["school"],
            "avatar_url": user["avatar_url"],
        },
    }


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
        connected = {
            str(row["provider"])
            for row in connection.execute(
                "SELECT provider FROM tutorly_social_identities WHERE user_id = ?",
                (user["id"],),
            )
        }
        return {
            "authenticated": True,
            "onboarding_required": not bool(
                user["academic_onboarding_completed"] and user["grade"] and user["board"]
            ),
            "user": {
                "id": str(user["id"]),
                "email": user["email"],
                "full_name": user["full_name"],
                "grade": user["grade"],
                "board": user["board"],
                "school": user["school"],
                "avatar_url": user["avatar_url"],
                "connected_providers": sorted(connected),
                "preferred_voice_agent": user["preferred_voice_agent"],
                "voice_onboarding_completed": bool(user["voice_onboarding_completed"]),
            },
        }


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
    grade = _clean_profile_value(payload.grade, required=True, max_length=40, label="grade")
    board = _clean_profile_value(payload.board, required=True, max_length=80, label="board")
    school = _clean_profile_value(payload.school, required=False, max_length=160, label="school")
    with _connection() as connection:
        user = _authenticated_user(connection, authorization)
        connection.execute(
            """
            UPDATE tutorly_users
            SET grade = ?, board = ?, school = ?, academic_onboarding_completed = 1, updated_at = ?
            WHERE id = ?
            """,
            (grade, board, school, int(time.time()), user["id"]),
        )
        return {"saved": True, "grade": grade, "board": board, "school": school}


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
def register(payload: RegisterRequest):
    email = _normalize_email(payload.email)
    full_name = re.sub(r"\s+", " ", str(payload.full_name or "").strip())
    password = str(payload.password or "")
    if len(full_name) < 2 or len(full_name) > 80:
        raise HTTPException(status_code=400, detail="Enter your full name.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Use at least 8 characters for your password.")
    now = int(time.time())
    salt = secrets.token_bytes(16)
    with _connection() as connection:
        if connection.execute("SELECT id FROM tutorly_users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="An account already exists for this email.")
        cursor = connection.execute(
            "INSERT INTO tutorly_users(email, full_name, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (email, full_name, _hash_password(password, salt), salt.hex(), now, now),
        )
        return _session_payload(connection, int(cursor.lastrowid))


@router.post("/password-login")
def password_login(payload: PasswordLoginRequest):
    email = _normalize_email(payload.email)
    password = str(payload.password or "")
    with _connection() as connection:
        user = connection.execute(
            "SELECT id, password_hash, password_salt FROM tutorly_users WHERE email = ?",
            (email,),
        ).fetchone()
        valid = False
        if user and user["password_hash"] and user["password_salt"]:
            computed = _hash_password(password, bytes.fromhex(str(user["password_salt"])))
            valid = hmac.compare_digest(str(user["password_hash"]), computed)
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
                LOGGER.info("OAuth provider connected provider=%s user_id=%s", normalized_provider, connecting_user_id)
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
                    LOGGER.info(
                        "OAuth account conflict provider=%s user_id=%s",
                        normalized_provider,
                        existing_email["id"],
                    )
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
            LOGGER.info("OAuth sign-in succeeded provider=%s user_id=%s", normalized_provider, user_id)
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
