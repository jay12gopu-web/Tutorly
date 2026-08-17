from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List

from .schemas import LearnerProfile, MemoryItem, SubjectArea


@dataclass
class MemoryBucket:
    user_id: str
    memories: List[MemoryItem] = field(default_factory=list)


class MemoryEngine:
    """In-memory ranking engine designed to be swapped for a database/vector store later."""

    def __init__(self) -> None:
        self._buckets: Dict[str, MemoryBucket] = {}

    def get_bucket(self, user_id: str) -> MemoryBucket:
        if user_id not in self._buckets:
            self._buckets[user_id] = MemoryBucket(user_id=user_id)
        return self._buckets[user_id]

    def remember(self, user_id: str, text: str, kind: str = "conversation", tags: List[str] | None = None) -> MemoryItem:
        cleaned = self._clean(text)
        memory_id = hashlib.sha1(f"{user_id}:{kind}:{cleaned}".encode("utf-8")).hexdigest()[:16]
        item = MemoryItem(
            id=memory_id,
            kind=kind,  # type: ignore[arg-type]
            text=cleaned[:1200],
            score=0.5,
            tags=tags or [],
            created_at=datetime.utcnow(),
        )
        bucket = self.get_bucket(user_id)
        existing = next((memory for memory in bucket.memories if memory.id == memory_id), None)
        if existing:
            existing.score = min(1.0, existing.score + 0.08)
            existing.created_at = datetime.utcnow()
            return existing
        bucket.memories.append(item)
        bucket.memories = bucket.memories[-200:]
        return item

    def retrieve(self, user_id: str, query: str, subject: SubjectArea, limit: int = 6) -> List[MemoryItem]:
        bucket = self.get_bucket(user_id)
        query_terms = set(self._terms(query))
        ranked: List[MemoryItem] = []
        for item in bucket.memories:
            item_terms = set(self._terms(item.text + " " + " ".join(item.tags)))
            overlap = len(query_terms & item_terms)
            subject_bonus = 1 if subject.value in item.tags else 0
            recency_bonus = 0.1
            score = min(1.0, item.score + overlap * 0.08 + subject_bonus * 0.18 + recency_bonus)
            if overlap or subject_bonus:
                ranked.append(item.copy(update={"score": score}))
        ranked.sort(key=lambda memory: memory.score, reverse=True)
        return ranked[:limit]

    def update_profile_from_message(self, profile: LearnerProfile, message: str, subject: SubjectArea) -> LearnerProfile:
        text = message.lower()
        if "i don't understand" in text or "i dont understand" in text or "weak" in text:
            profile.weak_concepts = self._append_unique(profile.weak_concepts, subject.value)
        if "i know" in text or "easy" in text or "got it" in text:
            profile.strong_concepts = self._append_unique(profile.strong_concepts, subject.value)
        profile.frequent_topics = self._append_unique(profile.frequent_topics, subject.value, limit=12)
        return profile

    def summarize_for_prompt(self, memories: List[MemoryItem]) -> str:
        if not memories:
            return "No relevant long-term memory found."
        lines = [f"- {memory.text[:180]} (score {memory.score:.2f})" for memory in memories]
        return "\n".join(lines)

    def _clean(self, text: str) -> str:
        return re.sub(r"\s+", " ", (text or "").replace("\x00", "")).strip()

    def _terms(self, text: str) -> List[str]:
        return re.findall(r"[a-z0-9]+", text.lower())

    def _append_unique(self, values: List[str], value: str, limit: int = 8) -> List[str]:
        output = [item for item in values if item != value]
        output.append(value)
        return output[-limit:]
