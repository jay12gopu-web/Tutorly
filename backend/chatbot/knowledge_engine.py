from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .schemas import Citation, SubjectArea


@dataclass
class KnowledgeHit:
    title: str
    content: str
    source: str
    score: float


class KnowledgeEngine:
    """Lightweight local retrieval layer.

    This is intentionally deterministic for now and can later be replaced with
    vector search over PDFs, notes, uploaded documents, and teacher-approved
    sources.
    """

    BASE_NOTES = {
        SubjectArea.mathematics: "Math answers should show method, calculation, and final check.",
        SubjectArea.physics: "Physics answers should connect formula, units, and real-world meaning.",
        SubjectArea.chemistry: "Chemistry answers should connect particles, reactions, and observable changes.",
        SubjectArea.biology: "Biology answers should connect structure, function, and life processes.",
        SubjectArea.history: "History answers should connect cause, event, people, and impact.",
        SubjectArea.geography: "Geography answers should connect location, physical features, climate, and human activity.",
        SubjectArea.civics: "Civics answers should connect institutions, rights, responsibilities, and real civic life.",
        SubjectArea.economics: "Economics answers should connect scarcity, choice, incentives, markets, and cause-effect.",
        SubjectArea.computer_science: "Computer science answers should connect input, logic, output, and edge cases.",
        SubjectArea.english: "English answers should connect meaning, language, tone, and structure.",
        SubjectArea.general_knowledge: "General knowledge answers should be clear and verify exact facts when needed.",
        SubjectArea.general: "General answers should be simple, useful, and student-friendly.",
    }

    def retrieve(self, query: str, subject: SubjectArea, limit: int = 4) -> List[KnowledgeHit]:
        base = self.BASE_NOTES.get(subject, self.BASE_NOTES[SubjectArea.general])
        hits = [
            KnowledgeHit(
                title=f"{subject.value.replace('_', ' ').title()} tutoring principle",
                content=base,
                source="Tutorly local teaching rules",
                score=0.78,
            )
        ]
        if "exam" in query.lower():
            hits.append(KnowledgeHit(title="Exam answer shape", content="Use definition, explanation, example, and final answer.", source="Tutorly exam strategy", score=0.72))
        return hits[:limit]

    def citations_from_hits(self, hits: List[KnowledgeHit]) -> List[Citation]:
        return [
            Citation(label=hit.title, source=hit.source, confidence=hit.score)
            for hit in hits
        ]
