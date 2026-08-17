from __future__ import annotations

from typing import Iterable, List

from .schemas import Citation, KnowledgeConfidence, MergedKnowledge, QuestionAnalysis, RetrievedKnowledge, SubjectArea


class KnowledgeMergeEngine:
    def merge(self, analysis: QuestionAnalysis, retrieved: RetrievedKnowledge, confidence: KnowledgeConfidence) -> MergedKnowledge:
        best_pattern = retrieved.previous_patterns[0] if retrieved.previous_patterns else None
        strategy = best_pattern.teaching_pattern if best_pattern else default_strategy(analysis)
        parts: List[str] = []
        parts.extend(retrieved.internal_notes)
        if best_pattern:
            parts.append(f"Successful pattern to reuse: {best_pattern.solution_pattern}")
            parts.append(f"Teaching strategy: {best_pattern.teaching_pattern}")
        if retrieved.memory_summary:
            parts.append(f"Learner memory: {retrieved.memory_summary}")
        if retrieved.search_summary:
            parts.append(f"Verified external knowledge: {retrieved.search_summary}")

        merged = "\n".join(_dedupe(parts))
        return MergedKnowledge(
            merged_knowledge=merged,
            source_confidence=confidence.confidence_score,
            recommended_teaching_strategy=strategy,
            sources=retrieved.sources,
        )


def default_strategy(analysis: QuestionAnalysis) -> str:
    strategies = {
        SubjectArea.mathematics: "Show formula, substitution, calculation, verification, common mistake, and practice.",
        SubjectArea.physics: "Explain the principle, connect units/formulas, show real-life meaning, and check the result.",
        SubjectArea.chemistry: "Explain particles or reaction behavior, connect to observable changes, and add an example.",
        SubjectArea.biology: "Explain the process in order, connect structure to function, and add a memory clue.",
        SubjectArea.english: "State the rule or literary focus, apply it, explain why, and add exam-style practice.",
        SubjectArea.history: "Set context, explain timeline, connect cause and effect, and highlight exam points.",
        SubjectArea.geography: "Answer exact location or concept, show hierarchy/map context, and add exam facts.",
        SubjectArea.civics: "Define the civic idea, explain why it matters, connect to citizens, and add a practice prompt.",
        SubjectArea.economics: "Define the relationship, use a simple example, connect cause/effect, and summarize.",
        SubjectArea.computer_science: "Explain the problem, logic, algorithm, and edge cases with concise code only if needed.",
    }
    return strategies.get(analysis.subject, "Teach clearly, answer directly, and reinforce with one practice question.")


def _dedupe(values: Iterable[str]) -> List[str]:
    seen = set()
    output: List[str] = []
    for value in values:
        clean = (value or "").strip()
        key = clean.lower()
        if not clean or key in seen:
            continue
        seen.add(key)
        output.append(clean)
    return output
