from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Sequence

from .modes import ModeStrategy
from .schemas import Attachment, LearnerProfile, QuestionAnalysis


@dataclass(frozen=True)
class GenerationResult:
    answer: str
    provider_used: bool
    status: str


class GroqTutor:
    """Groq-backed teaching writer used by the live Tutorly chatbot route.

    It is intentionally lazy: static checks and the deterministic local tutor continue
    to work without a key, while the running FastAPI application uses Groq whenever the
    configured key is available.
    """

    def __init__(self, *, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("GROQ_API_KEY", "").strip()
        self.model = model or os.getenv("TUTORLY_GROQ_MODEL") or os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"
        self.vision_model = os.getenv("TUTORLY_GROQ_VISION_MODEL") or "qwen/qwen3.6-27b"
        self._client = None

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    async def compose(
        self,
        *,
        message: str,
        analysis: QuestionAnalysis,
        profile: LearnerProfile,
        strategy: ModeStrategy,
        attachments: Sequence[Attachment],
        fallback: str,
    ) -> GenerationResult:
        if not self.is_available:
            return GenerationResult(fallback, provider_used=False, status="not_configured")

        try:
            answer = await asyncio.to_thread(
                self._complete,
                self._messages(message, analysis, profile, strategy, attachments),
                strategy.temperature_hint,
                self.vision_model if self._has_visual_attachment(attachments) else self.model,
            )
        except Exception as error:  # The local tutor keeps the chat usable if Groq is down.
            print(f"[Tutorly][groq] generation failed type={type(error).__name__}")
            return GenerationResult(fallback, provider_used=False, status="provider_error")

        answer = (answer or "").strip()
        if not self._has_tutor_structure(answer):
            print("[Tutorly][groq] response did not meet Tutorly structure; using local fallback")
            return GenerationResult(fallback, provider_used=False, status="invalid_structure")

        return GenerationResult(answer, provider_used=True, status="generated")

    def _complete(self, messages: list[dict[str, object]], temperature_hint: float, model: str) -> str:
        if self._client is None:
            from groq import Groq

            self._client = Groq(api_key=self.api_key)

        response = self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=min(max(temperature_hint, 0.1), 0.55),
            max_tokens=1800,
        )
        return response.choices[0].message.content or ""

    def _messages(
        self,
        message: str,
        analysis: QuestionAnalysis,
        profile: LearnerProfile,
        strategy: ModeStrategy,
        attachments: Sequence[Attachment],
    ) -> list[dict[str, object]]:
        grade = profile.grade or analysis.grade_level.value.replace("grade_", "Grade ").replace("_", " ")
        subject = analysis.subject.value.replace("_", " ")
        image_context = self._image_context(attachments)
        mode_rules = "\n".join(f"- {rule}" for rule in strategy.prompt_rules)

        system = f"""
You are Tutorly AI: a warm, world-class educational tutor. Your only job is helping students learn.

You may help with school and college subjects, homework, study skills, exam preparation, educational coding, and educational writing. Do not give general-life advice, political debate, personal legal or medical advice, investing advice, sports predictions, or harmful instructions. If a question is outside education, politely redirect to a learning-related version of the topic.

The learner's inferred level is: {grade}. Adapt vocabulary, depth, and examples to that level. Never shame the learner for a basic question. Teach before simply giving an answer.

Answer in Markdown with these exact sections, using concise content that is genuinely about the student's question:
### Direct Answer
Give the answer in one or two sentences. Include the words "Final answer" when the question has a definite answer.
### Step-by-Step Explanation
Explain the reasoning in short numbered steps. For maths, show the formula, substitution, units, and a check. For code, explain the logic and any correction. For writing, explain why the wording or structure works.
### Example
Give one small, relevant example when it helps learning. If an example would add no value, say why the student's own question already demonstrates the idea.
### Common Mistake
Name one likely misunderstanding or error.
### Quick Recap
Use 2-4 concise bullet points.
### Practice Question
Give one similar, answerable practice question. Do not solve it unless the learner asks.

Use diagrams, tables, or code blocks only when they make the lesson clearer. Be accurate about uncertainty. Do not invent sources, quotations, image details, or facts that are not present. Treat OCR text as possibly imperfect and ask for a clearer image or correction if it is unreadable.

Selected tutoring mode: {strategy.title}
Mode guidance:
{mode_rules}
""".strip()

        user_text = f"""
Student question: {message}

Question analysis:
- Subject: {subject}
- Topic: {analysis.topic}
- Question type: {analysis.question_type.value}
- Difficulty: {analysis.difficulty.value}
{image_context}
""".strip()
        visual_data_urls = self._visual_data_urls(attachments)
        if not visual_data_urls:
            return [{"role": "system", "content": system}, {"role": "user", "content": user_text}]

        user_content: list[dict[str, object]] = [{"type": "text", "text": user_text}]
        user_content.extend(
            {"type": "image_url", "image_url": {"url": data_url}}
            for data_url in visual_data_urls
        )
        return [{"role": "system", "content": system}, {"role": "user", "content": user_content}]

    def _image_context(self, attachments: Sequence[Attachment]) -> str:
        extracted = [item.extracted_text.strip() for item in attachments if item.type == "image" and item.extracted_text.strip()]
        if not extracted:
            return "- Image/OCR context: none supplied."
        joined = "\n---\n".join(extracted[:2])[:6000]
        return f"- Image/OCR context (may contain recognition errors):\n{joined}"

    @staticmethod
    def _visual_data_urls(attachments: Sequence[Attachment]) -> list[str]:
        image_prefixes = ("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")
        values: list[str] = []
        for attachment in attachments[:5]:
            value = attachment.metadata.get("data_url") if attachment.type == "image" else ""
            if isinstance(value, str) and value.startswith(image_prefixes) and len(value) <= 18_000_000:
                values.append(value)
        return values

    def _has_visual_attachment(self, attachments: Sequence[Attachment]) -> bool:
        return bool(self._visual_data_urls(attachments))

    @staticmethod
    def _has_tutor_structure(answer: str) -> bool:
        required = (
            "direct answer",
            "step-by-step explanation",
            "example",
            "common mistake",
            "quick recap",
            "practice question",
        )
        normalized = answer.lower()
        return len(answer) >= 180 and all(heading in normalized for heading in required)
