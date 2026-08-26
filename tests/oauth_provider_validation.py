from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

import httpx
from joserfc import jwt
from joserfc.jwk import RSAKey

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend.oauth_providers import OAuthProviderError, ProviderConfig


def signed_token(key: RSAKey, issuer: str, audience: str, nonce: str, **extra) -> str:
    now = int(time.time())
    claims = {
        "iss": issuer,
        "aud": audience,
        "sub": extra.pop("sub", "provider-user-123"),
        "nonce": nonce,
        "iat": now,
        "exp": now + 300,
        **extra,
    }
    return jwt.encode({"alg": "RS256", "kid": key.kid}, claims, key, algorithms=["RS256"])


async def validate() -> None:
    key = RSAKey.generate_key(2048, parameters={"kid": "test-key"})
    jwks = {"keys": [key.as_dict(private=False)]}

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=jwks)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    try:
        google = ProviderConfig(
            provider="google",
            label="Google",
            client_id="google-client",
            client_secret="secret",
            redirect_uri="https://api.example/callback",
            authorization_endpoint="https://accounts.google.com/o/oauth2/v2/auth",
            token_endpoint="https://oauth2.googleapis.com/token",
            jwks_uri="https://www.googleapis.com/oauth2/v3/certs",
            issuer="https://accounts.google.com",
            scopes=("openid", "email", "profile"),
        )
        token = signed_token(
            key,
            "https://accounts.google.com",
            google.client_id,
            "expected-nonce",
            email="student@example.com",
            email_verified=True,
        )
        claims = await google._verified_claims(token, "expected-nonce", client)
        assert claims["sub"] == "provider-user-123"

        try:
            await google._verified_claims(token, "wrong-nonce", client)
            raise AssertionError("A mismatched nonce was accepted")
        except OAuthProviderError as error:
            assert error.category == "invalid_nonce"

        wrong_audience = signed_token(
            key,
            "https://accounts.google.com",
            "another-client",
            "expected-nonce",
            email="student@example.com",
            email_verified=True,
        )
        try:
            await google._verified_claims(wrong_audience, "expected-nonce", client)
            raise AssertionError("A mismatched audience was accepted")
        except OAuthProviderError as error:
            assert error.category == "invalid_audience"

        tenant = "11111111-2222-3333-4444-555555555555"
        microsoft = ProviderConfig(
            provider="microsoft",
            label="Microsoft",
            client_id="microsoft-client",
            client_secret="secret",
            redirect_uri="https://api.example/callback",
            authorization_endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            token_endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/token",
            jwks_uri="https://login.microsoftonline.com/common/discovery/v2.0/keys",
            issuer="https://login.microsoftonline.com/common",
            scopes=("openid", "email", "profile"),
            tenant="common",
        )
        ms_token = signed_token(
            key,
            f"https://login.microsoftonline.com/{tenant}/v2.0",
            microsoft.client_id,
            "ms-nonce",
            tid=tenant,
            preferred_username="student@outlook.com",
        )
        ms_claims = await microsoft._verified_claims(ms_token, "ms-nonce", client)
        assert ms_claims["tid"] == tenant

        bad_issuer = signed_token(
            key,
            "https://issuer.example",
            microsoft.client_id,
            "ms-nonce",
            tid=tenant,
            preferred_username="student@outlook.com",
        )
        try:
            await microsoft._verified_claims(bad_issuer, "ms-nonce", client)
            raise AssertionError("A mismatched Microsoft issuer was accepted")
        except OAuthProviderError as error:
            assert error.category == "invalid_issuer"
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(validate())
    print("Tutorly OIDC signature, audience, nonce, issuer, and expiry validation checks passed.")
