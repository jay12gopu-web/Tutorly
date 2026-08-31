from __future__ import annotations

import asyncio
import io
import os
import re
import zipfile
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx


SARVAM_API_BASE = "https://api.sarvam.ai"
SARVAM_DIGITISE_PATH = "/doc-ai/v1/job/digitise"
TERMINAL_STATUSES = {"completed", "partially_completed", "failed", "rejected"}
SUCCESS_STATUSES = {"completed", "partially_completed"}
SUPPORTED_LANGUAGES = {
    "as-IN", "bn-IN", "brx-IN", "doi-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN",
    "kok-IN", "ks-IN", "mai-IN", "ml-IN", "mni-IN", "mr-IN", "ne-IN", "od-IN",
    "pa-IN", "sa-IN", "sat-IN", "sd-IN", "ta-IN", "te-IN", "ur-IN",
}
LANGUAGE_ALIASES = {
    "as": "as-IN", "bn": "bn-IN", "brx": "brx-IN", "doi": "doi-IN", "en": "en-IN",
    "gu": "gu-IN", "hi": "hi-IN", "kn": "kn-IN", "kok": "kok-IN", "ks": "ks-IN",
    "mai": "mai-IN", "ml": "ml-IN", "mni": "mni-IN", "mr": "mr-IN", "ne": "ne-IN",
    "od": "od-IN", "or": "od-IN", "pa": "pa-IN", "sa": "sa-IN", "sat": "sat-IN",
    "sd": "sd-IN", "ta": "ta-IN", "te": "te-IN", "ur": "ur-IN",
}


class SarvamVisionError(RuntimeError):
    def __init__(self, status: str, message: str = "Sarvam Vision extraction failed") -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class VisionExtraction:
    text: str
    language: str
    job_id: str
    partial: bool = False


def normalize_document_language(value: str | None) -> str:
    candidate = str(value or "").strip()
    if candidate in SUPPORTED_LANGUAGES:
        return candidate
    prefix = candidate.lower().split("-", 1)[0]
    return LANGUAGE_ALIASES.get(prefix, "en-IN")


def clean_document_text(value: str) -> str:
    """Remove unsafe controls without flattening layout, tables, numbering, or scripts."""
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x00", "").replace("\x0c", "\n\n")
    text = "".join(character for character in text if character in {"\n", "\t"} or ord(character) >= 32)
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _markdown_from_archive(payload: bytes, max_output_bytes: int) -> str:
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except (OSError, zipfile.BadZipFile) as error:
        raise SarvamVisionError("invalid_output", "Sarvam Vision returned an unreadable archive") from error

    with archive:
        safe_files = [
            item
            for item in archive.infolist()
            if not item.is_dir()
            and not item.filename.startswith(("/", "\\"))
            and ".." not in item.filename.replace("\\", "/").split("/")
        ]
        candidates = [item for item in safe_files if item.filename.lower().endswith(".md")]
        if not candidates:
            candidates = [item for item in safe_files if item.filename.lower().endswith(".txt")]
        candidates.sort(key=lambda item: item.filename.lower())
        if not candidates:
            raise SarvamVisionError("invalid_output", "Sarvam Vision returned no text output")

        total_size = sum(item.file_size for item in candidates)
        if total_size <= 0 or total_size > max_output_bytes:
            raise SarvamVisionError("invalid_output", "Sarvam Vision output size was invalid")

        sections: list[str] = []
        for item in candidates:
            try:
                decoded = archive.read(item).decode("utf-8")
            except (KeyError, OSError, UnicodeDecodeError) as error:
                raise SarvamVisionError("invalid_output", "Sarvam Vision text could not be decoded") from error
            cleaned = clean_document_text(decoded)
            if cleaned:
                sections.append(cleaned)
        return "\n\n".join(sections).strip()


