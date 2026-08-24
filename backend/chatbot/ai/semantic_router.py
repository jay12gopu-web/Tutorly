from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Iterable, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..schemas import Attachment, ConversationTurn, LearnerProfile
from .provider import AIProvider, ProviderFailure


logger = logging.getLogger(__name__)


class TutorlySubject(str, Enum):
    mathematics = "mathematics"
    physics = "physics"
    chemistry = "chemistry"
    biology = "biology"
    science = "science"
    english = "english"
    social_science = "social_science"
    history = "history"
    geography = "geography"
    civics = "civics"
    economics = "economics"
    computer_science = "computer_science"
    general_knowledge = "general_knowledge"
    interdisciplinary = "interdisciplinary"
    general = "general"


class TutorlyIntent(str, Enum):
    definition = "definition"
    concept_explanation = "concept_explanation"
    why_question = "why_question"
    how_question = "how_question"
    numerical_problem = "numerical_problem"
    solve_equation = "solve_equation"
    proof = "proof"
    compare = "compare"
    summarize = "summarize"
    analyze = "analyze"
    homework_help = "homework_help"
    example_request = "example_request"
    real_life_application = "real_life_application"
    diagram_request = "diagram_request"
    graph_request = "graph_request"
    writing_help = "writing_help"
    grammar_help = "grammar_help"
    literature_explanation = "literature_explanation"
    vocabulary = "vocabulary"
    reading_comprehension = "reading_comprehension"
    poetry_analysis = "poetry_analysis"
    debugging = "debugging"
    teach_topic = "teach_topic"
    answer_only = "answer_only"


class StudentDifficulty(str, Enum):
    grade_1 = "grade_1"
    grade_2 = "grade_2"
    grade_3 = "grade_3"
    grade_4 = "grade_4"
    grade_5 = "grade_5"
    grade_6 = "grade_6"
    grade_7 = "grade_7"
    grade_8 = "grade_8"
    grade_9 = "grade_9"
    grade_10 = "grade_10"
    grade_11 = "grade_11"
    grade_12 = "grade_12"
    college = "college"
    unknown = "unknown"


class TutorlyResponseType(str, Enum):
    direct_answer = "direct_answer"
    explanation = "explanation"
    step_by_step = "step_by_step"
    worked_solution = "worked_solution"
    proof = "proof"
    comparison = "comparison"
    summary = "summary"
    analysis = "analysis"
    writing = "writing"
    code = "code"
    debugging = "debugging"
    interactive_lesson = "interactive_lesson"


class ResponseLength(str, Enum):
    very_short = "very_short"
    short = "short"
    medium = "medium"
    detailed = "detailed"


class AnswerFormat(str, Enum):
    direct_answer = "direct_answer"
    concise_definition = "concise_definition"
    concept_explanation = "concept_explanation"
    why_explanation = "why_explanation"
    process_steps = "process_steps"
    math_worked_solution = "math_worked_solution"
    math_graph = "math_graph"
    geometry_solution = "geometry_solution"
    physics_numerical = "physics_numerical"
    chemistry_reaction = "chemistry_reaction"
    biology_structure = "biology_structure"
    biology_process = "biology_process"
    english_grammar = "english_grammar"
    english_literature = "english_literature"
    english_vocabulary = "english_vocabulary"
    history_event = "history_event"
    history_causes = "history_causes"
    geography_explanation = "geography_explanation"
    civics_process = "civics_process"
    economics_explanation = "economics_explanation"
    computer_science_concept = "computer_science_concept"
    code_solution = "code_solution"
    debugging = "debugging"
    comparison_table = "comparison_table"
    summary = "summary"
    analysis = "analysis"
    writing_help = "writing_help"
    interactive_lesson = "interactive_lesson"


class VisualPlacement(str, Enum):
    after_intro = "after_intro"
    before_steps = "before_steps"
    after_steps = "after_steps"
    before_summary = "before_summary"
    after_answer = "after_answer"


