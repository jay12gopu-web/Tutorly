from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend import auth_routes


def main() -> None:
    with tempfile.TemporaryDirectory() as directory:
        auth_routes.DATABASE_PATH = Path(directory) / "auth-test.db"
        os.environ["TUTORLY_OTP_SECRET"] = "test-only-secret-with-at-least-24-characters"
        os.environ["SMTP_HOST"] = "smtp.test.invalid"
        os.environ["SMTP_PORT"] = "587"
        os.environ["SMTP_USERNAME"] = "test-user"
        os.environ["SMTP_PASSWORD"] = "test-password"
        os.environ["SMTP_FROM_EMAIL"] = "no-reply@tutorly.test"

        delivered: dict[str, str] = {}

        def capture_email(email: str, code: str) -> None:
            delivered[email] = code

        auth_routes._send_otp_email = capture_email
        app = FastAPI()
        app.include_router(auth_routes.router)
        client = TestClient(app)

        request = client.post("/api/auth/request-otp", json={"email": "student@example.com"})
        assert request.status_code == 200, request.text
        assert request.json()["sent"] is True
        assert delivered["student@example.com"].isdigit()
        assert len(delivered["student@example.com"]) == 6

        wrong = client.post("/api/auth/verify-otp", json={"email": "student@example.com", "code": "000000"})
        assert wrong.status_code == 400

        verified = client.post(
            "/api/auth/verify-otp",
            json={"email": "student@example.com", "code": delivered["student@example.com"]},
        )
        assert verified.status_code == 200, verified.text
        assert verified.json()["authenticated"] is True
        assert verified.json()["session_token"]

        reused = client.post(
            "/api/auth/verify-otp",
            json={"email": "student@example.com", "code": delivered["student@example.com"]},
        )
        assert reused.status_code == 400

        registered = client.post(
            "/api/auth/register",
            json={"full_name": "Tutorly Student", "email": "signup@example.com", "password": "strong-pass-123"},
        )
        assert registered.status_code == 200, registered.text
        password_login = client.post(
            "/api/auth/password-login",
            json={"email": "signup@example.com", "password": "strong-pass-123"},
        )
        assert password_login.status_code == 200, password_login.text
        rejected = client.post(
            "/api/auth/password-login",
            json={"email": "signup@example.com", "password": "wrong-password"},
        )
        assert rejected.status_code == 401

        token = password_login.json()["session_token"]
        logged_out = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert logged_out.status_code == 200
        assert logged_out.json()["logged_out"] is True

    print("Tutorly backend registration, password login, real OTP delivery, verification, and logout checks passed.")


if __name__ == "__main__":
    main()
