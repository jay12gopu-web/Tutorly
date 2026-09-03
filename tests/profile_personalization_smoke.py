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
        auth_routes.DATABASE_PATH = Path(directory) / "profile-personalization.db"
        os.environ["TUTORLY_OTP_SECRET"] = "test-only-secret-with-at-least-24-characters"

        app = FastAPI()
        app.include_router(auth_routes.router)
        client = TestClient(app)
        registered = client.post(
            "/api/auth/register",
            json={"full_name": "Profile Student", "email": "profile@example.com", "password": "strong-pass-123"},
        )
        assert registered.status_code == 200, registered.text
        token = registered.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        defaults = client.get("/api/auth/personalization", headers=headers)
        assert defaults.status_code == 200, defaults.text
        assert defaults.json()["personalization"]["teaching_style"] == "friendly"
        assert defaults.json()["personalization"]["answer_detail"] == "balanced"

        requested = {
            "teaching_style": "calm",
            "answer_detail": "detailed",
            "learning_approach": "step_by_step",
            "use_examples": True,
            "show_diagrams": False,
            "show_formulas": True,
            "suggest_follow_ups": True,
            "quick_answers": False,
            "language": "te-IN",
            "voice_language": "te-IN",
            "voice_intelligence": "deep",
        }
        saved = client.put("/api/auth/personalization", headers=headers, json=requested)
        assert saved.status_code == 200, saved.text
        assert saved.json()["personalization"] == requested

        current = client.get("/api/auth/me", headers=headers)
        assert current.status_code == 200, current.text
        assert current.json()["user"]["personalization"] == requested

        updated_profile = client.post(
            "/api/auth/profile",
            headers=headers,
            json={"full_name": "Updated Student", "grade": "9", "board": "CBSE", "school": ""},
        )
        assert updated_profile.status_code == 200, updated_profile.text
        assert updated_profile.json()["full_name"] == "Updated Student"

        invalid = client.put(
            "/api/auth/personalization",
            headers=headers,
            json={**requested, "answer_detail": "endless"},
        )
        assert invalid.status_code == 400

    print("Tutorly profile personalization persistence and validation checks passed.")


if __name__ == "__main__":
    main()
