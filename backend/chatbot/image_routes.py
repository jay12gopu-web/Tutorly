from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

try:
    from backend.auth_routes import authenticated_user_context
except ImportError:
    from auth_routes import authenticated_user_context

from .image_generation import ImageGenerationError, ImageGenerationService, image_generation_configured
from .premium_credits import EDUCATIONAL_IMAGE_CREDIT_COST, CreditServiceError, PremiumCreditStore
from .rate_limit import SlidingWindowRateLimiter

router = APIRouter(prefix="/api", tags=["study-images"])
LOGGER = logging.getLogger("tutorly.images")
service = ImageGenerationService(Path(__file__).resolve().parents[2] / "uploads" / "generated")
credits = PremiumCreditStore()
limiter = SlidingWindowRateLimiter(requests_per_minute=3, requests_per_hour=20)
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class EducationalImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    idempotency_key: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9:_-]+$")
    action: Literal["educationalImage"] = "educationalImage"
    visual_type: Literal["educational_illustration"] = "educational_illustration"
    topic: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=1800)
    required_labels: list[Label] = Field(default_factory=list, max_length=7)
    educational_context: str = Field(default="", max_length=500)
    style: Literal["clean_educational", "textbook_illustration", "realistic_scene", "historical_scene", "geography_illustration"] = "clean_educational"
    aspect_ratio: Literal["square", "landscape", "portrait"] = "landscape"
    alt_text: str = Field(default="Study illustration", max_length=180)


def credit_error(error: CreditServiceError) -> HTTPException:
    messages = {
        "insufficient_credits": "There aren't enough premium credits for this illustration. Normal tutoring is still available.",
        "generation_in_progress": "Your illustration is still being created. Retry shortly to check the same request.",
        "idempotency_conflict": "This image request has changed. Please request a new illustration.",
    }
    return HTTPException(error.status, detail={
        "code": error.code, "remaining": error.remaining, "required": EDUCATIONAL_IMAGE_CREDIT_COST,
        "message": messages.get(error.code, "Study illustrations are temporarily unavailable. Your explanation is still available."),
    })


def image_response(payload, reservation, url, cached):
    return {
        "ok": True, "cached": cached,
        "image": {"url": url, "alt_text": payload.alt_text, "provider": "openai"},
        "credits": {"action": "educationalImage", "charged": 0 if cached else EDUCATIONAL_IMAGE_CREDIT_COST,
                    "remaining": reservation.remaining},
    }


@router.post("/images/generate")
async def generate_image(payload: EducationalImageRequest, authorization: str | None = Header(default=None)):
    account = authenticated_user_context(authorization)
    decision = limiter.check(str(account["id"]))
    if not decision.allowed:
        raise HTTPException(429, "Please wait a moment before requesting another image.",
                            headers={"Retry-After": str(decision.retry_after_seconds)})
    spec = payload.model_dump(exclude={"idempotency_key"})
    request_hash = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
    identity = hashlib.sha256(f"{account['id']}:{payload.idempotency_key}:{request_hash}".encode()).hexdigest()[:32]
    filename = f"study-{identity}.png"
    artifact = service.output_directory / filename
    result_url = f"/uploads/generated/{filename}"
    common = {"user_id": str(account["id"]), "idempotency_key": payload.idempotency_key, "request_hash": request_hash}
    # Recover a saved provider result after an interrupted/ambiguous settlement.
    # Never send another paid provider request for a completed or saved image.
    if artifact.is_file():
        try:
            previous = await credits.status(**common)
            if previous.status == "completed":
                if previous.result_url != result_url:
                    raise CreditServiceError()
                return image_response(payload, previous, result_url, True)
            if previous.status == "reserved":
                try:
                    recovered = await credits.complete(**common, reservation_token=previous.reservation_token, result_url=result_url)
                    return image_response(payload, recovered, result_url, True)
                except CreditServiceError as error:
                    if error.code != "stale_reservation":
                        raise
        except CreditServiceError as error:
            if error.code != "credit_reservation_missing":
                raise credit_error(error) from None
    if not artifact.is_file() and not image_generation_configured():
        raise HTTPException(503, "Study illustrations are temporarily unavailable. You can still use the written explanation.")
    try:
        reservation = await credits.reserve(**common, action="educationalImage")
    except CreditServiceError as error:
        raise credit_error(error) from None
    if reservation.status == "completed":
        # Missing storage must not cause a second generation/debit.
        if not artifact.is_file() or reservation.result_url != result_url:
            raise HTTPException(503, "This saved illustration is unavailable. It will not be charged again.")
        return image_response(payload, reservation, result_url, True)
    settlement = {**common, "reservation_token": reservation.reservation_token}

    async def refund():
        try:
            await credits.release(**settlement)
        except CreditServiceError:
            LOGGER.warning("Study image credit release pending reconciliation")

    try:
        if not artifact.is_file():
            await service.generate(
                topic=payload.topic, description=payload.description, required_labels=payload.required_labels,
                educational_context=payload.educational_context, style=payload.style,
                aspect_ratio=payload.aspect_ratio, image_id=identity,
            )
    except asyncio.CancelledError:
        await asyncio.shield(refund())
        raise
    except Exception as error:
        await refund()
        category = error.status if isinstance(error, ImageGenerationError) else "internal"
        LOGGER.warning("Study image generation failed category=%s", category)
        raise HTTPException(502, "The illustration couldn't be created. Your written explanation is still available; retry checks the same request.") from None

    try:
        completed = await credits.complete(**settlement, result_url=result_url)
    except CreditServiceError as error:
        # Keep the saved result for retry. Refunding here could give a free image
        # if the first settlement succeeded but its network response was lost.
        LOGGER.warning("Study image settlement pending category=%s", error.code)
        raise HTTPException(503, "Your illustration is saved. Retry to finish checking this request without generating or charging it twice.") from None
    return image_response(payload, completed, result_url, False)
