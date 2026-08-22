from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Deque, Dict


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int = 0


class SlidingWindowRateLimiter:
    """In-memory per-user/session protection for the initial Groq deployment."""

    def __init__(self, requests_per_minute: int = 15, requests_per_hour: int = 150) -> None:
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self._events: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> RateLimitDecision:
        now = monotonic()
        with self._lock:
            events = self._events[key]
            while events and now - events[0] >= 3600:
                events.popleft()
            recent_minute = [timestamp for timestamp in events if now - timestamp < 60]
            if len(recent_minute) >= self.requests_per_minute:
                retry = max(1, int(60 - (now - recent_minute[0])))
                return RateLimitDecision(False, retry)
            if len(events) >= self.requests_per_hour:
                retry = max(1, int(3600 - (now - events[0])))
                return RateLimitDecision(False, retry)
            events.append(now)
        return RateLimitDecision(True, 0)
