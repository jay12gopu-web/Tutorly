from __future__ import annotations

from typing import List

from .schemas import AnalyticsSnapshot, DifficultyLevel, SubjectArea, ToolCall


class AnalyticsEngine:
    def snapshot(
        self,
        subject: SubjectArea,
        difficulty: DifficultyLevel,
        confidence: float,
        intents: List[str],
        keywords: List[str],
        tool_calls: List[ToolCall],
    ) -> AnalyticsSnapshot:
        weak_candidates: List[str] = []
        strong_candidates: List[str] = []

        if "clarify" in intents or confidence < 0.55:
            weak_candidates.extend(keywords or [subject.value])
        if confidence >= 0.8 and tool_calls:
            strong_candidates.append(subject.value)

        recommendations = self._recommendations(subject, difficulty, intents)
        return AnalyticsSnapshot(
            subject=subject,
            difficulty=difficulty,
            confidence=confidence,
            detected_intents=intents,
            weak_topic_candidates=weak_candidates[:5],
            strong_topic_candidates=strong_candidates[:5],
            recommended_next_actions=recommendations,
        )

    def _recommendations(self, subject: SubjectArea, difficulty: DifficultyLevel, intents: List[str]) -> List[str]:
        recommendations = [
            "Review the final answer once without looking away.",
            "Try one similar question to check understanding.",
        ]
        if difficulty == DifficultyLevel.exam:
            recommendations.append("Convert the answer into a four-line exam response.")
        if "quiz" not in intents:
            recommendations.append("Ask Tutorly to make a quick quiz from this topic.")
        if subject in {SubjectArea.mathematics, SubjectArea.physics, SubjectArea.chemistry}:
            recommendations.append("Write the formula or rule separately and check units/signs.")
        return recommendations[:4]
