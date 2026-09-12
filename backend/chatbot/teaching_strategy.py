"""Bounded conversation teaching state. Stores methods and evidence, never reasoning."""
from __future__ import annotations

import copy
import re
import time
import unicodedata
from collections import OrderedDict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Literal

from pydantic import BaseModel, ConfigDict
from .schemas import LearnerProfile

Strategy = Literal["direct", "simpler", "step_by_step", "analogy", "real_life_example",
                   "worked_example", "diagram", "illustration", "guided_questions", "voice"]
STRATEGIES = ("direct", "simpler", "step_by_step", "analogy", "real_life_example",
              "worked_example", "diagram", "illustration", "guided_questions", "voice")
CONFUSION = {"confused", "simpler", "another_way", "incorrect_answer", "repeated_incorrect"}
SCIENCE = {"science", "physics", "chemistry", "biology"}


class TeachingDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    signal: Literal["none", "confused", "simpler", "another_way", "incorrect_answer",
                    "repeated_incorrect", "answer_only", "understood", "repeat"] = "none"
    strategy: Strategy = "direct"
    topic_relation: Literal["new", "continuing", "resumed"] = "new"
    requested_strategy: bool = False
    visual_support: Literal["none", "offer", "show"] = "none"
    voice_support: Literal["none", "offer"] = "none"


@dataclass
class TopicAttempts:
    topic: str
    subject: str
    strategies: list[str] = field(default_factory=list)
    confusion_count: int = 0
    wrong_streak: int = 0
    last_strategy: str = ""
    visual_shown: bool = False
    voice_offered: bool = False
    answers: list[str] = field(default_factory=list)


@dataclass
class TeachingSession:
    active_topic: str = ""
    topics: OrderedDict = field(default_factory=OrderedDict)
    updated: float = field(default_factory=time.monotonic)


def topic_key(subject: str, topic: str) -> str:
    return subject + ":" + " ".join(unicodedata.normalize("NFKC", topic).casefold().split())[:160]


def similar_explanation(first: str, second: str) -> bool:
    # Comparison only: never run normalization on the answer sent to Markdown/KaTeX.
    def normalize(text):
        return " ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", text).casefold()))
    left, right = normalize(first), normalize(second)
    if not left or not right:
        return False
    if left == right:
        return True
    if min(len(left), len(right)) < 45:
        return False
    if SequenceMatcher(None, left, right, autojunk=False).ratio() >= .78:
        return True
    a, b = set(zip(*[left.split()[i:] for i in range(3)])), set(zip(*[right.split()[i:] for i in range(3)]))
    return bool(a and b and len(a & b) / min(len(a), len(b)) >= .72)