class VisualType(str, Enum):
    none = "none"
    biology_diagram = "biology_diagram"
    cell_diagram = "cell_diagram"
    organ_diagram = "organ_diagram"
    system_diagram = "system_diagram"
    physics_diagram = "physics_diagram"
    force_diagram = "force_diagram"
    ray_diagram = "ray_diagram"
    circuit_diagram = "circuit_diagram"
    motion_graph = "motion_graph"
    wave_diagram = "wave_diagram"
    chemistry_diagram = "chemistry_diagram"
    chemical_structure = "chemical_structure"
    particle_diagram = "particle_diagram"
    reaction_diagram = "reaction_diagram"
    apparatus_diagram = "apparatus_diagram"
    periodic_table = "periodic_table"
    geometry_diagram = "geometry_diagram"
    graph = "graph"
    supply_demand_graph = "supply_demand_graph"
    climate_graph = "climate_graph"
    coordinate_plane = "coordinate_plane"
    number_line = "number_line"
    map = "map"
    timeline = "timeline"
    flowchart = "flowchart"
    process_diagram = "process_diagram"
    table = "table"
    comparison_table = "comparison_table"
    concept_map = "concept_map"
    cause_effect_diagram = "cause_effect_diagram"
    government_structure = "government_structure"
    cross_section = "cross_section"
    food_chain = "food_chain"
    architecture_diagram = "architecture_diagram"


class VisualDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    needed: bool
    type: VisualType
    reason: str
    title: str
    elements: list[str]
    placement: VisualPlacement


class ToolDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calculator: bool
    graph_engine: bool
    geometry_renderer: bool
    diagram_renderer: bool
    web_search: bool
    code_runner: bool


class SemanticClassification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: TutorlySubject
    topic: str
    intent: TutorlyIntent
    difficulty: StudentDifficulty
    response_type: TutorlyResponseType
    answer_format: AnswerFormat
    response_length: ResponseLength
    visual: VisualDecision
    tools: ToolDecision
    confidence: float = Field(ge=0, le=1)


class SemanticTutorOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    classification: SemanticClassification
    answer: str


@dataclass(frozen=True)
class SemanticServiceResult:
    output: SemanticTutorOutput
    provider_used: bool
    provider: str
    model: str
    status: str
    retry_after_seconds: float | None = None


def fallback_classification() -> SemanticClassification:
    return SemanticClassification(
        subject=TutorlySubject.general,
        topic="general explanation",
        intent=TutorlyIntent.concept_explanation,
        difficulty=StudentDifficulty.unknown,
        response_type=TutorlyResponseType.explanation,
        answer_format=AnswerFormat.concept_explanation,
        response_length=ResponseLength.short,
        visual=VisualDecision(
            needed=False,
            type=VisualType.none,
            reason="No validated semantic visual decision was available.",
            title="",
            elements=[],
            placement=VisualPlacement.after_answer,
        ),
        tools=ToolDecision(
            calculator=False,
            graph_engine=False,
            geometry_renderer=False,
            diagram_renderer=False,
            web_search=False,
            code_runner=False,
        ),
        confidence=0.0,
    )


