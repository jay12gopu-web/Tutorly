from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
load_dotenv(ROOT / "backend" / ".env")

from backend.chatbot.ai import GroqProvider, SemanticTutorService
from backend.chatbot.schemas import ConversationTurn, LearnerProfile


@dataclass(frozen=True)
class LiveCase:
    name: str
    question: str
    subject: str
    topic_signals: tuple[str, ...]
    expected_format: tuple[str, ...] = ()
    expected_length: tuple[str, ...] = ()
    visual_expected: bool | None = None


CASES = (
    LiveCase("biology-indirect", "Why does the powerhouse of a cell need oxygen?", "biology", ("mitochond", "respiration")),
    LiveCase("physics-indirect", "Why do I move forward when a bus suddenly stops?", "physics", ("inertia",), expected_format=("why_explanation",)),
    LiveCase("chemistry-indirect", "Why does salt seem to disappear in water?", "chemistry", ("dissol", "solution")),
    LiveCase("maths-indirect-graph", "Show me what happens to y when x increases in y = 2x + 3", "mathematics", ("linear", "function"), expected_format=("math_graph",), visual_expected=True),
    LiveCase("english-metaphor", "Why does the poet describe the night as a blanket?", "english", ("metaphor", "poetry", "poetic"), expected_format=("english_literature", "why_explanation")),
    LiveCase("history-causes", "Why were people in France angry before the revolution?", "history", ("french revolution", "revolution")),
    LiveCase("geography-rain-shadow", "Why does one side of a mountain get more rain than the other?", "geography", ("orographic", "rain shadow", "relief rainfall"), visual_expected=True),
    LiveCase("civics-process", "How does an idea finally become a law?", "civics", ("legislative", "bill", "law"), expected_format=("civics_process", "process_steps"), visual_expected=True),
    LiveCase("computer-science-debugging", "Why does my loop never stop?", "computer_science", ("infinite loop", "loop"), expected_format=("debugging",)),
    LiveCase("ambiguous-literature", "The current character is angry because he feels powerless. Explain.", "english", ("character", "literary", "emotion")),
    LiveCase("simple-fact", "What is the SI unit of force?", "physics", ("unit", "force", "newton"), expected_format=("direct_answer",), expected_length=("very_short",), visual_expected=False),
    LiveCase("biology-format", "What do mitochondria do?", "biology", ("mitochond",), expected_format=("biology_structure", "concise_definition", "concept_explanation")),
    LiveCase("maths-format", "Solve 4x + 3 = 19.", "mathematics", ("linear equation", "equation"), expected_format=("math_worked_solution",), expected_length=("short", "medium"), visual_expected=False),
    LiveCase("chemistry-format", "What is sublimation?", "chemistry", ("sublimation",), expected_format=("concise_definition", "concept_explanation")),
    LiveCase("history-format", "Why did the French Revolution begin?", "history", ("french revolution",), expected_format=("history_causes", "why_explanation")),
    LiveCase("comparison-format", "Difference between speed and velocity.", "physics", ("speed", "velocity"), expected_format=("comparison_table",)),
)


def assert_case(case: LiveCase, result) -> None:
    if not result.provider_used:
        raise RuntimeError(f"provider unavailable: {result.status}")
    route = result.output.classification
    assert route.subject.value == case.subject, (case.name, route.subject.value, route.topic)
    topic = route.topic.lower()
    assert any(signal in topic for signal in case.topic_signals), (case.name, route.topic)
    if case.expected_format:
        assert route.answer_format.value in case.expected_format, (case.name, route.answer_format.value)
    if case.expected_length:
        assert route.response_length.value in case.expected_length, (case.name, route.response_length.value)
    if case.visual_expected is not None:
        assert route.visual.needed is case.visual_expected, (case.name, route.visual.model_dump(mode="json"))
    if case.name == "simple-fact":
        assert len(result.output.answer.split()) <= 20, result.output.answer
    if case.name == "maths-format":
        assert "4" in result.output.answer and ("step" in result.output.answer.lower() or "subtract" in result.output.answer.lower())
    if case.name == "comparison-format":
        assert "|" in result.output.answer, result.output.answer


async def main(show_answers: bool, start_case: str = "") -> int:
    provider = GroqProvider(timeout_seconds=40)
    service = SemanticTutorService(provider)
    profile = LearnerProfile(user_id="live-test", grade="grade_9")
    passed = 0

    selected_cases = list(CASES)
    if start_case:
        start_index = next((index for index, case in enumerate(CASES) if case.name == start_case), None)
        if start_index is None:
            raise ValueError(f"Unknown start case: {start_case}")
        selected_cases = list(CASES[start_index:])

    for case in selected_cases:
        result = await service.route_and_answer(
            student_question=case.question,
            conversation_context=[],
            profile=profile,
            mode="prime",
        )
        if not result.provider_used:
            print(json.dumps({"case": case.name, "status": result.status, "provider_used": False}))
            return 2
        assert_case(case, result)
        route = result.output.classification
        record = {
            "case": case.name,
            "subject": route.subject.value,
            "topic": route.topic,
            "intent": route.intent.value,
            "format": route.answer_format.value,
            "length": route.response_length.value,
            "visual": route.visual.type.value if route.visual.needed else "none",
        }
        if show_answers:
            record["answer"] = result.output.answer
        print(json.dumps(record, ensure_ascii=False))
        passed += 1

    first = await service.route_and_answer(
        student_question="What is photosynthesis?",
        conversation_context=[],
        profile=profile,
        mode="prime",
    )
    if not first.provider_used:
        print(json.dumps({"case": "followup-first", "status": first.status, "provider_used": False}))
        return 2
    context = [
        ConversationTurn(role="user", content="What is photosynthesis?"),
        ConversationTurn(role="assistant", content=first.output.answer),
    ]
    second = await service.route_and_answer(
        student_question="Explain it more simply.",
        conversation_context=context,
        profile=profile,
        mode="prime",
    )
    if not second.provider_used:
        print(json.dumps({"case": "followup-second", "status": second.status, "provider_used": False}))
        return 2
    assert second.output.classification.subject.value == "biology"
    assert "photosynth" in second.output.classification.topic.lower()
    assert second.output.answer != first.output.answer
    assert second.output.classification.response_length.value in {"very_short", "short"}
    followup_record = {
        "case": "followup-simpler",
        "subject": second.output.classification.subject.value,
        "topic": second.output.classification.topic,
        "format": second.output.classification.answer_format.value,
        "length": second.output.classification.response_length.value,
    }
    if show_answers:
        followup_record["first_answer"] = first.output.answer
        followup_record["answer"] = second.output.answer
    print(json.dumps(followup_record, ensure_ascii=False))
    print(f"Live semantic and formatting cases passed: {passed + 1}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Tutorly's live Groq semantic-routing regression matrix.")
    parser.add_argument("--show-answers", action="store_true")
    parser.add_argument("--start", default="", help="Resume from a named case.")
    arguments = parser.parse_args()
    raise SystemExit(asyncio.run(main(arguments.show_answers, arguments.start)))
