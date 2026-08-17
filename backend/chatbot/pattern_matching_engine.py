from __future__ import annotations

import hashlib
import json
import math
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Dict, Iterable, List

from .schemas import DifficultyLevel, PatternMatch, QuestionAnalysis, SubjectArea


VECTOR_SIZE = 192


@dataclass
class PatternRecord:
    id: str
    question_embedding: List[float]
    subject: str
    topic: str
    solution_pattern: str
    teaching_pattern: str
    difficulty: str = DifficultyLevel.balanced.value
    success_score: float = 0.55
    examples: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class PatternMemoryStore:
    """Small persistent pattern database.

    The store is JSON-backed so it works immediately in the current project.
    The API is intentionally shaped like a vector-memory store, so it can later
    be swapped for SQLite FTS, pgvector, Pinecone, or a hosted embedding DB.
    """

    def __init__(self, path: str | None = None) -> None:
        default_path = Path(__file__).resolve().parent.parent / "chatbot_data" / "pattern_memory.json"
        self.path = Path(path or os.getenv("TUTORLY_PATTERN_MEMORY_PATH", str(default_path)))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._records: List[PatternRecord] = []
        self._load()

    def all(self) -> List[PatternRecord]:
        with self._lock:
            return list(self._records)

    def upsert(self, record: PatternRecord) -> PatternRecord:
        with self._lock:
            existing = next((item for item in self._records if item.id == record.id), None)
            if existing:
                existing.question_embedding = record.question_embedding
                existing.subject = record.subject
                existing.topic = record.topic
                existing.solution_pattern = record.solution_pattern
                existing.teaching_pattern = record.teaching_pattern
                existing.difficulty = record.difficulty
                existing.success_score = max(0.0, min(1.0, (existing.success_score * 0.72) + (record.success_score * 0.28)))
                existing.examples = _unique(existing.examples + record.examples)[-8:]
                existing.keywords = _unique(existing.keywords + record.keywords)[-16:]
                existing.updated_at = datetime.utcnow().isoformat()
                saved = existing
            else:
                self._records.append(record)
                self._records = self._records[-300:]
                saved = record
            self._save()
            return saved

    def adjust_success(self, analysis: QuestionAnalysis, prompt: str, score: float) -> List[PatternRecord]:
        vector = vectorize(prompt)
        changed: List[PatternRecord] = []
        with self._lock:
            for record in self._records:
                same_subject = record.subject == analysis.subject.value
                close_topic = _normalize(record.topic) == _normalize(analysis.topic)
                similar = cosine_similarity(record.question_embedding, vector) > 0.58
                if same_subject and (close_topic or similar):
                    record.success_score = round((record.success_score * 0.82) + (score * 0.18), 3)
                    record.updated_at = datetime.utcnow().isoformat()
                    changed.append(record)
            self._save()
        return changed

    def _load(self) -> None:
        if not self.path.exists():
            self._records = seed_patterns()
            self._save()
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = []
        records = []
        for item in data if isinstance(data, list) else []:
            try:
                records.append(PatternRecord(**item))
            except TypeError:
                continue
        seeded = {record.id: record for record in seed_patterns()}
        for record in records:
            seeded[record.id] = record
        self._records = list(seeded.values())[-300:]

    def _save(self) -> None:
        self.path.write_text(
            json.dumps([asdict(record) for record in self._records], indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


class PatternMatchingEngine:
    def __init__(self, store: PatternMemoryStore | None = None) -> None:
        self.store = store or PatternMemoryStore()

    def find_similar(self, question: str, analysis: QuestionAnalysis, threshold: float = 0.62, limit: int = 4) -> List[PatternMatch]:
        vector = vectorize(question)
        normalized_question = _normalize(question)
        normalized_topic = _normalize(analysis.topic)
        matches: List[PatternMatch] = []
        for record in self.store.all():
            if record.subject != analysis.subject.value:
                continue

            semantic = cosine_similarity(vector, record.question_embedding)
            record_topic = _normalize(record.topic)
            topic_boost = 0.16 if _topic_related(record_topic, normalized_topic) else 0.0
            keyword_overlap = _keyword_overlap(record.keywords, normalized_question)
            keyword_boost = min(0.12, keyword_overlap * 0.035)
            success_boost = min(0.1, record.success_score * 0.08)
            similarity = min(1.0, semantic + topic_boost + keyword_boost + success_boost)
            relevance = _relevance_score(
                semantic=semantic,
                topic_boost=topic_boost,
                keyword_overlap=keyword_overlap,
                success_score=record.success_score,
            )
            if similarity < threshold or relevance < 0.62:
                continue
            matches.append(PatternMatch(
                id=record.id,
                subject=SubjectArea(record.subject) if record.subject in SubjectArea._value2member_map_ else SubjectArea.general,
                topic=record.topic,
                solution_pattern=record.solution_pattern,
                teaching_pattern=record.teaching_pattern,
                difficulty=DifficultyLevel(record.difficulty) if record.difficulty in DifficultyLevel._value2member_map_ else DifficultyLevel.balanced,
                success_score=round(record.success_score, 3),
                similarity=round(similarity, 3),
                relevance_score=round(relevance, 3),
                examples=record.examples,
            ))
        matches.sort(key=lambda item: (item.relevance_score, item.similarity, item.success_score), reverse=True)
        return matches[:limit]

    def remember_successful_teaching(self, question: str, analysis: QuestionAnalysis, answer: str, score: float = 0.62) -> PatternRecord:
        signature = pattern_signature(question, analysis)
        digest = hashlib.sha1(f"{analysis.subject.value}:{signature}:{_normalize(question)[:120]}".encode("utf-8")).hexdigest()[:12]
        record = PatternRecord(
            id=f"pattern_{signature}_{digest}",
            question_embedding=vectorize(question),
            subject=analysis.subject.value,
            topic=analysis.topic,
            solution_pattern=extract_solution_pattern(question, analysis, answer),
            teaching_pattern=extract_teaching_pattern(analysis, answer),
            difficulty=analysis.difficulty.value,
            success_score=max(0.0, min(1.0, score)),
            examples=[question[:220]],
            keywords=analysis.keywords,
        )
        return self.store.upsert(record)

    def record_feedback(self, question: str, analysis: QuestionAnalysis, feedback_score: float) -> List[PatternRecord]:
        return self.store.adjust_success(analysis, question, feedback_score)


def seed_patterns() -> List[PatternRecord]:
    seeds = [
        (
            "speed_distance_time",
            SubjectArea.mathematics,
            "Rates",
            "Speed = Distance / Time",
            "Extract distance and time, write the formula, substitute values, calculate, then check units.",
            DifficultyLevel.school,
            0.78,
            ["A train travels 120 km in 2 hours."],
            ["speed", "distance", "time", "travels", "hours"],
        ),
        (
            "linear_times_as_many",
            SubjectArea.mathematics,
            "Algebra",
            "Let the smaller quantity be x, express the other quantity, add, and solve.",
            "Define variables clearly, build one equation from the relationship, then verify by substitution.",
            DifficultyLevel.school,
            0.84,
            ["Sarah has three times as many pencils as Tom. Together they have 48 pencils."],
            ["times as many", "together", "how many", "each"],
        ),
        (
            "rectangle_area_quadratic",
            SubjectArea.mathematics,
            "Geometry Word Problem",
            "Use area = length x width, express one side in terms of the other, solve the quadratic, reject impossible dimensions.",
            "Name width as x, convert length relationship, form area equation, solve, and check dimensions.",
            DifficultyLevel.school,
            0.8,
            ["A rectangular garden has length 5 m longer than width and area 84 m²."],
            ["area", "rectangle", "length", "width", "garden", "quadratic"],
        ),
        (
            "photosynthesis_process",
            SubjectArea.biology,
            "Photosynthesis",
            "Explain inputs, process, outputs, and importance.",
            "Start with a definition, then connect sunlight, chlorophyll, water, carbon dioxide, glucose, and oxygen.",
            DifficultyLevel.balanced,
            0.86,
            ["Explain photosynthesis."],
            ["photosynthesis", "sunlight", "chlorophyll", "glucose"],
        ),
        (
            "english_grammar_rule",
            SubjectArea.english,
            "Grammar",
            "Identify the rule, apply it, show corrected answer, and explain why.",
            "State the grammar rule first, correct the sentence, then add one similar practice sentence.",
            DifficultyLevel.balanced,
            0.79,
            ["Identify the tense in: She has finished her homework."],
            ["grammar", "tense", "sentence", "rule"],
        ),
        (
            "geography_location",
            SubjectArea.geography,
            "Location",
            "Give quick answer, hierarchy, and map context.",
            "Answer exact location first, then show city/state/country/continent hierarchy and one memory clue.",
            DifficultyLevel.balanced,
            0.81,
            ["Where is Hyderabad located?"],
            ["where is", "located", "city", "state", "country"],
        ),
    ]
    return [
        PatternRecord(
            id=f"seed_{item_id}",
            question_embedding=vectorize(" ".join(examples + keywords)),
            subject=subject.value,
            topic=topic,
            solution_pattern=solution,
            teaching_pattern=teaching,
            difficulty=difficulty.value,
            success_score=score,
            examples=examples,
            keywords=keywords,
        )
        for item_id, subject, topic, solution, teaching, difficulty, score, examples, keywords in seeds
    ]


def extract_solution_pattern(question: str, analysis: QuestionAnalysis, answer: str) -> str:
    equation = re.search(r"[a-z0-9\s()+\-*/^=.]+=[a-z0-9\s()+\-*/^=.]+", answer, re.I)
    if equation:
        return f"Equation method: {equation.group(0).strip()[:120]}"
    if analysis.subject == SubjectArea.mathematics:
        return pattern_signature(question, analysis).replace("_", " ")
    return f"{analysis.topic}: {analysis.question_type.value}"


def extract_teaching_pattern(analysis: QuestionAnalysis, answer: str) -> str:
    if "Practice Question" in answer and "Common Mistakes" in answer:
        return "Use full tutor structure with concept, steps, final answer, mistake warning, and practice."
    if analysis.subject == SubjectArea.mathematics:
        return "Show formula, substitution, step-by-step solving, verification, and final answer."
    if analysis.subject in {SubjectArea.physics, SubjectArea.chemistry, SubjectArea.biology}:
        return "Teach the concept first, connect to a real-life example, then add a practice question."
    if analysis.subject == SubjectArea.english:
        return "Explain the rule or literary idea, apply it, then give exam-friendly wording."
    if analysis.subject in {SubjectArea.history, SubjectArea.geography, SubjectArea.civics, SubjectArea.economics}:
        return "Use context, cause/effect or location hierarchy, exam points, and a practice question."
    return "Explain clearly, answer directly, and reinforce with practice."


def _topic_related(record_topic: str, analysis_topic: str) -> bool:
    if not record_topic or not analysis_topic:
        return False
    if record_topic == analysis_topic:
        return True
    record_words = set(record_topic.split())
    analysis_words = set(analysis_topic.split())
    return bool(record_words & analysis_words)


def _keyword_overlap(keywords: Iterable[str], normalized_question: str) -> int:
    question_words = set(normalized_question.split())
    count = 0
    for keyword in keywords:
        clean = _normalize(keyword)
        if not clean:
            continue
        if clean in normalized_question or clean in question_words:
            count += 1
    return count


def _relevance_score(*, semantic: float, topic_boost: float, keyword_overlap: int, success_score: float) -> float:
    topic_component = 0.22 if topic_boost else 0.0
    keyword_component = min(0.28, keyword_overlap * 0.07)
    success_component = min(0.12, success_score * 0.12)
    return round(max(0.0, min(1.0, semantic + topic_component + keyword_component + success_component)), 3)


def pattern_signature(question: str, analysis: QuestionAnalysis) -> str:
    text = _normalize(question)
    if analysis.subject == SubjectArea.mathematics and re.search(r"\b(speed|distance|time|travels?)\b", text):
        return "rate_speed_distance_time"
    if analysis.subject == SubjectArea.mathematics and re.search(r"\b(area|rectangle|rectangular|length|width)\b", text):
        return "geometry_area_relationship"
    if analysis.subject == SubjectArea.mathematics and re.search(r"\b(times as many|together they have|older than|younger than|sum of|difference)\b", text):
        return "algebra_relationship_equation"
    return _normalize(f"{analysis.subject.value}_{analysis.topic}_{analysis.question_type.value}").replace(" ", "_")[:80]


def vectorize(text: str) -> List[float]:
    vector = [0.0] * VECTOR_SIZE
    for token in _tokens(text):
        vector[_hash_token(token)] += 1.0
    magnitude = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [round(value / magnitude, 5) for value in vector]


def cosine_similarity(left: List[float], right: List[float]) -> float:
    length = min(len(left), len(right))
    if not length:
        return 0.0
    return max(0.0, min(1.0, sum((left[index] or 0.0) * (right[index] or 0.0) for index in range(length))))


def _tokens(text: str) -> List[str]:
    stop = {"the", "and", "for", "with", "that", "this", "what", "where", "when", "why", "how", "please", "does", "from", "into", "your", "have", "has"}
    return [word for word in re.findall(r"[a-z0-9]+", _normalize(text)) if len(word) > 1 and word not in stop]


def _hash_token(token: str) -> int:
    digest = hashlib.sha1(token.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % VECTOR_SIZE


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().replace("×", "x").replace("÷", "/")).strip()


def _unique(values: Iterable[str]) -> List[str]:
    output: List[str] = []
    for value in values:
        if value and value not in output:
            output.append(value)
    return output
