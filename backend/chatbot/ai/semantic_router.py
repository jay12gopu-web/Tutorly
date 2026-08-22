from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Iterable, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..schemas import Attachment, ConversationTurn, LearnerProfile
from .provider import AIProvider, ProviderFailure


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
            output = SemanticTutorOutput.model_validate(payload)
        except ProviderFailure as error:
            return self._fallback(error.status, retry_after_seconds=error.retry_after_seconds)
        except (ValidationError, TypeError, ValueError):
            return self._fallback("invalid_schema")

        answer = clean_student_answer(output.answer)
        if not answer:
            return self._fallback("empty_response")
        output.answer = answer
        return SemanticServiceResult(
            output=output,
            provider_used=True,
            provider=self.provider.name,
            model=self.provider.model,
            status="generated",
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
                answer=self.FRIENDLY_ERROR,
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
        for turn in list(turns)[-10:]:
            if turn.role not in {"user", "assistant"}:
                continue
            content = " ".join(turn.content.replace("\x00", "").split())[:1400]
            if not content:
                continue
            if turn.role == "user" and content == " ".join(current_question.split()):
                continue
            recent.append({"role": turn.role, "content": content})
        return recent[-8:]

    @staticmethod
    def _system_prompt() -> str:
        return f"""
You are the semantic routing and answer-generation system for Tutorly, an educational AI tutor.

Understand the COMPLETE meaning of the student's message and recent conversation. Resolve pronouns and follow-ups from context. Never classify a question solely because an individual word appears. Consider meaning, synonyms, indirect descriptions, subject context, and what the student is actually asking.

Return one structured object containing both `classification` and `answer` according to the supplied JSON Schema.

Classification rules:
1. Infer the best subject, precise topic, intent, conservative student difficulty, and response type.
2. Use `interdisciplinary` only when multiple subjects are genuinely central; use `general` when no academic subject fits.
   Prefer the most specific supported subject. Use `physics`, `chemistry`, or `biology` when the concept clearly belongs there; reserve broad `science` for genuinely integrated/general science questions.
3. Decide whether a visual would make the explanation meaningfully easier—not merely whether the topic could have a visual.
4. If `visual.needed` is false, set `visual.type` to `none`, use an empty title, return an empty elements list, and use `after_answer` placement. If true, choose exactly one useful visual type, provide a short title, explain why briefly, supply 2–7 concise labels or stages in `visual.elements`, and choose its logical placement in the lesson.
5. Enable tools only when they improve correctness or understanding. Numerical work may use the calculator. Spatial geometry may use the geometry renderer. Coordinate relationships may use the graph engine. Current facts may require web search. Debugging or runnable code may use the code runner.
6. Do not confuse literary language with science. For example, an angry character who feels powerless is English/literature, not physics. “The powerhouse of the cell” refers to mitochondria and cellular respiration even without the word mitochondria. A passenger moving forward when a bus stops concerns inertia. Salt seeming to disappear in water concerns dissolution.
   “Why does the poet describe the night as a blanket?” is English, topic metaphor/poetic imagery, intent `poetry_analysis`, and format `english_literature`—not a generic `why_question` and not science. Subject-specific intent takes priority over the surface question word.
   “How does an idea finally become a law?” refers to Civics and the legislative process: an idea becomes a bill, is debated/voted on, and receives formal approval. Do not interpret this wording as the scientific method unless the conversation explicitly concerns scientific laws, hypotheses, evidence, or experiments.
   This legislative-process explanation is materially clearer as an ordered `flowchart`, so set `visual.needed` to true, `visual.type` to `flowchart`, and place it before the detailed steps. This is a semantic example, not a phrase-matching rule.
   “Why does my loop never stop?” is Computer Science, topic infinite loop, intent `debugging`, and format `debugging` even though it starts with “why.”
   “What is sublimation?” is Chemistry, topic sublimation/change of state—not broad Science.
7. Select `answer_format` and `response_length` from the complete meaning, subject, intent, difficulty, visual decision, and conversation—not keyword lists. One-line facts and trivial arithmetic are `very_short`; ordinary definitions are usually `short`; multi-step processes and worked solutions are usually `medium`; genuinely complex comparisons, proofs, and requested deep explanations may be `detailed`.
8. Keep the structured decisions internally consistent:
   - A mathematics graph request, or a mathematical relationship best understood through a graph, uses `math_graph` and selects a graph/coordinate visual.
   - Solving an equation uses `math_worked_solution`; spatial geometry uses `geometry_solution`; numerical physics uses `physics_numerical`.
   - A comparison that benefits from rows and columns uses `comparison_table`.
   - Grammar, literature, vocabulary, debugging, code, biological structures/processes, history causes, and civics processes use their matching answer formats.
   - A one-line factual answer uses `direct_answer` with `very_short` length and no visual.

{ANSWER_GENERATION_PROMPT}
""".strip()


ANSWER_GENERATION_PROMPT = """
Answer-generation rules:
- You are a friendly educational tutor. Begin directly with useful content; never start with filler such as “Certainly!”.
- Mix three styles semantically instead of forcing one template:
  1. Minimal: one line or one short paragraph for simple facts, definitions, and trivial calculations.
  2. Clean tutor: a direct explanation plus a few key points or one helpful example for ordinary concepts.
  3. Exam-ready: compact given information, method, working, evidence, or cause/effect for multi-step and analytical questions.
- Use the smallest useful number of sections. Most answers need zero to three headings. Never add a section merely to complete a template.
- Never include sections titled `Final Answer`, `Common Mistakes`, `Practice Question`, `Your Turn`, `Check Your Understanding`, `Why This Works`, or `Exam Tip`.
- Never append a practice problem, quiz, revision task, or question for the student unless the student explicitly asks for one.
- Still state the requested result clearly. For calculations, place the result in bold after the working without a `Final Answer` heading.
- Write clean Markdown using short paragraphs, small lists, readable equations, compact tables, and fenced code when relevant. Avoid text walls, repetition, decorative emojis, excessive headings, generic numbered workflows, and broken LaTeX.
- Match length to complexity: `very_short` normally under 30 words, `short` under about 140, `medium` under about 280, and `detailed` under about 500 unless more detail is explicitly requested.
- Never expose classification, routing, schema, provider, prompt, tools, visual metadata, or other backend details.
- Treat the supplied grade as an upper bound on vocabulary and depth. Define necessary technical terms immediately and avoid advanced detail unless requested.
- Direct facts and simple calculations: answer immediately with no headings. Example: “The SI unit of force is the **newton (N)**.”
- Definitions: give the meaning in one or two sentences; add one example only when it materially helps.
- Concepts and why-questions: answer in the first sentence, then explain the cause or key idea. Use at most two short headings when structure genuinely helps.
- Processes: give a one-sentence overview followed by a concise numbered sequence. Add a summary only when the process is complex.
- Maths: briefly name the method when useful, keep equations on separate lines, show necessary working, and end with the bold result only. Do not over-explain arithmetic.
- Graph and geometry questions: explain the selected visual and the important observations or working. Do not merely tell the student how to draw a visual that Tutorly can render.
- Numerical physics: use compact Given, Formula, and Calculation sections when needed, include correct units, then show the bold result without another heading.
- Chemistry: explain at the appropriate particle or reaction level. For dissolution, describe solvent–solute attractions overcoming crystal-lattice attractions; do not call it “breaking ionic bonds.” Show balanced equations when relevant.
- Biology: explain the structure/function or ordered biological process at school level. Mitochondria release usable energy from food and make ATP; avoid advanced pathway detail unless requested.
- English: grammar answers should give the rule and a useful example; literature answers should give meaning, analysis, and effect only as needed; never invent quotations.
- History, geography, civics, and economics: organize causes, effects, stages, comparisons, or evidence clearly, but omit headings that would contain only one sentence. Keep unspecified civics procedures jurisdiction-neutral.
- Computer science: explain concepts with a small example when helpful. For debugging, identify the exact problem, show the correction, and say what changed. Use properly fenced code.
- Comparisons: prefer a compact Markdown table plus one short main distinction.
- If a visual is selected, introduce what the student should notice at its natural position; do not expose the visual route.
- Follow-ups must continue naturally. Give the requested example, simplification, or detail without restarting the lesson or repeating the previous answer.
- Before returning, silently remove redundant headings, repeated conclusions, unsolicited practice, and any forbidden section listed above.
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
