from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Sequence


class ProviderFailure(RuntimeError):
    """Safe provider failure carrying only an internal status code."""

    def __init__(self, status: str, *, retry_after_seconds: float | None = None) -> None:
        super().__init__(status)
        self.status = status
        self.retry_after_seconds = retry_after_seconds


class AIProvider(ABC):
    """Provider-neutral interface used by Tutorly's semantic AI service."""

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def model(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def configured(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def complete_structured(
        self,
        *,
        messages: Sequence[Dict[str, Any]],
        schema: Dict[str, Any],
        schema_name: str,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    async def transcribe_audio(
        self,
        *,
        audio: bytes,
        filename: str,
        mime_type: str,
        language: str | None = None,
    ) -> Dict[str, str]:
        """Optional provider-neutral speech-to-text capability."""

        raise ProviderFailure("transcription_unsupported")