class SarvamVisionService:
    def __init__(
        self,
        *,
        api_base: str = SARVAM_API_BASE,
        timeout_seconds: float = 55.0,
        poll_interval_seconds: float = 1.5,
        max_output_bytes: int = 8 * 1024 * 1024,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_base = api_base.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.max_output_bytes = max_output_bytes
        self.transport = transport

    @property
    def configured(self) -> bool:
        return bool(os.getenv("SARVAM_API_KEY", "").strip())

    @staticmethod
    def _provider_status(response: httpx.Response) -> str:
        if response.status_code in {402, 403}:
            return "not_configured"
        if response.status_code == 429:
            return "rate_limited"
        if response.status_code in {408, 504}:
            return "timeout"
        if response.status_code in {400, 413, 415, 422}:
            return "invalid_image"
        return "provider_unavailable"

    async def extract(
        self,
        *,
        image: bytes,
        filename: str,
        mime_type: str,
        language: str | None,
    ) -> VisionExtraction:
        api_key = os.getenv("SARVAM_API_KEY", "").strip()
        if not api_key:
            raise SarvamVisionError("not_configured", "SARVAM_API_KEY is not configured")

        normalized_language = normalize_document_language(language)
        timeout = httpx.Timeout(self.timeout_seconds, connect=8.0)
        headers = {"api-subscription-key": api_key, "Accept": "application/json"}
        deadline = asyncio.get_running_loop().time() + self.timeout_seconds

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                transport=self.transport,
                follow_redirects=True,
            ) as client:
                created = await client.post(
                    f"{self.api_base}{SARVAM_DIGITISE_PATH}",
                    headers=headers,
                    files={"file": (filename, image, mime_type)},
                    data={"language": normalized_language, "output_format": "md"},
                )
                if not created.is_success:
                    raise SarvamVisionError(self._provider_status(created))
                try:
                    created_payload = created.json()
                except (TypeError, ValueError) as error:
                    raise SarvamVisionError("invalid_output") from error

                job_id = str(created_payload.get("job_id") or "").strip()
                status = str(created_payload.get("status") or "pending").strip().lower()
                if not job_id or len(job_id) > 200:
                    raise SarvamVisionError("invalid_output")

                while status not in TERMINAL_STATUSES:
                    if asyncio.get_running_loop().time() >= deadline:
                        raise SarvamVisionError("timeout")
                    if self.poll_interval_seconds > 0:
                        await asyncio.sleep(self.poll_interval_seconds)
                    status_response = await client.get(
                        f"{self.api_base}/doc-ai/v1/job/{job_id}/status",
                        headers=headers,
                    )
                    if not status_response.is_success:
                        raise SarvamVisionError(self._provider_status(status_response))
                    try:
                        status_payload = status_response.json()
                    except (TypeError, ValueError) as error:
                        raise SarvamVisionError("invalid_output") from error
                    status = str(status_payload.get("status") or "").strip().lower()

                if status not in SUCCESS_STATUSES:
                    raise SarvamVisionError("provider_rejected")

                download_response = await client.get(
                    f"{self.api_base}/doc-ai/v1/job/{job_id}/download-url",
                    headers=headers,
                )
                if not download_response.is_success:
                    raise SarvamVisionError(self._provider_status(download_response))
                try:
                    download_payload = download_response.json()
                except (TypeError, ValueError) as error:
                    raise SarvamVisionError("invalid_output") from error

                download_url = str(download_payload.get("url") or "").strip()
                download_method = str(download_payload.get("method") or "GET").strip().upper()
                parsed_url = urlparse(download_url)
                if download_method != "GET" or parsed_url.scheme != "https" or not parsed_url.hostname:
                    raise SarvamVisionError("invalid_output")

                output_response = await client.get(download_url)
                if not output_response.is_success:
                    raise SarvamVisionError("provider_unavailable")
                if len(output_response.content) > self.max_output_bytes:
                    raise SarvamVisionError("invalid_output")

                text = _markdown_from_archive(output_response.content, self.max_output_bytes)
                if not text:
                    raise SarvamVisionError("no_text")
                return VisionExtraction(
                    text=text,
                    language=normalized_language,
                    job_id=job_id,
                    partial=status == "partially_completed",
                )
        except SarvamVisionError:
            raise
        except httpx.TimeoutException as error:
            raise SarvamVisionError("timeout") from error
        except httpx.HTTPError as error:
            raise SarvamVisionError("provider_unavailable") from error


sarvam_vision = SarvamVisionService()
