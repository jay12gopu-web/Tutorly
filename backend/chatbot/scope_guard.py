from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ScopeDecision:
    """Whether a request belongs in an education-only tutoring product."""

    allowed: bool
    category: str = "education"
    reason: str = ""

    def refusal(self) -> str:
        return (
            "I'm designed to help students learn. I can explain the science, math, history, "
            "language, technology, or study skills behind a question, but I'm not intended "
            "for general non-educational assistance.\n\n"
            "If you have an academic question, homework problem, study topic, or code you are "
            "learning from, send it here and I'll help you work through it."
        )


class EducationScopeGuard:
    """Small deterministic boundary before a request can reach the language model.

    The guard blocks requests that are outside Tutorly's role while still allowing an
    educational explanation of a sensitive subject (for example, civics or biology).
    """

    EDUCATIONAL_CONTEXT = re.compile(
        r"\b(?:explain|learn|study|school|class|grade|homework|assignment|exam|textbook|"
        r"lesson|syllabus|curriculum|project|presentation|essay|speech|report|history|"
        r"civics|biology|chemistry|physics|computer science|coding|programming)\b",
        re.IGNORECASE,
    )

    RULES = (
        (
            "dangerous cyber activity",
            re.compile(
                r"\b(?:write|build|create|make|deploy|send|run|use)\b.*\b(?:malware|ransomware|keylogger|"
                r"virus|trojan|worm|ddos|phishing|credential[ -]?steal(?:er|ing)?)\b|"
                r"\b(?:steal|crack|hack|bypass)\b.*\b(?:password|account|wifi|website|security)\b",
                re.IGNORECASE,
            ),
            False,
        ),
        (
            "dating or relationship advice",
            re.compile(
                r"\b(?:dating advice|relationship advice|should i date|my crush|how (?:do|can) i flirt|"
                r"get (?:a|my) (?:boyfriend|girlfriend)|break up with)\b",
                re.IGNORECASE,
            ),
            True,
        ),
        (
            "medical diagnosis or treatment advice",
            re.compile(
                r"\b(?:diagnose|diagnosis|what(?:'s| is) wrong with me|do i have|should i take|"
                r"what medicine|dose(?:age)?|treat my|cure my)\b",
                re.IGNORECASE,
            ),
            True,
        ),
        (
            "personal legal advice",
            re.compile(
                r"\b(?:legal advice|sue(?:ing)?|lawsuit|can i sue|my legal case|court case|"
                r"legal action|what should i do legally)\b",
                re.IGNORECASE,
            ),
            True,
        ),
        (
            "investment or personal-finance advice",
            re.compile(
                r"\b(?:should i (?:buy|sell|invest)|investment advice|stock tip|crypto(?:currency)? (?:price|tip|"
                r"investment)|which coin|trading advice|personal finance|how should i invest)\b",
                re.IGNORECASE,
            ),
            True,
        ),
        (
            "sports prediction or betting",
            re.compile(
                r"\b(?:who will win|match prediction|bet(?:ting)? tip|odds|fantasy team|dream11)\b",
                re.IGNORECASE,
            ),
            True,
        ),
        (
            "political debate or current political prediction",
            re.compile(
                r"\b(?:which (?:party|politician) is better|who should i vote for|election (?:result|prediction)|"
                r"political debate|support (?:party|candidate))\b",
                re.IGNORECASE,
            ),
            True,
        ),
        (
            "general non-educational assistance",
            re.compile(
                r"\b(?:tell me a joke|recommend (?:a )?(?:movie|restaurant|product)|weather (?:today|tomorrow)|"
                r"plan (?:my )?trip|celebrity gossip|horoscope)\b",
                re.IGNORECASE,
            ),
            True,
        ),
    )

    def assess(self, message: str) -> ScopeDecision:
        text = " ".join((message or "").split())
        is_educational = bool(self.EDUCATIONAL_CONTEXT.search(text))

        for category, pattern, allow_educational_context in self.RULES:
            if not pattern.search(text):
                continue
            if allow_educational_context and is_educational:
                return ScopeDecision(allowed=True, category="education")
            return ScopeDecision(allowed=False, category=category, reason=category)

        return ScopeDecision(allowed=True, category="education")
