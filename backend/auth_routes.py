from __future__ import annotations

import hashlib
import hmac
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

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel


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
            """
        )
        yield connection
        connection.commit()
    finally:
        connection.close()


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


def _hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS).hex()


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


def _session_payload(connection: sqlite3.Connection, user_id: int) -> dict[str, object]:
    user = connection.execute(
        "SELECT id, email, full_name FROM tutorly_users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Account not found.")
    token = _create_session(connection, user_id)
    return {
        "authenticated": True,
        "session_token": token,
        "user": {"id": str(user["id"]), "email": user["email"], "full_name": user["full_name"]},
    }


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


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if token:
        with _connection() as connection:
            connection.execute(
                "UPDATE tutorly_auth_sessions SET revoked = 1 WHERE token_hash = ?",
                (_hash_session(token),),
            )
    return {"logged_out": True}