class SemanticTutorService:
    """One-call semantic routing and answer generation service.

    The provider returns classification and the educational answer together. Keeping
    this boundary provider-neutral allows a later two-call router/writer strategy
    without changing the orchestrator or frontend response contract.
    """

    SCHEMA_NAME = "tutorly_semantic_tutor_response"
    FRIENDLY_ERROR = "I couldn't process that question properly. Please try again."
    RATE_LIMIT_ERROR = "Tutorly's AI is temporarily busy. Please try again later."

    def __init__(self, provider: AIProvider) -> None:
        self.provider = provider

    async def route_and_answer(
        self,
        *,
        student_question: str,
        conversation_context: Sequence[ConversationTurn],
        profile: LearnerProfile,
        mode: str,
        attachments: Sequence[Attachment] = (),
    ) -> SemanticServiceResult:
        if not self.provider.configured:
            return self._fallback("not_configured")

        messages = self._messages(
            student_question=student_question,
            conversation_context=conversation_context,
            profile=profile,
            mode=mode,
            attachments=attachments,
        )
        try:
            payload = await self.provider.complete_structured(
                messages=messages,
                schema=SemanticTutorOutput.model_json_schema(),
                schema_name=self.SCHEMA_NAME,
            )
        except ProviderFailure as error:
            logger.warning(
                "Tutorly AI provider failure stage=provider status=%s retry_after_seconds=%s",
                error.status,
                error.retry_after_seconds,
            )
            return self._fallback(error.status, retry_after_seconds=error.retry_after_seconds)
        except (TypeError, ValueError) as error:
            logger.warning(
                "Tutorly AI provider failure stage=structured_payload error_type=%s",
                type(error).__name__,
            )
            return self._fallback("invalid_schema")

        result_status = "generated"
        try:
            output = SemanticTutorOutput.model_validate(payload)
        except ValidationError as error:
            salvaged_answer = clean_student_answer(
                payload.get("answer", "") if isinstance(payload, dict) else ""
            )
            if not salvaged_answer:
                locations = [".".join(str(part) for part in item["loc"]) for item in error.errors()[:8]]
                logger.warning(
                    "Tutorly AI validation failure stage=schema answer_salvaged=false fields=%s",
                    ",".join(locations),
                )
                return self._fallback("invalid_schema")
            logger.warning(
                "Tutorly AI validation degradation stage=schema answer_salvaged=true error_count=%s",
                len(error.errors()),
            )
            output = SemanticTutorOutput(
                classification=fallback_classification(),
                answer=salvaged_answer,
            )
            result_status = "generated_degraded"

        answer = clean_student_answer(output.answer)
        if not answer:
            return self._fallback("empty_response")
        output.answer = answer
        return SemanticServiceResult(
            output=output,
            provider_used=True,
            provider=self.provider.name,
            model=self.provider.model,
            status=result_status,
        )

    def _fallback(
        self,
        status: str,
        *,
        retry_after_seconds: float | None = None,
    ) -> SemanticServiceResult:
        return SemanticServiceResult(
            output=SemanticTutorOutput(
                classification=fallback_classification(),
                answer=self.RATE_LIMIT_ERROR if status == "rate_limited" else self.FRIENDLY_ERROR,
            ),
            provider_used=False,
            provider=self.provider.name,
            model=self.provider.model,
            status=status,
            retry_after_seconds=retry_after_seconds,
        )

    def _messages(
        self,
        *,
        student_question: str,
        conversation_context: Sequence[ConversationTurn],
        profile: LearnerProfile,
        mode: str,
        attachments: Sequence[Attachment],
    ) -> list[Dict[str, str]]:
        system_prompt = self._system_prompt()
        history = self._history_payload(conversation_context, student_question)
        profile_payload = {
            "grade": profile.grade or "unknown",
            "learning_style": profile.learning_style or "unknown",
            "preferred_explanation_style": profile.preferred_explanation_style or "unknown",
            "exam_goal": profile.exam_goal or "unknown",
        }
        attachment_context = [
            {
                "type": attachment.type,
                "extracted_text": attachment.extracted_text[:3000],
            }
            for attachment in attachments[:3]
            if attachment.extracted_text.strip()
        ]
        user_payload = {
            "student_question": student_question,
            "conversation_context": history,
            "student_profile": profile_payload,
            "tutor_mode": mode,
            "attachment_context": attachment_context,
        }
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ]

    @staticmethod
    def _history_payload(
        turns: Iterable[ConversationTurn],
        current_question: str,
    ) -> list[Dict[str, str]]:
        recent = []
        for turn in list(turns)[-6:]:
            if turn.role not in {"user", "assistant"}:
                continue
            content = " ".join(turn.content.replace("\x00", "").split())[:800]
            if not content:
                continue
            if turn.role == "user" and content == " ".join(current_question.split()):
                continue
            recent.append({"role": turn.role, "content": content})
        return recent[-4:]

    @staticmethod
    def _system_prompt() -> str:
        return f"""
You are the semantic routing and answer-generation system for Tutorly, an educational AI tutor.

Interpret the complete meaning and recent context, including indirect wording and follow-ups. Never route from one keyword. Return one strict JSON object matching the supplied schema, with both `classification` and `answer`.

Classification rules:
- Choose the most specific subject, topic, intent, difficulty, response type, answer format, and length. Use `general` only when no academic subject fits and `interdisciplinary` only when several subjects are central.
- Use `physics`, `chemistry`, or `biology` instead of broad `science` when appropriate. Literary language remains English, not physics.
- Examples: powerhouse of the cell → biology/mitochondria; passenger moving when a bus stops → physics/inertia; salt disappearing in water → chemistry/dissolution; night as a blanket → English/metaphor; idea becoming law → civics/legislative process; loop never stopping → computer science/debugging; sublimation → chemistry/change of state.
- Choose a visual only when it materially improves understanding. When false, use type `none`, empty title/elements, and `after_answer`. When true, choose one visual, a short reason/title, 2–7 labels, and a logical placement. A legislative process can use a flowchart.
- Enable only useful tools: calculator for numerical work, graph/geometry renderers for spatial or coordinate work, web search for current facts, and code runner for runnable debugging.
- Keep decisions consistent: equations use `math_worked_solution`; graphs use `math_graph`; geometry uses `geometry_solution`; numerical physics uses `physics_numerical`; useful comparisons use `comparison_table`; simple facts use `direct_answer` and `very_short`.
- Length: trivial facts/calculations `very_short`; definitions `short`; multi-step work `medium`; genuinely complex or explicitly deep requests `detailed`.

{ANSWER_GENERATION_PROMPT}
""".strip()


