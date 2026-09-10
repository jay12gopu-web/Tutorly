from __future__ import annotations

import base64
import binascii
import asyncio
import io
import os
import re
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError


_OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations"
_MAX_GENERATED_IMAGE_BYTES = 24 * 1024 * 1024
_MAX_PROVIDER_RESPONSE_BYTES = 34 * 1024 * 1024
_ALLOWED_STYLES = {
    "clean_educational",
    "textbook_illustration",
    "realistic_scene",
    "historical_scene",
    "geography_illustration",
}
_SIZE_BY_RATIO = {
    "square": "1024x1024",
    "landscape": "1536x1024",
    "portrait": "1024x1536",
}


class ImageGenerationError(RuntimeError):
    def __init__(self, status: str) -> None:
        super().__init__(status)
        self.status = status


@dataclass(frozen=True)
class GeneratedImage:
    url: str
    filename: str
    provider: str
    model: str
    width: int
    height: int


def _is_local_development() -> bool:
    if any(os.getenv(name, "").strip() for name in ("RENDER", "K_SERVICE", "WEBSITE_INSTANCE_ID", "VERCEL")):
        return False
    environments = [os.getenv(name, "").strip().lower() for name in ("TUTORLY_ENV", "NODE_ENV", "ENVIRONMENT")]
    if any(value and value not in {"development", "dev", "local", "test"} for value in environments):
        return False
    # An unset environment is not proof of local development.
    return any(value in {"development", "dev", "local"} for value in environments)


def image_api_key() -> tuple[str, str]:
    dedicated = os.getenv("OPENAI_IMAGE_API_KEY", "").strip()
    if dedicated:
        return dedicated, "OPENAI_IMAGE_API_KEY"
    if _is_local_development():
        fallback = os.getenv("OPENAI_API_KEY", "").strip()
        if fallback:
            return fallback, "OPENAI_API_KEY_LOCAL_FALLBACK"
    return "", ""


def image_generation_configured() -> bool:
    return bool(image_api_key()[0])


class ImageGenerationService:
    """Backend-only OpenAI image provider adapter for Tutorly study visuals."""

    def __init__(self, output_directory: Path, *, timeout_seconds: float = 120.0) -> None:
        self.output_directory = Path(output_directory)
        self.timeout_seconds = max(15.0, min(float(timeout_seconds), 120.0))

    @property
    def provider(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return os.getenv("TUTORLY_IMAGE_MODEL", "gpt-image-1-mini").strip() or "gpt-image-1-mini"

    async def generate(
        self,
        *,
        topic: str,
        description: str,
        required_labels: list[str],
        educational_context: str,
        style: str,
        aspect_ratio: str,
        image_id: str | None = None,
    ) -> GeneratedImage:
        api_key, _source = image_api_key()
        if not api_key:
            raise ImageGenerationError("not_configured")

        safe_topic = self._clean(topic, 160)
        safe_description = self._clean(description, 1800)
        safe_context = self._clean(educational_context, 500)
        safe_labels = [self._clean(label, 80) for label in required_labels[:7] if self._clean(label, 80)]
        normalized_style = style if style in _ALLOWED_STYLES else "clean_educational"
        normalized_ratio = aspect_ratio if aspect_ratio in _SIZE_BY_RATIO else "landscape"
        if not safe_topic or not safe_description:
            raise ImageGenerationError("invalid_request")

        label_instruction = (
            " Include only these short, correctly spelled labels: " + ", ".join(safe_labels) + "."
            if safe_labels else
            " Avoid decorative text and do not add a title inside the image."
        )
        prompt = (
            f"Create an original, age-appropriate educational visual about {safe_topic}. "
            f"{safe_description} Context: {safe_context}. "
            f"Style: {normalized_style.replace('_', ' ')}, clear, uncluttered, accurate, high contrast, "
            f"student-friendly, with no logos or watermarks.{label_instruction}"
        )[:3000]
        payload = {
            "model": self.model,
            "prompt": prompt,
            "size": _SIZE_BY_RATIO[normalized_ratio],
            "quality": "medium",
            "output_format": "png",
            "n": 1,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout_seconds, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    _OPENAI_IMAGE_URL,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                ) as response:
                    self._check_response_status(response.status_code)
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > _MAX_PROVIDER_RESPONSE_BYTES:
                            raise ImageGenerationError("invalid_provider_output")
        except httpx.TimeoutException:
            raise ImageGenerationError("timeout") from None
        except httpx.HTTPError:
            raise ImageGenerationError("network") from None

        try:
            import json
            response_payload = json.loads(body)
            encoded = response_payload["data"][0]["b64_json"]
            if not isinstance(encoded, str) or len(encoded) > (_MAX_GENERATED_IMAGE_BYTES * 4 // 3 + 4):
                raise ValueError("invalid image data")
            image_bytes = base64.b64decode(encoded, validate=True)
        except (KeyError, IndexError, TypeError, ValueError, binascii.Error):
            raise ImageGenerationError("invalid_provider_output") from None
        return await asyncio.to_thread(self._validate_and_save, image_bytes, image_id)

    def _validate_and_save(self, image_bytes: bytes, image_id: str | None) -> GeneratedImage:
        normalized, width, height = self._validated_png(image_bytes)
        identity = image_id or uuid.uuid4().hex
        if not re.fullmatch(r"[a-f0-9]{32}", identity):
            raise ImageGenerationError("invalid_request")
        self.output_directory.mkdir(parents=True, exist_ok=True)
        filename = f"study-{identity}.png"
        destination = self.output_directory / filename
        temporary = destination.with_suffix(f".{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(normalized)
            temporary.replace(destination)
        except OSError:
            temporary.unlink(missing_ok=True)
            raise ImageGenerationError("storage_unavailable") from None
        return GeneratedImage(
            url=f"/uploads/generated/{filename}",
            filename=filename,
            provider=self.provider,
            model=self.model,
            width=width,
            height=height,
        )

    @staticmethod
    def _clean(value: str, limit: int) -> str:
        cleaned = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or ""))
        return re.sub(r"\s+", " ", cleaned).strip()[:limit]

    @staticmethod
    def _check_response_status(status: int) -> None:
        if status == 429:
            raise ImageGenerationError("rate_limited")
        if status in {401, 403}:
            raise ImageGenerationError("authentication_failed")
        if not 200 <= status < 300:
            raise ImageGenerationError("provider_error")

    @staticmethod
    def _validated_png(payload: bytes) -> tuple[bytes, int, int]:
        if not payload or len(payload) > _MAX_GENERATED_IMAGE_BYTES:
            raise ImageGenerationError("invalid_provider_output")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(payload)) as candidate:
                    if candidate.format != "PNG" or max(candidate.size) > 4096 or min(candidate.size) < 64:
                        raise ValueError("invalid image")
                    candidate.verify()
                with Image.open(io.BytesIO(payload)) as candidate:
                    candidate.load()
                    width, height = candidate.size
                    output = io.BytesIO()
                    # Strip arbitrary metadata and trailing content before serving a raster.
                    candidate.convert("RGB").save(output, format="PNG")
                    return output.getvalue(), width, height
        except (OSError, ValueError, SyntaxError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise ImageGenerationError("invalid_provider_output") from None
