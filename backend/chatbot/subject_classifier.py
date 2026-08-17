from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from .schemas import DifficultyLevel, SubjectArea


@dataclass
class ClassificationResult:
    subject: SubjectArea
    difficulty: DifficultyLevel
    intents: List[str]
    keywords: List[str]
    confidence: float


class SubjectClassifier:
    SUBJECT_KEYWORDS: Dict[SubjectArea, Tuple[str, ...]] = {
        SubjectArea.mathematics: (
            "math", "maths", "algebra", "equation", "solve", "percentage", "fraction",
            "geometry", "trigonometry", "calculus", "ratio", "probability", "graph",
        ),
        SubjectArea.physics: (
            "physics", "force", "motion", "velocity", "acceleration", "energy", "power",
            "work", "electricity", "magnet", "light", "sound", "gravity", "newton",
        ),
        SubjectArea.chemistry: (
            "chemistry", "atom", "molecule", "acid", "base", "salt", "reaction",
            "periodic", "bond", "valency", "compound", "solution",
        ),
        SubjectArea.biology: (
            "biology", "cell", "germination", "photosynthesis", "respiration", "plant",
            "animal", "digestion", "blood", "heart", "organ", "ecosystem",
        ),
        SubjectArea.history: (
            "history", "war", "empire", "king", "queen", "civilization", "revolution",
            "independence", "ancient", "medieval", "freedom", "treaty",
        ),
        SubjectArea.geography: (
            "geography", "country", "continent", "ocean", "river", "mountain", "map",
            "climate", "latitude", "longitude", "located", "location", "capital",
        ),
        SubjectArea.computer_science: (
            "code", "coding", "program", "python", "javascript", "html", "css", "bug",
            "debug", "algorithm", "function", "variable", "loop", "database",
        ),
        SubjectArea.english: (
            "english", "grammar", "essay", "letter", "poem", "sentence", "meaning",
            "rewrite", "summary", "comprehension", "vocabulary", "tense",
        ),
        SubjectArea.general_knowledge: (
            "general knowledge", "current affairs", "who is", "what is", "where is",
            "country", "president", "prime minister", "famous", "world",
        ),
    }

    INTENT_PATTERNS: Dict[str, Tuple[str, ...]] = {
        "solve": ("solve", "calculate", "find", "answer", "work out"),
        "explain": ("explain", "concept", "why", "how", "teach", "understand"),
        "summarize": ("summarize", "summary", "short notes", "revision note"),
        "quiz": ("quiz", "test me", "practice questions", "mcq"),
        "flashcards": ("flashcard", "remember", "memorize"),
        "debug": ("debug", "error", "not working", "fix code"),
        "image": ("image", "photo", "screenshot", "ocr", "uploaded"),
        "exam": ("exam", "marks", "board", "test", "important questions"),
        "casual": ("hi", "hello", "thanks", "bye", "wassup", "lol"),
    }

    def classify(self, message: str, hint: SubjectArea | None = None) -> ClassificationResult:
        text = self._normalize(message)
        subject_scores = {
            subject: self._score(text, words)
            for subject, words in self.SUBJECT_KEYWORDS.items()
        }

        if hint:
            subject_scores[hint] = subject_scores.get(hint, 0) + 2

        subject, score = max(subject_scores.items(), key=lambda item: item[1])
        if score <= 0:
            subject = SubjectArea.general

        intents = [
            intent
            for intent, patterns in self.INTENT_PATTERNS.items()
            if self._score(text, patterns) > 0
        ]
        if not intents:
            intents = ["explain"] if len(text.split()) > 2 else ["clarify"]

        difficulty = self._difficulty(text, intents)
        confidence = min(0.96, 0.42 + score * 0.12 + len(intents) * 0.04)
        keywords = self._matched_keywords(text, self.SUBJECT_KEYWORDS.get(subject, ()))

        return ClassificationResult(
            subject=subject,
            difficulty=difficulty,
            intents=intents,
            keywords=keywords,
            confidence=confidence,
        )

    def _normalize(self, message: str) -> str:
        return re.sub(r"\s+", " ", (message or "").lower()).strip()

    def _score(self, text: str, words: Iterable[str]) -> int:
        return sum(1 for word in words if word in text)

    def _matched_keywords(self, text: str, words: Iterable[str]) -> List[str]:
        return [word for word in words if word in text][:10]

    def _difficulty(self, text: str, intents: List[str]) -> DifficultyLevel:
        if any(word in text for word in ("basic", "simple", "easy", "beginner", "class 1", "class 2", "class 3")):
            return DifficultyLevel.beginner
        if any(word in text for word in ("exam", "board", "marks", "test")):
            return DifficultyLevel.exam
        if any(word in text for word in ("advanced", "deep", "prove", "derive", "mechanism")):
            return DifficultyLevel.advanced
        if any(intent in intents for intent in ("quiz", "flashcards")):
            return DifficultyLevel.school
        return DifficultyLevel.balanced
