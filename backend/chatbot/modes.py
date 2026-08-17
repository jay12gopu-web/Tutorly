from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from .schemas import ChatMode


@dataclass(frozen=True)
class ModeStrategy:
    mode: ChatMode
    title: str
    description: str
    response_depth: str
    reasoning_style: str
    temperature_hint: float
    max_sections: int
    preferred_tools: List[str] = field(default_factory=list)
    prompt_rules: List[str] = field(default_factory=list)


class ModeRegistry:
    def __init__(self) -> None:
        self._strategies: Dict[ChatMode, ModeStrategy] = {
            ChatMode.spark: ModeStrategy(
                mode=ChatMode.spark,
                title="Spark",
                description="Fast homework help with compact answers.",
                response_depth="short",
                reasoning_style="direct",
                temperature_hint=0.25,
                max_sections=3,
                preferred_tools=["calculator", "quick_summary"],
                prompt_rules=[
                    "Answer quickly.",
                    "Keep only the essential steps.",
                    "Use simple language and avoid long side notes.",
                ],
            ),
            ChatMode.prime: ModeStrategy(
                mode=ChatMode.prime,
                title="Prime",
                description="Balanced tutoring for most student questions.",
                response_depth="balanced",
                reasoning_style="guided",
                temperature_hint=0.35,
                max_sections=5,
                preferred_tools=["calculator", "flashcards", "quiz"],
                prompt_rules=[
                    "Explain clearly with a clean study-note format.",
                    "Use examples when they improve understanding.",
                    "Highlight final answers.",
                ],
            ),
            ChatMode.lens: ModeStrategy(
                mode=ChatMode.lens,
                title="Lens",
                description="Image-aware tutoring for OCR, homework photos, and screenshots.",
                response_depth="image-aware",
                reasoning_style="extract-then-solve",
                temperature_hint=0.3,
                max_sections=5,
                preferred_tools=["ocr", "calculator", "diagram_interpreter"],
                prompt_rules=[
                    "Use extracted image text as primary context.",
                    "Mention uncertainty when image text is unclear.",
                    "Solve the visible question and invite corrections if OCR missed something.",
                ],
            ),
            ChatMode.deep: ModeStrategy(
                mode=ChatMode.deep,
                title="Deep Think",
                description="Careful multi-step reasoning for harder topics.",
                response_depth="deep",
                reasoning_style="plan-verify-refine",
                temperature_hint=0.22,
                max_sections=7,
                preferred_tools=["calculator", "reasoning_checker", "knowledge_search"],
                prompt_rules=[
                    "Plan the solution before answering.",
                    "Verify important steps.",
                    "Include alternative approaches when useful.",
                ],
            ),
            ChatMode.research: ModeStrategy(
                mode=ChatMode.research,
                title="Research",
                description="Structured research-style explanations with references.",
                response_depth="research",
                reasoning_style="retrieve-cite-synthesize",
                temperature_hint=0.18,
                max_sections=7,
                preferred_tools=["knowledge_search", "document_search", "citation_builder"],
                prompt_rules=[
                    "Separate known facts from uncertainty.",
                    "Prefer cited context when available.",
                    "Use careful wording for current or high-stakes facts.",
                ],
            ),
            ChatMode.creative: ModeStrategy(
                mode=ChatMode.creative,
                title="Creative",
                description="Creative explanations, writing support, and memorable examples.",
                response_depth="expressive",
                reasoning_style="generate-compare-polish",
                temperature_hint=0.72,
                max_sections=6,
                preferred_tools=["example_generator", "note_tool"],
                prompt_rules=[
                    "Use memorable analogies.",
                    "Offer polished wording options.",
                    "Keep the result useful for learning, not just flashy.",
                ],
            ),
            ChatMode.coding: ModeStrategy(
                mode=ChatMode.coding,
                title="Coding",
                description="Programming help, debugging, and code explanation.",
                response_depth="technical",
                reasoning_style="inspect-isolate-fix-test",
                temperature_hint=0.2,
                max_sections=7,
                preferred_tools=["code_tool", "debugger", "test_generator"],
                prompt_rules=[
                    "Explain why the code works.",
                    "Name edge cases.",
                    "Prefer small testable fixes over rewrites.",
                ],
            ),
            ChatMode.study: ModeStrategy(
                mode=ChatMode.study,
                title="Study",
                description="Revision, quizzes, flashcards, checkpoints, and study planning.",
                response_depth="study",
                reasoning_style="teach-test-review",
                temperature_hint=0.32,
                max_sections=7,
                preferred_tools=["quiz", "flashcards", "study_plan", "knowledge_check"],
                prompt_rules=[
                    "Turn explanations into active recall.",
                    "Create practice items after the main answer.",
                    "Recommend the next study step.",
                ],
            ),
        }

    def get(self, mode: ChatMode) -> ModeStrategy:
        return self._strategies.get(mode, self._strategies[ChatMode.prime])

    def all(self) -> List[ModeStrategy]:
        return list(self._strategies.values())
