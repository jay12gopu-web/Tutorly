from __future__ import annotations

from typing import List

from .schemas import KnowledgeConfidence, PatternMatch, QuestionAnalysis, QuestionType, SubjectArea


class KnowledgeConfidenceEngine:
    """Decides whether Tutorly can answer from stable tutor knowledge."""

    STABLE_ACADEMIC_SUBJECTS = {
        SubjectArea.mathematics,
        SubjectArea.physics,
        SubjectArea.chemistry,
        SubjectArea.biology,
        SubjectArea.english,
        SubjectArea.history,
        SubjectArea.geography,
        SubjectArea.civics,
        SubjectArea.economics,
        SubjectArea.computer_science,
    }

    def assess(self, analysis: QuestionAnalysis, patterns: List[PatternMatch]) -> KnowledgeConfidence:
        best_pattern = patterns[0].similarity if patterns else 0.0
        score = analysis.confidence
        reason = "The question matches stable tutor knowledge."

        if analysis.subject in self.STABLE_ACADEMIC_SUBJECTS:
            score = max(score, 0.76)
        if best_pattern >= 0.7:
            score = max(score, 0.88 + min(0.08, best_pattern * 0.08))
            reason = "A similar successful teaching pattern exists."
        if analysis.question_type == QuestionType.current_events or analysis.requires_freshness_check:
            score = min(score, 0.52)
            reason = "The question may require current or recently changed information."
        if analysis.subject == SubjectArea.general and not analysis.requires_freshness_check:
            score = min(score, 0.68)
            reason = "The topic is broad, so additional verification may help."

        score = round(max(0.0, min(1.0, score)), 3)
        return KnowledgeConfidence(
            confidence_score=score,
            requires_additional_knowledge=score < 0.7 or analysis.requires_freshness_check or analysis.question_type == QuestionType.current_events,
            reason=reason,
        )
