from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict, Iterable, List

from .schemas import ConversationTurn


class ConversationContextStore:
    """Small bounded server-side context store for follow-up understanding."""

    def __init__(self, max_turns: int = 12) -> None:
        self.max_turns = max(4, min(max_turns, 30))
        self._turns: Dict[str, Deque[ConversationTurn]] = defaultdict(
            lambda: deque(maxlen=self.max_turns)
        )
        self._lock = Lock()

    def recent(
        self,
        conversation_id: str,
        supplied: Iterable[ConversationTurn] = (),
    ) -> List[ConversationTurn]:
        supplied_turns = list(supplied)[-self.max_turns:]
        with self._lock:
            stored = list(self._turns.get(conversation_id, ()))
        combined = supplied_turns or stored
        return combined[-self.max_turns:]

    def append(self, conversation_id: str, role: str, content: str) -> None:
        clean = " ".join((content or "").replace("\x00", "").split()).strip()
        if not clean:
            return
        turn = ConversationTurn(role=role, content=clean[:5000])
        with self._lock:
            self._turns[conversation_id].append(turn)
