from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI
from fastapi.testclient import TestClient

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend import auth_routes
from backend.oauth_providers import OAuthProviderError, ProviderIdentity


class FakeProvider:
    def __init__(self, provider: str, enabled: bool = True):
        self.provider = provider
        self.label = provider.title()
        self.enabled = enabled
        self.pkce = provider != "apple"

    def authorization_url(self, state: str, nonce: str, challenge: str = "") -> str:
        return f"https://{self.provider}.example/authorize?state={state}&nonce={nonce}&challenge={challenge}"

    async def exchange_and_verify(self, code: str, nonce: str, code_verifier: str = "", apple_user=None):
        if code == "invalid":
            raise OAuthProviderError("invalid_id_token")
        if code == "conflict":
            email = "existing@example.com"
            subject = f"{self.provider}-conflict"
        elif code == "returning":
            email = f"returning-{self.provider}@example.com"
            subject = f"{self.provider}-returning"
        elif code == "hidden-email":
            email = "relay-user@privaterelay.appleid.com"
            subject = "apple-hidden-email"
        else:
            email = f"new-{self.provider}@example.com"
            subject = f"{self.provider}-new"
        name = ""
        if self.provider == "apple" and apple_user and isinstance(apple_user.get("name"), dict):
            name = " ".join(filter(None, [apple_user["name"].get("firstName"), apple_user["name"].get("lastName")]))
        return ProviderIdentity(
            provider=self.provider,
            provider_user_id=subject,
            email=email,
            email_verified=code != "unverified" and self.provider != "microsoft",
            full_name=name or f"{self.label} Student",
            avatar_url=f"https://images.example/{subject}.png" if self.provider == "google" else "",
        )


