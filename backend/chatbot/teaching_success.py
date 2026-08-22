from __future__ import annotations

from typing import TYPE_CHECKING

from .schemas import TeachingFeedbackRequest, TeachingFeedbackResponse

if TYPE_CHECKING:
    from .pattern_matching_engine import PatternMatchingEngine


class TeachingSuccessScore:
    SCORE_MAP = {
        "understood": 0.96,
        "up": 0.9,
        "examples": 0.62,
        "simpler": 0.42,
        "confused": 0.22,
        "down": 0.28,
    }

    def __init__(self, patterns: "PatternMatchingEngine | None" = None) -> None:
        self.patterns = patterns

    def record(self, request: TeachingFeedbackRequest) -> TeachingFeedbackResponse:
        score = self.SCORE_MAP.get(request.feedback_type, 0.5)
        semantic_route = request.metadata.get("semantic_route") if isinstance(request.metadata, dict) else None
        topic = request.analysis.topic if request.analysis else str((semantic_route or {}).get("topic") or "this topic")
        subject = request.analysis.subject.value if request.analysis else str((semantic_route or {}).get("subject") or "general")
        changed = (
            self.patterns.record_feedback(request.prompt, request.analysis, score)
            if self.patterns is not None and request.analysis is not None
            else []
        )
        return TeachingFeedbackResponse(
            ok=True,
            success_score=score,
            followup=self._followup(request.feedback_type, topic),
            metadata={
                "patternsUpdated": len(changed),
                "subject": subject,
                "topic": topic,
            },
        )

    def _followup(self, feedback_type: str, topic: str) -> str:
        if feedback_type in {"understood", "up"}:
            return "Great. I will remember that this teaching style worked for this topic."
        if feedback_type == "simpler":
            return f"Let's make **{topic}** simpler: focus on one rule, one example, and one check."
        if feedback_type == "examples":
            return f"I will add more examples next time for **{topic}** before asking you to practice."
        return f"I will break **{topic}** into smaller steps and slow down the explanation."
