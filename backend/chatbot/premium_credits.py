from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx

# Shared with the existing browser/payment plan registry; never a second allowance.
_registry = (Path(__file__).resolve().parents[2] / "shared" / "tutorly-plans.js").read_text(encoding="utf-8")
_costs = json.loads(_registry.split("/*CREDIT_COSTS_JSON_START*/", 1)[1].split("/*CREDIT_COSTS_JSON_END*/", 1)[0])
EDUCATIONAL_IMAGE_CREDIT_COST = int(_costs["educationalImage"]["credits"])


class CreditServiceError(RuntimeError):
    def __init__(self, code="credit_service_unavailable", status=503, remaining=0):
        super().__init__(code)
        self.code = code
        self.status = status
        self.remaining = remaining


@dataclass(frozen=True)
class CreditReservation:
    status: str
    remaining: int
    result_url: str = ""
    reservation_token: str = ""


class PremiumCreditStore:
    """Signed server-to-server adapter to Tutorly's existing subscription balance.

    No new account, client-supplied allowance, or automatic identity linking.
    """
    async def _call(self, operation: str, **payload) -> CreditReservation:
        base = os.getenv("TUTORLY_CREDIT_SERVICE_URL", "").strip().rstrip("/")
        secret = os.getenv("TUTORLY_CREDIT_SERVICE_SECRET", "").strip()
        parts = urlsplit(base)
        local = parts.hostname in {"localhost", "127.0.0.1", "::1"}
        if (not parts.hostname or parts.username or parts.password or parts.query or parts.fragment
                or (parts.scheme != "https" and not (parts.scheme == "http" and local))
                or len(secret) < 32):
            raise CreditServiceError()
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode()
        timestamp = str(int(time.time()))
        signature = hmac.new(secret.encode(), timestamp.encode() + b"\n" + operation.encode() + b"\n" + body, hashlib.sha256).hexdigest()
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
                response = await client.post(
                    base + "/internal/credits/" + operation, content=body,
                    headers={"Content-Type": "application/json", "x-tutorly-timestamp": timestamp,
                             "x-tutorly-signature": signature},
                )
            data = response.json()
            if response.status_code != 200:
                code = data.get("code", "")
                known = {"insufficient_credits", "generation_in_progress", "idempotency_conflict",
                         "credit_account_unlinked", "credit_period_expired", "credit_reservation_missing",
                         "credit_account_changed", "stale_reservation"}
                if code not in known:
                    raise CreditServiceError()
                status = 402 if code == "insufficient_credits" else 409 if code in {
                    "generation_in_progress", "idempotency_conflict", "stale_reservation", "credit_account_changed"
                } else 503
                raise CreditServiceError(code, status, max(0, int(data.get("remaining") or 0)))
            if data.get("status") not in {"reserved", "completed", "released"}:
                raise ValueError("invalid status")
            if not isinstance(data.get("remaining"), int) or data["remaining"] < 0:
                raise ValueError("invalid balance")
            return CreditReservation(data["status"], data["remaining"], data.get("result_url", ""),
                                     data.get("reservation_token", ""))
        except CreditServiceError:
            raise
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            raise CreditServiceError() from None

    async def reserve(self, **payload) -> CreditReservation:
        return await self._call("reserve", **payload)

    async def complete(self, **payload) -> CreditReservation:
        return await self._call("complete", **payload)

    async def release(self, **payload) -> CreditReservation:
        return await self._call("release", **payload)

    async def status(self, **payload) -> CreditReservation:
        return await self._call("status", **payload)
