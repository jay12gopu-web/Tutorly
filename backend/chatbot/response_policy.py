from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Dict, List


@dataclass(frozen=True)
class ResponsePlan:
    subject_family: str
    response_kind: str
    detail_level: str
    target_words: int
    answer_only: bool
    visual_level: int
    visual_kind: str
    visual_topic: str
    visual_reason: str
    quick_actions: List[str]

    def as_metadata(self) -> Dict[str, object]:
        return asdict(self)


class ResponsePolicyEngine:
    """Converts validated semantic-router output into UI response metadata."""

    ACTION_LABELS = {
        "explain_simpler": "Explain Simpler",
        "more_detail": "More Detail",
        "give_example": "Give an Example",
        "quiz_me": "Quiz Me",
        "show_diagram": "Show Diagram",
        "explain_this_step": "Explain This Step",
        "another_method": "Another Method",
        "similar_question": "Similar Question",
        "harder_question": "Harder Question",
        "real_life_use": "Real-Life Use",
    }

    def action_metadata(self, plan: ResponsePlan) -> List[Dict[str, str]]:
        return [
            {"id": action, "label": self.ACTION_LABELS[action]}
            for action in plan.quick_actions
            if action in self.ACTION_LABELS
        ]

    def from_semantic(self, classification: Dict[str, object]) -> ResponsePlan:
        subject = str(classification.get("subject") or "general")
        intent = str(classification.get("intent") or "concept_explanation")
        response_type = str(classification.get("response_type") or "explanation")
        answer_format = str(classification.get("answer_format") or "concept_explanation")
        response_length = str(classification.get("response_length") or "short")
        topic = str(classification.get("topic") or "").strip()
        visual = classification.get("visual") if isinstance(classification.get("visual"), dict) else {}
        visual_needed = bool(visual.get("needed"))
        visual_type = str(visual.get("type") or "none") if visual_needed else "none"
        visual_reason = str(visual.get("reason") or "No visual is needed for this explanation.")
        answer_only = intent == "answer_only" or response_type == "direct_answer"
        target_words = {
            "very_short": 45,
            "short": 170,
            "medium": 320,
            "detailed": 520,
        }.get(response_length, 170)

        if answer_only:
            actions = ["more_detail"]
        elif intent == "teach_topic" or response_type == "interactive_lesson":
            actions = ["explain_simpler", "give_example", "more_detail"]
        elif subject == "mathematics":
            if intent == "proof" or response_type == "proof":
                actions = ["explain_this_step", "another_method", "more_detail"]
            elif intent in {"numerical_problem", "solve_equation", "homework_help"}:
                actions = ["explain_this_step", "another_method", "more_detail"]
            else:
                actions = ["give_example", "more_detail", "real_life_use"]
        elif subject in {"physics", "chemistry", "biology", "science"}:
            actions = ["explain_simpler", "give_example", "more_detail"]
        elif subject == "english":
            actions = ["give_example", "more_detail", "explain_simpler"]
        else:
            actions = ["explain_simpler", "give_example", "more_detail"]

        return ResponsePlan(
            subject_family=subject,
            response_kind=answer_format,
            detail_level=response_length,
            target_words=target_words,
            answer_only=answer_only,
            visual_level=3 if visual_needed else 0,
            visual_kind=visual_type,
            visual_topic=topic,
            visual_reason=visual_reason,
            quick_actions=actions[:3],
        )