def state_from_start(client: TestClient, provider: str, flow: str = "login", token: str = "") -> str:
    if flow == "connect":
        response = client.post(
            f"/api/auth/oauth/{provider}/connect-start",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        location = response.json()["authorization_url"]
    else:
        response = client.get(
            f"/api/auth/oauth/{provider}/start?flow={flow}",
            follow_redirects=False,
        )
        assert response.status_code == 302, response.text
        location = response.headers["location"]
    return parse_qs(urlsplit(location).query)["state"][0]


def complete_callback(client: TestClient, provider: str, state: str, code: str, apple_user: str = ""):
    if provider == "apple":
        form = {"state": state, "code": code}
        if apple_user:
            form["user"] = apple_user
        return client.post(
            f"/api/auth/oauth/{provider}/callback",
            data=form,
            follow_redirects=False,
        )
    return client.get(
        f"/api/auth/oauth/{provider}/callback?state={state}&code={code}",
        follow_redirects=False,
    )


def cancel_callback(client: TestClient, provider: str, state: str):
    if provider == "apple":
        return client.post(
            f"/api/auth/oauth/{provider}/callback",
            data={"state": state, "error": "user_cancelled_authorize"},
            follow_redirects=False,
        )
    return client.get(
        f"/api/auth/oauth/{provider}/callback?state={state}&error=access_denied",
        follow_redirects=False,
    )


def redeem_redirect(client: TestClient, response):
    assert response.status_code == 303, response.text
    query = parse_qs(urlsplit(response.headers["location"]).query)
    assert "oauth_result" in query, response.headers["location"]
    completed = client.post("/api/auth/oauth/complete", json={"result_code": query["oauth_result"][0]})
    assert completed.status_code == 200, completed.text
    return completed.json()


def main() -> None:
    with tempfile.TemporaryDirectory() as directory:
        auth_routes.DATABASE_PATH = Path(directory) / "social-auth-test.db"
        os.environ["TUTORLY_FRONTEND_ORIGIN"] = "https://mytutor.co.in"
        os.environ["TUTORLY_OTP_SECRET"] = "test-only-secret-with-at-least-24-characters"
        os.environ["SMTP_HOST"] = "smtp.test.invalid"
        os.environ["SMTP_PORT"] = "587"
        os.environ["SMTP_USERNAME"] = "test-user"
        os.environ["SMTP_PASSWORD"] = "test-password"
        os.environ["SMTP_FROM_EMAIL"] = "no-reply@tutorly.test"

        providers = {name: FakeProvider(name) for name in ("google", "microsoft", "apple")}
        auth_routes.provider_configs = lambda: providers

        app = FastAPI()
        app.include_router(auth_routes.router)
        client = TestClient(app)

        discovery = client.get("/api/auth/providers")
        assert discovery.status_code == 200
        assert all(item["enabled"] for item in discovery.json()["providers"])

        # New and returning users for every provider use the same Tutorly session path.
        for provider in providers:
            state = state_from_start(client, provider, "signup")
            apple_name = '{"name":{"firstName":"Apple","lastName":"Student"}}' if provider == "apple" else ""
            created = redeem_redirect(client, complete_callback(client, provider, state, f"new-{provider}", apple_name))
            assert created["authenticated"] is True
            assert created["onboarding_required"] is True
            assert created["user"]["email"] == f"new-{provider}@example.com"

            # Reuse the exact stable provider identity without creating another user.
            state = state_from_start(client, provider)
            returned = redeem_redirect(client, complete_callback(client, provider, state, f"new-{provider}"))
            assert returned["user"]["id"] == created["user"]["id"]

        # State is single-use and callback errors never create partial accounts.
        state = state_from_start(client, "google")
        cancelled = cancel_callback(client, "google", state)
        assert "oauth_error=cancelled" in cancelled.headers["location"]
        replay = complete_callback(client, "google", state, "new-google")
        assert "oauth_error=state_invalid" in replay.headers["location"]
        for provider in ("microsoft", "apple"):
            state = state_from_start(client, provider)
            cancelled = cancel_callback(client, provider, state)
            assert "oauth_error=cancelled" in cancelled.headers["location"]
        invalid_state = complete_callback(client, "microsoft", "not-a-real-state", "new-microsoft")
        assert "oauth_error=state_invalid" in invalid_state.headers["location"]

        for provider in providers:
            state = state_from_start(client, provider)
            invalid_identity = complete_callback(client, provider, state, "invalid")
            assert "oauth_error=identity_invalid" in invalid_identity.headers["location"]
        state = state_from_start(client, "google")
        unverified = complete_callback(client, "google", state, "unverified")
        assert "oauth_error=identity_invalid" in unverified.headers["location"]

        # Apple private relay and first-login-only name remain valid on later sign-in.
        state = state_from_start(client, "apple", "signup")
        hidden = redeem_redirect(
            client,
            complete_callback(
                client,
                "apple",
                state,
                "hidden-email",
                '{"name":{"firstName":"Relay","lastName":"Student"}}',
            ),
        )
        assert hidden["user"]["email"].endswith("@privaterelay.appleid.com")
        assert hidden["user"]["full_name"] == "Relay Student"
        state = state_from_start(client, "apple")
        hidden_return = redeem_redirect(client, complete_callback(client, "apple", state, "hidden-email"))
        assert hidden_return["user"]["full_name"] == "Relay Student"

        # Same-email accounts are not silently merged.
        registered = client.post(
            "/api/auth/register",
            json={"full_name": "Existing Student", "email": "existing@example.com", "password": "strong-pass-123"},
        )
        assert registered.status_code == 200
        state = state_from_start(client, "google")
        conflict = complete_callback(client, "google", state, "conflict")
        assert "oauth_error=account_exists" in conflict.headers["location"]

        # The authenticated user may explicitly connect the provider instead.
        token = registered.json()["session_token"]
        state = state_from_start(client, "google", "connect", token)
        connected = complete_callback(client, "google", state, "conflict")
        assert "oauth_connected=google" in connected.headers["location"]
        accounts = client.get(
            "/api/auth/connected-accounts",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert next(item for item in accounts.json()["accounts"] if item["provider"] == "google")["connected"] is True

        # Grade/Board are authoritative server-side; school remains optional.
        saved = client.post(
            "/api/auth/profile",
            json={"grade": "9", "board": "CBSE", "school": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert saved.status_code == 200, saved.text
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["onboarding_required"] is False
        assert me.json()["user"]["grade"] == "9"

        # A connected-only account cannot lose its final login method.
        social_token = hidden_return["session_token"]
        last_method = client.delete(
            "/api/auth/connected-accounts/apple",
            headers={"Authorization": f"Bearer {social_token}"},
        )
        assert last_method.status_code == 409

        logged_out = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert logged_out.status_code == 200
        expired = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert expired.status_code == 401

    print("Tutorly Google, Microsoft, Apple, linking, onboarding, session, and conflict checks passed.")


if __name__ == "__main__":
    main()