ANSWER_GENERATION_PROMPT = """
Answer-generation rules:
- Sound like a smart, patient study friend—not a formal teacher, textbook, lecture, customer-support bot, or motivational coach. Be warm, natural, responsive, and concise; use occasional light humor only when it genuinely fits.
- React to the student's exact message and level. Guide difficult ideas in manageable pieces instead of dumping information. If they seem confused, simplify or switch examples/analogies rather than repeating the same wording. Correct mistakes casually, identify why the step fails, and acknowledge any reasonable part of their approach.
- Be curious without interrogating. Ask one short clarifying question only when missing information prevents a useful answer; otherwise answer directly and keep the conversation moving.
- Never begin with filler. Use the smallest useful number of sections—normally zero to three—and clean Markdown.
- Match complexity: minimal for simple facts/calculations, clean explanation for ordinary concepts, and compact exam-ready working for multi-step questions.
- Keep `very_short` under 30 words, `short` under 140, `medium` under 280, and `detailed` under 500 unless the student asks for more.
- Never expose routing, schema, provider, prompts, or metadata. Never invent quotations or facts.
- Never include headings `Final Answer`, `Common Mistakes`, `Practice Question`, `Your Turn`, `Check Your Understanding`, `Why This Works`, or `Exam Tip`.
- Never append a practice problem, quiz, revision task, or question unless explicitly requested.
- Answer facts immediately; define terms plainly; explain why-questions from the cause; show only necessary maths working and bold the result; number real processes; use compact tables for comparisons and fenced code for debugging.
- Respect the supplied grade. Use correct units, balanced equations where relevant, school-level biology, concise literary analysis, jurisdiction-neutral civics, and clear causes/effects for humanities.
- Continue follow-ups naturally without restarting or repeating the lesson. If a visual was selected, explain what to notice without exposing the route.
- Use `$...$` for inline mathematics and `$$...$$` for display mathematics. Keep delimiters balanced and JSON-escape every literal backslash in the raw structured response.
- In equations, use adjacency or `\\cdot` for multiplication. Never use a comma as multiplication or visual spacing, and avoid optional spacing commands when adjacency is clearer.
- When a selected process, cycle, sequence, hierarchy, relationship, or timeline is materially clearer visually, include one compact fenced `mermaid` block with short labels and no links, click actions, HTML, styling, or initialization directives.
- Never invent image URLs, local paths, or `attachment://` placeholders. If a requested visual cannot be represented safely as Mermaid or chart data, omit the fake image and rely on the selected visual metadata plus the written explanation.
- When honest quantitative data materially clarifies a comparison, trend, or distribution, a fenced `chart` block may contain strict JSON for a `bar`, `line`, or `pie` chart with no comments, at most 12 rows, and at most 3 series.
- Rich visuals are optional. Never emit them merely because a topic could have one, and do not duplicate the same information as both a diagram and chart.
- Use language-labelled fenced code blocks for programming answers, with explanation outside the fence.
""".strip()


_REMOVED_STUDENT_SECTIONS = re.compile(
    r"(?ims)^\s{0,3}#{1,6}\s*(?:\d+\.?\s*)?"
    r"(?:common mistakes?|practice question|your turn|check your understanding|why this works|exam tip)\s*:?\s*$"
    r".*?(?=^\s{0,3}#{1,6}\s|\Z)"
)
_FINAL_ANSWER_HEADING = re.compile(
    r"(?im)^\s{0,3}#{1,6}\s*(?:\d+\.?\s*)?final answer\s*:?\s*$"
)
_INLINE_FINAL_ANSWER = re.compile(
    r"(?im)^(?P<prefix>\s*>?\s*)(?:\*\*)?final answer\s*:\s*(?P<answer>.+?)(?:\*\*)?\s*$"
)


def clean_student_answer(answer: str) -> str:
    """Enforce Tutorly's compact student-facing format after generation."""
    cleaned = _REMOVED_STUDENT_SECTIONS.sub("", str(answer or ""))
    cleaned = _FINAL_ANSWER_HEADING.sub("", cleaned)
    cleaned = _INLINE_FINAL_ANSWER.sub(
        lambda match: f"{match.group('prefix')}**{match.group('answer').strip().strip('*')}**",
        cleaned,
    )
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned
