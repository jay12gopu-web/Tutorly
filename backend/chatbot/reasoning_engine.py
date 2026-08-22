from __future__ import annotations

import re
from typing import List

from .modes import ModeStrategy
from .schemas import DifficultyLevel, ReasoningStep, SubjectArea


class ReasoningEngine:
    def plan(
        self,
        message: str,
        subject: SubjectArea,
        difficulty: DifficultyLevel,
        strategy: ModeStrategy,
        intents: List[str],
    ) -> List[ReasoningStep]:
        steps = [
            ReasoningStep(
                title="Understand the question",
                detail=f"Detect the subject as {subject.value.replace('_', ' ')} and identify the student's intent.",
                confidence=0.86,
            ),
            ReasoningStep(
                title="Choose teaching strategy",
                detail=f"Use {strategy.reasoning_style} reasoning with {difficulty.value} difficulty.",
                confidence=0.82,
            ),
        ]

        if "solve" in intents or self._looks_like_math(message):
            steps.append(ReasoningStep(title="Solve carefully", detail="Break the problem into clear steps and verify the final answer.", confidence=0.8))
        if "quiz" in intents or strategy.mode.value == "study":
            steps.append(ReasoningStep(title="Add active recall", detail="Create a knowledge check so the student can test understanding.", confidence=0.78))
        if strategy.mode.value == "research":
            steps.append(ReasoningStep(title="Check reliability", detail="Separate explanation from source-dependent facts and attach citations when available.", confidence=0.74))
        if strategy.mode.value == "lens":
            steps.append(ReasoningStep(title="Use image context", detail="Prefer extracted image text, but warn if the image may be incomplete.", confidence=0.76))

        steps.append(ReasoningStep(title="Refine answer", detail="Format the final response as a clean learning note with a highlighted answer.", confidence=0.84))
        return steps

    def estimate_confidence(self, message: str, subject: SubjectArea, tools_used: int, memory_count: int) -> float:
        confidence = 0.55
        if subject != SubjectArea.general:
            confidence += 0.16
        if len(message.split()) >= 4:
            confidence += 0.1
        if tools_used:
            confidence += min(0.12, tools_used * 0.04)
        if memory_count:
            confidence += min(0.08, memory_count * 0.02)
        if len(message.strip()) < 3:
            confidence -= 0.25
        return max(0.1, min(0.97, confidence))

    def verify_answer_shape(self, answer: str, response_plan: dict | None = None) -> List[str]:
        issues: List[str] = []
        plan = response_plan or {}
        kind = str(plan.get("response_kind") or "")
        words = len((answer or "").split())
        if not (answer or "").strip():
            issues.append("empty_answer")
            return issues
        if kind in {"answer_only", "simple_math"}:
            if words > 40:
                issues.append("answer_only_too_long")
            return issues
        if kind in {"math_standard", "math_complex", "math_word_problem", "math_proof", "mistake_feedback"}:
            if "final answer" not in answer.lower() and "hence proved" not in answer.lower():
                issues.append("missing_final_answer")
        if words < 8:
            issues.append("too_short_for_explanation")
        if words > 900:
            issues.append("too_long")
        return issues

    def _looks_like_math(self, message: str) -> bool:
        return bool(re.search(r"\d+\s*[-+*/=]\s*\d+|solve\s+[a-z]\s*[+\-*/=]", message.lower()))