class TeachingStrategyEngine:
    def __init__(self, max_sessions=256, ttl_seconds=7200, max_topics=6):
        self.max_sessions = max_sessions
        self.ttl_seconds = ttl_seconds
        self.max_topics = max_topics
        self._sessions: OrderedDict = OrderedDict()

    def _session(self, owner, conversation_id):
        if not owner:
            return TeachingSession()
        now = time.monotonic()
        expired = [key for key, value in self._sessions.items() if now - value.updated > self.ttl_seconds]
        for key in expired:
            self._sessions.pop(key, None)
        key = (owner, conversation_id)
        session = self._sessions.setdefault(key, TeachingSession())
        session.updated = now
        self._sessions.move_to_end(key)
        while len(self._sessions) > self.max_sessions:
            self._sessions.popitem(last=False)
        return session

    def snapshot(self, owner, conversation_id):
        return copy.deepcopy(self._session(owner, conversation_id))

    def context(self, session, profile: LearnerProfile):
        active = session.topics.get(session.active_topic)
        previous = list(active.strategies) if active else []
        available = [method for method in STRATEGIES if method not in previous]
        # No fixed progression: these are candidates, selected semantically using
        # the new request, current subject and preferences in the same model call.
        if not profile.show_diagrams:
            available = [method for method in available if method not in {"diagram", "illustration"}]
        if not profile.use_examples:
            available = [method for method in available if method not in {"analogy", "real_life_example", "worked_example"}]
        preference = {"step_by_step": "step_by_step", "ask_questions": "guided_questions",
                      "challenge_me": "guided_questions", "explain_first": "direct"}.get(profile.learning_approach)
        if not preference:
            preference = "simpler" if profile.answer_detail == "short" else "direct"
        return {
            "active_topic": active.topic if active else "",
            "subject": active.subject if active else "",
            "strategies_already_used": previous,
            "last_strategy": active.last_strategy if active else "",
            "confusion_count": active.confusion_count if active else 0,
            "wrong_streak": active.wrong_streak if active else 0,
            "visual_already_shown": active.visual_shown if active else False,
            "voice_already_offered": active.voice_offered if active else False,
            "available_methods_if_confused": available,
            "preferred_initial_method": preference,
            "recent_explanations": [answer[:1600] for answer in active.answers[-3:]] if active else [],
            "other_topics": [{"topic": item.topic, "subject": item.subject, "methods": item.strategies}
                             for key, item in session.topics.items() if key != session.active_topic][-4:],
            "if_methods_exhausted": "Ask one specific diagnostic question about the student's sticking point; do not restart a lecture.",
        }

    def previous(self, session, route, decision):
        if decision.topic_relation == "continuing":
            active = session.topics.get(session.active_topic)
            if active and active.subject == route.subject.value:
                return active
        return session.topics.get(topic_key(route.subject.value, route.topic))

    def repetition_issue(self, session, output, history=()):
        decision, route = output.teaching, output.classification
        if decision.signal in {"answer_only", "repeat", "understood"} or route.intent.value == "answer_only":
            return ""
        prior = self.previous(session, route, decision)
        confusion = decision.signal in CONFUSION
        if not confusion:
            return ""
        if decision.signal == "simpler" and decision.strategy not in {"simpler", "worked_example", "step_by_step", "analogy", "guided_questions"}:
            return "simplification_needed"
        if prior:
            if decision.strategy in prior.strategies and not decision.requested_strategy:
                return "method_already_tried"
            if any(similar_explanation(output.answer, answer) for answer in prior.answers):
                return "explanation_repeated"
        # Supplied visible history also protects a follow-up after process restart.
        if decision.topic_relation != "new":
            previous_answers = [turn.content for turn in history if turn.role == "assistant"][-3:]
            if any(similar_explanation(output.answer, answer) for answer in previous_answers):
                return "explanation_repeated"
        return ""

    def repair_context(self, session, output, profile):
        prior = self.previous(session, output.classification, output.teaching)
        used = prior.strategies if prior else []
        candidates = [item for item in STRATEGIES if item not in {*used, output.teaching.strategy}]
        subject = output.classification.subject.value
        if output.teaching.signal == "simpler":
            preferred = ["simpler", "worked_example", "analogy", "step_by_step", "guided_questions"]
        elif subject == "mathematics":
            preferred = ["worked_example", "step_by_step", "guided_questions", "analogy", "simpler"]
        elif subject == "english":
            preferred = ["worked_example", "guided_questions", "real_life_example", "analogy", "simpler"]
        elif subject in SCIENCE:
            preferred = ["analogy", "real_life_example", "worked_example", "step_by_step", "guided_questions", "diagram"]
        else:
            preferred = ["real_life_example", "step_by_step", "analogy", "guided_questions", "worked_example"]
        if profile.learning_approach in {"ask_questions", "challenge_me"}:
            preferred.insert(0, "guided_questions")
        if not profile.use_examples:
            candidates = [item for item in candidates if item not in {"analogy", "real_life_example", "worked_example"}]
        if not profile.show_diagrams:
            candidates = [item for item in candidates if item not in {"diagram", "illustration"}]
        method = next((item for item in preferred if item in candidates), "guided_questions")
        if output.teaching.signal == "simpler":
            method = "simpler"  # An explicit simpler request wins; use a new smaller example.
        if output.teaching.requested_strategy:
            method = output.teaching.strategy
        return {"avoid_strategies": list(dict.fromkeys([*used, output.teaching.strategy])),
                "required_strategy": method, "rejected_answer": output.answer[:2500],
                "instruction": "Change the teaching method and example, not just wording. Ask one focused diagnostic question if all appropriate methods were tried."}

    def diagnostic_question(self, session, output):
        prior = self.previous(session, output.classification, output.teaching)
        previous_answers = prior.answers if prior else []
        # Used only after one unsuccessful repair, not as the teaching engine.
        # Seek concrete evidence rather than repeat a lecture or invent mastery.
        questions = (
            "Which part feels unclear: the starting idea, the example, or one of the steps?",
            "Can you point to the exact line or word that lost you? We can focus just on that.",
            "What have you tried so far? Show me your first uncertain step and we'll work from there.",
            "What do you think is happening in this example? A rough guess is enough to find where the explanation needs to change.",
            "What is the first thing you would need to know to get started? Let's handle that one thing together.",
        )
        return next((question for question in questions if question not in previous_answers), questions[0])

    def remember(self, owner, conversation_id, session, output, *, visual_shown=False, voice_offered=False):
        route, decision = output.classification, output.teaching
        key = topic_key(route.subject.value, route.topic)
        prior = self.previous(session, route, decision)
        if decision.topic_relation == "continuing" and prior:
            key = next((key for key, item in session.topics.items() if item is prior), key)
        attempt = prior if prior and decision.topic_relation != "new" else TopicAttempts(route.topic, route.subject.value)
        if decision.signal in CONFUSION:
            attempt.confusion_count += 1
        if decision.signal in {"incorrect_answer", "repeated_incorrect"}:
            attempt.wrong_streak += 1
        elif decision.signal in {"understood", "none"}:
            attempt.wrong_streak = 0
        attempt.last_strategy = decision.strategy
        attempt.strategies = list(dict.fromkeys([*attempt.strategies, decision.strategy]))[-10:]
        attempt.visual_shown = attempt.visual_shown or visual_shown
        attempt.voice_offered = attempt.voice_offered or voice_offered
        attempt.answers = [*attempt.answers, output.answer[:2400]][-4:]
        session.topics[key] = attempt
        session.topics.move_to_end(key)
        session.active_topic = key
        while len(session.topics) > self.max_topics:
            session.topics.popitem(last=False)
        session.updated = time.monotonic()
        if owner:
            self._sessions[(owner, conversation_id)] = session
            self._sessions.move_to_end((owner, conversation_id))
            # Other requests can finish after the original snapshot was evicted.
            while len(self._sessions) > self.max_sessions:
                self._sessions.popitem(last=False)
        return attempt

    @staticmethod
    def actions(output, previous, profile, *, voice_mode=False):
        decision, route = output.teaching, output.classification
        if decision.signal in {"answer_only", "understood", "repeat"} or route.intent.value == "answer_only":
            return []
        if decision.signal not in CONFUSION and decision.visual_support != "offer" and decision.voice_support != "offer":
            return []
        actions = [{"id": "another_method", "label": "Explain another way"}]
        if profile.use_examples:
            actions.append({"id": "give_example", "label": "Show example"})
        if decision.visual_support == "offer" and profile.show_diagrams:
            actions.append({"id": "show_diagram", "label": "View diagram"})
        if decision.voice_support == "offer" and not voice_mode and not (previous and previous.voice_offered):
            actions.append({"id": "talk_it_through", "label": "Talk it through"})
        return actions[:4]
