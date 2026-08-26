from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import ECKey, KeySet


class OAuthProviderError(Exception):
    """A sanitized provider failure that is safe to classify in server logs."""

    def __init__(self, category: str):
        super().__init__(category)
        self.category = category


@dataclass(frozen=True)
class ProviderIdentity:
    provider: str
    provider_user_id: str
    email: str
    email_verified: bool
    full_name: str = ""
    avatar_url: str = ""


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    label: str
    client_id: str
    client_secret: str
    redirect_uri: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    issuer: str
    scopes: tuple[str, ...]
    pkce: bool = True
    tenant: str = ""
    team_id: str = ""
    key_id: str = ""
    private_key: str = ""

    @property
    def enabled(self) -> bool:
        common = bool(self.client_id and self.redirect_uri)
        if self.provider == "apple":
            return common and bool(self.team_id and self.key_id and self.private_key)
        return common and bool(self.client_secret)

    def authorization_url(self, state: str, nonce: str, code_challenge: str = "") -> str:
        params: dict[str, str] = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(self.scopes),
            "state": state,
            "nonce": nonce,
        }
        if self.provider == "apple":
            params["response_mode"] = "form_post"
        else:
            params["response_mode"] = "query"
        if self.pkce and code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"
        return f"{self.authorization_endpoint}?{urlencode(params)}"

    async def exchange_and_verify(
        self,
        code: str,
        nonce: str,
        code_verifier: str = "",
        apple_user: dict[str, Any] | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> ProviderIdentity:
        owns_client = client is None
        http_client = client or httpx.AsyncClient(timeout=httpx.Timeout(15.0))
        try:
            token_data: dict[str, str] = {
                "grant_type": "authorization_code",
                "code": code,
                "client_id": self.client_id,
                "redirect_uri": self.redirect_uri,
            }
            if self.provider == "apple":
                token_data["client_secret"] = self._apple_client_secret()
            else:
                token_data["client_secret"] = self.client_secret
            if self.pkce and code_verifier:
                token_data["code_verifier"] = code_verifier

            response = await http_client.post(
                self.token_endpoint,
                data=token_data,
                headers={"Accept": "application/json"},
            )
            if response.status_code >= 400:
                raise OAuthProviderError("token_exchange_rejected")
            token_payload = response.json()
            if not isinstance(token_payload, dict):
                raise OAuthProviderError("provider_response_invalid")
            id_token = str(token_payload.get("id_token") or "")
            if not id_token:
                raise OAuthProviderError("missing_id_token")

            claims = await self._verified_claims(id_token, nonce, http_client)
            return self._identity_from_claims(claims, apple_user or {})
        except OAuthProviderError:
            raise
        except (httpx.HTTPError, ValueError, KeyError, JoseError, json.JSONDecodeError):
            raise OAuthProviderError("provider_response_invalid") from None
        finally:
            if owns_client:
                await http_client.aclose()

    async def _verified_claims(
        self,
        id_token: str,
        nonce: str,
        client: httpx.AsyncClient,
    ) -> dict[str, Any]:
        header = _jwt_header(id_token)
        if header.get("alg") != "RS256" or not header.get("kid"):
            raise OAuthProviderError("unsupported_token_signature")

        response = await client.get(self.jwks_uri, headers={"Accept": "application/json"})
        response.raise_for_status()
        jwks = response.json()
        try:
            token = jwt.decode(id_token, KeySet.import_key_set(jwks), algorithms=["RS256"])
        except JoseError:
            raise OAuthProviderError("invalid_id_token") from None

        values = dict(token.claims)
        now = int(time.time())
        audience = values.get("aud")
        audience_ok = self.client_id in audience if isinstance(audience, list) else audience == self.client_id
        if not audience_ok:
            raise OAuthProviderError("invalid_audience")
        if int(values.get("exp") or 0) <= now - 60:
            raise OAuthProviderError("expired_id_token")
        if int(values.get("nbf") or 0) > now + 60 or int(values.get("iat") or 0) > now + 60:
            raise OAuthProviderError("invalid_token_time")
        if not values.get("sub"):
            raise OAuthProviderError("missing_subject")
        if not nonce or values.get("nonce") != nonce:
            raise OAuthProviderError("invalid_nonce")
        if not self._issuer_is_valid(str(values.get("iss") or ""), values):
            raise OAuthProviderError("invalid_issuer")
        return values

    def _issuer_is_valid(self, issuer: str, claims: dict[str, Any]) -> bool:
        if self.provider == "google":
            return issuer in {"https://accounts.google.com", "accounts.google.com"}
        if self.provider == "apple":
            return issuer == "https://appleid.apple.com"
        tenant_id = str(claims.get("tid") or "").strip()
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", tenant_id):
            return False
        return issuer.rstrip("/") == f"https://login.microsoftonline.com/{tenant_id}/v2.0"

    def _identity_from_claims(
        self,
        claims: dict[str, Any],
        apple_user: dict[str, Any],
    ) -> ProviderIdentity:
        email = str(claims.get("email") or "").strip().lower()
        email_verified = _as_bool(claims.get("email_verified"))
        full_name = str(claims.get("name") or "").strip()
        avatar_url = str(claims.get("picture") or "").strip()

        if self.provider == "microsoft":
            email = str(claims.get("email") or claims.get("preferred_username") or "").strip().lower()
            # Microsoft signs the account claim but does not expose a universal
            # email_verified claim. It is never used for automatic account linking.
            email_verified = _as_bool(claims.get("email_verified"))
        elif self.provider == "apple":
            name = apple_user.get("name") if isinstance(apple_user, dict) else None
            if isinstance(name, dict):
                full_name = " ".join(
                    part.strip()
                    for part in (str(name.get("firstName") or ""), str(name.get("lastName") or ""))
                    if part.strip()
                )

        if not _looks_like_email(email):
            raise OAuthProviderError("provider_email_missing")
        return ProviderIdentity(
            provider=self.provider,
            provider_user_id=str(claims["sub"]),
            email=email,
            email_verified=email_verified,
            full_name=full_name,
            avatar_url=avatar_url,
        )

    def _apple_client_secret(self) -> str:
        now = int(time.time())
        key = self.private_key.replace("\\n", "\n").strip()
        try:
            encoded = jwt.encode(
                {"alg": "ES256", "kid": self.key_id},
                {
                    "iss": self.team_id,
                    "iat": now,
                    "exp": now + 300,
                    "aud": "https://appleid.apple.com",
                    "sub": self.client_id,
                },
                ECKey.import_key(key),
                algorithms=["ES256"],
            )
        except (JoseError, ValueError):
            raise OAuthProviderError("apple_client_secret_invalid") from None
        return encoded.decode("utf-8") if isinstance(encoded, bytes) else str(encoded)


def provider_configs() -> dict[str, ProviderConfig]:
    microsoft_tenant = os.getenv("MICROSOFT_TENANT", "common").strip() or "common"
    if not re.fullmatch(r"[A-Za-z0-9.-]{1,128}", microsoft_tenant):
        microsoft_tenant = "common"
    microsoft_base = f"https://login.microsoftonline.com/{microsoft_tenant}"
    return {
        "google": ProviderConfig(
            provider="google",
            label="Google",
            client_id=os.getenv("GOOGLE_CLIENT_ID", "").strip(),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET", "").strip(),
            redirect_uri=os.getenv("GOOGLE_REDIRECT_URI", "").strip(),
            authorization_endpoint="https://accounts.google.com/o/oauth2/v2/auth",
            token_endpoint="https://oauth2.googleapis.com/token",
            jwks_uri="https://www.googleapis.com/oauth2/v3/certs",
            issuer="https://accounts.google.com",
            scopes=("openid", "email", "profile"),
        ),
        "microsoft": ProviderConfig(
            provider="microsoft",
            label="Microsoft",
            client_id=os.getenv("MICROSOFT_CLIENT_ID", "").strip(),
            client_secret=os.getenv("MICROSOFT_CLIENT_SECRET", "").strip(),
            redirect_uri=os.getenv("MICROSOFT_REDIRECT_URI", "").strip(),
            authorization_endpoint=f"{microsoft_base}/oauth2/v2.0/authorize",
            token_endpoint=f"{microsoft_base}/oauth2/v2.0/token",
            jwks_uri=f"{microsoft_base}/discovery/v2.0/keys",
            issuer=microsoft_base,
            scopes=("openid", "email", "profile"),
            tenant=microsoft_tenant,
        ),
        "apple": ProviderConfig(
            provider="apple",
            label="Apple",
            client_id=os.getenv("APPLE_CLIENT_ID", "").strip(),
            client_secret="",
            redirect_uri=os.getenv("APPLE_REDIRECT_URI", "").strip(),
            authorization_endpoint="https://appleid.apple.com/auth/authorize",
            token_endpoint="https://appleid.apple.com/auth/token",
            jwks_uri="https://appleid.apple.com/auth/keys",
            issuer="https://appleid.apple.com",
            scopes=("name", "email"),
            pkce=False,
            team_id=os.getenv("APPLE_TEAM_ID", "").strip(),
            key_id=os.getenv("APPLE_KEY_ID", "").strip(),
            private_key=os.getenv("APPLE_PRIVATE_KEY", "").strip(),
        ),
    }


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _jwt_header(token: str) -> dict[str, Any]:
    try:
        encoded = token.split(".", 1)[0]
        padding = "=" * (-len(encoded) % 4)
        value = json.loads(base64.urlsafe_b64decode(encoded + padding))
    except (ValueError, json.JSONDecodeError):
        raise OAuthProviderError("invalid_token_header") from None
    if not isinstance(value, dict):
        raise OAuthProviderError("invalid_token_header")
    return value


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() == "true"


def _looks_like_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value)) and len(value) <= 254
