from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any, Dict, Sequence

from .provider import AIProvider, ProviderFailure


_ANSWER_STRING_START = re.compile(r'"answer"\s*:\s*"')
_JSON_SIMPLE_ESCAPES = frozenset('"\\/bfnrt')


def _is_unescaped(value: str, index: int) -> bool:
    backslashes = 0
    cursor = index - 1
    while cursor >= 0 and value[cursor] == "\\":
        backslashes += 1
        cursor -= 1
    return backslashes % 2 == 0


def _has_closing_math_delimiter(value: str, start: int, delimiter: str) -> bool:
    cursor = start
    while cursor < len(value):
        found = value.find(delimiter, cursor)
        if found < 0:
            return False
        if _is_unescaped(value, found):
            return True
        cursor = found + len(delimiter)
    return False


def _preserve_latex_backslashes(value: str) -> str:
    """Make under-escaped backslashes JSON-safe inside Markdown math spans.

    Structured model output is JSON containing a Markdown answer. A literal
    LaTeX backslash therefore needs JSON escaping as well. Some model responses
    omit that outer escaping, which either creates JSON control characters or
    makes the payload invalid. This scanner uses JSON grammar and Markdown math
    boundaries; it never matches or rewrites individual LaTeX commands.
    """

    output: list[str] = []
    index = 0
    math_delimiter: str | None = None

    while index < len(value):
        if ord(value[index]) < 32:
            # Raw line breaks and other control characters are invalid inside a
            # JSON string. Encode them using JSON itself so multiline Markdown,
            # tables, and fenced blocks survive standard decoding unchanged.
            output.append(json.dumps(value[index])[1:-1])
            index += 1
            continue

        if value[index] == "$" and _is_unescaped(value, index):
            candidate = "$$" if value.startswith("$$", index) else "$"
            if math_delimiter == candidate:
                math_delimiter = None
            elif math_delimiter is None and _has_closing_math_delimiter(
                value,
                index + len(candidate),
                candidate,
            ):
                math_delimiter = candidate
            output.append(candidate)
            index += len(candidate)
            continue

        if value[index] != "\\":
            output.append(value[index])
            index += 1
            continue

        run_end = index
        while run_end < len(value) and value[run_end] == "\\":
            run_end += 1
        run_length = run_end - index
        next_character = value[run_end] if run_end < len(value) else ""
        following_character = value[run_end + 1] if run_end + 1 < len(value) else ""

        needs_json_escape = False
        if run_length % 2 == 1:
            valid_unicode_escape = (
                next_character == "u"
                and run_end + 5 <= len(value)
                and all(character in "0123456789abcdefABCDEF" for character in value[run_end + 1:run_end + 5])
            )
            valid_json_escape = next_character in _JSON_SIMPLE_ESCAPES or valid_unicode_escape
            needs_json_escape = not valid_json_escape

            # Inside a Markdown math span, a JSON control-escape letter followed
            # by another letter is a LaTeX control word, not formatting. JSON
            # newlines/tabs next to delimiters or punctuation remain untouched.
            if (
                math_delimiter is not None
                and next_character in "bfnrt"
                and following_character.isalpha()
            ):
                needs_json_escape = True

        output.append("\\" * (run_length + (1 if needs_json_escape else 0)))
        index = run_end

    return "".join(output)


def _normalize_structured_response_json(content: str) -> str:
    """Repair only the top-level answer string before standard JSON decoding."""

    match = _ANSWER_STRING_START.search(content)
    if not match:
        return content

    value_start = match.end()
    cursor = value_start
    while cursor < len(content):
        if content[cursor] == '"' and _is_unescaped(content, cursor):
            answer = content[value_start:cursor]
            repaired = _preserve_latex_backslashes(answer)
            return f"{content[:value_start]}{repaired}{content[cursor:]}"
        cursor += 1
    return content


def load_structured_response_json(content: str) -> Dict[str, Any]:
    """Decode Groq structured output without consuming LaTeX backslashes."""

    parsed = json.loads(_normalize_structured_response_json(str(content)))
    if not isinstance(parsed, dict):
        raise TypeError("structured response must be an object")
    answer = parsed.get("answer")
    if isinstance(answer, str) and any(
        ord(character) < 32 and character not in "\n\r\t"
        for character in answer
    ):
        raise ValueError("structured answer contains an invalid control character")
    return parsed


class GroqProvider(AIProvider):
    """Groq implementation of Tutorly's provider-neutral structured-output API."""

    DEFAULT_MODEL = "openai/gpt-oss-120b"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 40.0,
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
            parsed = load_structured_response_json(str(content))
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise ProviderFailure("invalid_json") from error
        return parsed
