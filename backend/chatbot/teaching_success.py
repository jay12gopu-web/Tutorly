from __future__ import annotations

from .pattern_matching_engine import PatternMatchingEngine
from .question_analyzer import QuestionAnalyzer
from .schemas import TeachingFeedbackRequest, TeachingFeedbackResponse


class TeachingSuccessScore:
    SCORE_MAP = {
        "understood": 0.96,
        "up": 0.9,
        "examples": 0.62,
        "simpler": 0.42,
        "confused": 0.22,
        "down": 0.28,
    }

    def __init__(self, analyzer: QuestionAnalyzer | None = None, patterns: PatternMatchingEngine | None = None) -> None:
        self.analyzer = analyzer or QuestionAnalyzer()
        self.patterns = patterns or PatternMatchingEngine()

    def record(self, request: TeachingFeedbackRequest) -> TeachingFeedbackResponse:
        analysis = request.analysis or self.analyzer.analyze(request.prompt)
        score = self.SCORE_MAP.get(request.feedback_type, 0.5)
        changed = self.patterns.record_feedback(request.prompt, analysis, score)
        return TeachingFeedbackResponse(
            ok=True,
            success_score=score,
            followup=self._followup(request.feedback_type, analysis),
            metadata={
                "patternsUpdated": len(changed),
                "subject": analysis.subject.value,
                "topic": analysis.topic,
            },
        )

    def _followup(self, feedback_type: str, analysis) -> str:
        if feedback_type in {"understood", "up"}:
            return "Great. I will remember that this teaching style worked for this topic."
        if feedback_type == "simpler":
            return f"Let's make **{analysis.topic}** simpler: focus on one rule, one example, and one check."
        if feedback_type == "examples":
            return f"I will add more examples next time for **{analysis.topic}** before asking you to practice."
        return f"I will break **{analysis.topic}** into smaller steps and slow down the explanation."
