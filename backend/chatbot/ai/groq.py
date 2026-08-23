from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict, Sequence

from .provider import AIProvider, ProviderFailure


class GroqProvider(AIProvider):
    """Groq implementation of Tutorly's provider-neutral structured-output API."""

    DEFAULT_MODEL = "openai/gpt-oss-120b"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        self._api_key = (api_key if api_key is not None else os.getenv("GROQ_API_KEY", "")).strip()
        self._model = (
            model
            or os.getenv("TUTORLY_GROQ_MODEL")
            or os.getenv("GROQ_MODEL")
            or self.DEFAULT_MODEL
        ).strip()
        self._timeout_seconds = max(5.0, min(float(timeout_seconds), 45.0))
        self._max_completion_tokens = max(
            400,
            min(int(os.getenv("TUTORLY_GROQ_MAX_COMPLETION_TOKENS", "900")), 1800),
        )
        self._client = None

    @property
    def name(self) -> str:
        return "groq"

    @property
    def model(self) -> str:
        return self._model

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    async def complete_structured(
        self,
        *,
        messages: Sequence[Dict[str, Any]],
        schema: Dict[str, Any],
        schema_name: str,
    ) -> Dict[str, Any]:
        if not self.configured:
            raise ProviderFailure("not_configured")
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(
                    self._complete,
                    list(messages),
                    schema,
                    schema_name,
                ),
                timeout=self._timeout_seconds + 2,
            )
        except asyncio.TimeoutError as error:
            raise ProviderFailure("timeout") from error
        except ProviderFailure:
            raise
        except Exception as error:
            status_code = getattr(error, "status_code", None)
            error_name = type(error).__name__.lower()
            if status_code in {401, 403} or "authentication" in error_name or "permission" in error_name:
                raise ProviderFailure("authentication_failed") from error
            if status_code == 429:
                headers = getattr(getattr(error, "response", None), "headers", {}) or {}
                retry_after = headers.get("retry-after")
                try:
                    retry_after_seconds = float(retry_after) if retry_after is not None else None
                except (TypeError, ValueError):
                    retry_after_seconds = None
                raise ProviderFailure(
                    "rate_limited",
                    retry_after_seconds=retry_after_seconds,
                ) from error
            if "ratelimit" in error_name or "rate_limit" in error_name:
                raise ProviderFailure("rate_limited") from error
            if "timeout" in error_name:
                raise ProviderFailure("timeout") from error
            raise ProviderFailure("provider_error") from error

    def _complete(
        self,
        messages: list[Dict[str, Any]],
        schema: Dict[str, Any],
        schema_name: str,
    ) -> Dict[str, Any]:
        if self._client is None:
            from groq import Groq

            self._client = Groq(api_key=self._api_key, timeout=self._timeout_seconds)

        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=0.2,
            reasoning_effort="low",
            reasoning_format="hidden",
            max_completion_tokens=self._max_completion_tokens,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                },
            },
        )
        content = response.choices[0].message.content if response.choices else ""
        if not content or not str(content).strip():
            raise ProviderFailure("empty_response")
        try:
            parsed = json.loads(str(content))
        except (TypeError, json.JSONDecodeError) as error:
            raise ProviderFailure("invalid_json") from error
        if not isinstance(parsed, dict):
            raise ProviderFailure("invalid_json")
        return parsed
