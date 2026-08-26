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
from backend.chatbot import routes as chatbot_routes
from backend.voice_agents import voice_agents


class FakeResponse:
    status_code = 200
    is_success = True

    @staticmethod
    def json():
        return {"token": "short-lived-conversation-token", "conversation_id": "conv_test_123"}


class FakeAsyncClient:
    last_request = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def get(self, url, *, params, headers):
        FakeAsyncClient.last_request = {"url": url, "params": params, "headers": headers}
        return FakeResponse()


def main() -> None:
    with tempfile.TemporaryDirectory() as directory:
        auth_routes.DATABASE_PATH = Path(directory) / "voice-auth-test.db"
        os.environ["TUTORLY_OTP_SECRET"] = "test-only-secret-with-at-least-24-characters"
        os.environ.pop("ELEVENLABS_API_KEY", None)

        app = FastAPI()
        app.include_router(auth_routes.router)
        app.include_router(chatbot_routes.router)
        client = TestClient(app)

        disabled = client.get("/api/voice/config")
        assert disabled.status_code == 200
        assert disabled.json()["enabled"] is False

        unauthenticated = client.post("/api/voice/session", json={"voice": "miles"})
        assert unauthenticated.status_code == 401

        registered = client.post(
            "/api/auth/register",
            json={"full_name": "Voice Student", "email": "voice@example.com", "password": "strong-pass-123"},
        )
        assert registered.status_code == 200, registered.text
        token = registered.json()["session_token"]

        os.environ["ELEVENLABS_API_KEY"] = "server-secret-test-key"
        configured = client.get("/api/voice/config")
        assert configured.status_code == 200
        assert configured.json()["enabled"] is True
        assert configured.json()["provider"] == "elevenlabs"
        assert configured.json()["transport"] == "webrtc"
        assert configured.json()["voices"] == list(voice_agents().keys())

        empty_preference = client.get(
            "/api/auth/voice-preferences",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert empty_preference.json() == {
            "preferred_voice_agent": "",
            "voice_onboarding_completed": False,
        }
        invalid_preference = client.put(
            "/api/auth/voice-preferences",
            headers={"Authorization": f"Bearer {token}"},
            json={"preferred_voice_agent": "unknown", "voice_onboarding_completed": True},
        )
        assert invalid_preference.status_code == 400
        saved_preference = client.put(
            "/api/auth/voice-preferences",
            headers={"Authorization": f"Bearer {token}"},
            json={"preferred_voice_agent": "luna", "voice_onboarding_completed": True},
        )
        assert saved_preference.status_code == 200
        assert saved_preference.json()["preferred_voice_agent"] == "luna"

        original_client = chatbot_routes.httpx.AsyncClient
        chatbot_routes.httpx.AsyncClient = FakeAsyncClient
        try:
            for voice_key, voice in voice_agents().items():
                issued = client.post(
                    "/api/voice/session",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"voice": voice_key},
                )
                assert issued.status_code == 200, issued.text
                payload = issued.json()
                assert payload["conversation_token"] == "short-lived-conversation-token"
                assert payload["transport"] == "webrtc"
                assert payload["voice"] == voice_key
                assert "server-secret-test-key" not in issued.text
                assert FakeAsyncClient.last_request["params"]["agent_id"] == voice["agent_id"]
                assert FakeAsyncClient.last_request["headers"]["xi-api-key"] == "server-secret-test-key"
        finally:
            chatbot_routes.httpx.AsyncClient = original_client
            os.environ.pop("ELEVENLABS_API_KEY", None)
    print("Tutorly ElevenLabs authenticated WebRTC-token endpoint checks passed.")


if __name__ == "__main__":
    main()
