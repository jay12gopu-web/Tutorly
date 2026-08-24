from __future__ import annotations

import asyncio
import copy
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.chatbot.ai.groq import GroqProvider, load_structured_response_json, normalize_transcription_language
from backend.chatbot.ai.provider import AIProvider, ProviderFailure
from backend.chatbot.ai.semantic_router import (
    ANSWER_GENERATION_PROMPT,
    SemanticTutorOutput,
    SemanticTutorService,
    clean_spoken_answer,
    clean_student_answer,
)
from backend.chatbot.orchestrator import ChatbotOrchestrator
from backend.chatbot.rate_limit import SlidingWindowRateLimiter
from backend.chatbot.schemas import ChatbotRequest, LearnerProfile, ResponseStage, StreamEvent


def semantic_output(
    *,
    subject: str,
    topic: str,
    intent: str,
    response_type: str,
    answer_format: str,
    response_length: str,
    answer: str,
    visual_type: str = "none",
    visual_reason: str = "No visual is needed for this answer.",
    visual_title: str = "",
    visual_elements: list[str] | None = None,
    visual_placement: str = "after_answer",
    calculator: bool = False,
    graph_engine: bool = False,
    geometry_renderer: bool = False,
    diagram_renderer: bool = False,
    code_runner: bool = False,
    spoken_answer: str = "",
) -> dict:
    visual_needed = visual_type != "none"
    return {
        "classification": {
            "subject": subject,
            "topic": topic,
            "intent": intent,
            "difficulty": "grade_9",
            "response_type": response_type,
            "answer_format": answer_format,
            "response_length": response_length,
            "visual": {
                "needed": visual_needed,
                "type": visual_type,
                "reason": visual_reason,
                "title": visual_title,
                "elements": visual_elements or [],
                "placement": visual_placement,
            },
            "tools": {
                "calculator": calculator,
                "graph_engine": graph_engine,
                "geometry_renderer": geometry_renderer,
                "diagram_renderer": diagram_renderer,
                "web_search": False,
                "code_runner": code_runner,
            },
            "confidence": 0.94,
        },
        "answer": answer,
        "spoken_answer": spoken_answer,
    }


class FakeSemanticProvider(AIProvider):
    def __init__(self, responses: dict[str, dict]) -> None:
        self.responses = responses
        self.calls: list[dict] = []

    @property
    def name(self) -> str:
        return "fake-semantic"

    @property
    def model(self) -> str:
        return "semantic-test-model"

    @property
    def configured(self) -> bool:
        return True

    async def complete_structured(self, *, messages, schema, schema_name):
        payload = json.loads(messages[-1]["content"])
        self.calls.append(payload)
        question = payload["student_question"]
        if question not in self.responses:
            raise AssertionError(f"No semantic fixture for: {question}")
        return copy.deepcopy(self.responses[question])


class InvalidSchemaProvider(FakeSemanticProvider):
    async def complete_structured(self, *, messages, schema, schema_name):
        return {"classification": {"subject": "not-a-subject"}, "answer": ""}


class MissingMetadataProvider(FakeSemanticProvider):
    async def complete_structured(self, *, messages, schema, schema_name):
        return {
            "classification": {"subject": "physics"},
            "answer": "Useful text with $v_y=u_y-gt$ survives missing optional metadata.",
        }


class FailedProvider(FakeSemanticProvider):
    async def complete_structured(self, *, messages, schema, schema_name):
        raise ProviderFailure("timeout")


class RateLimitedProvider(FakeSemanticProvider):
    async def complete_structured(self, *, messages, schema, schema_name):
        raise ProviderFailure("rate_limited", retry_after_seconds=60)


def fixtures() -> dict[str, dict]:
    return {
        "Explain projectile motion for an 11th-grade student. Include the main equations, one worked example, a small comparison table, and a diagram.": semantic_output(
            subject="physics", topic="projectile motion", intent="concept_explanation",
            response_type="worked_solution", answer_format="physics_numerical", response_length="detailed",
            visual_type="motion_graph", visual_title="Projectile path",
            visual_reason="A trajectory diagram connects horizontal and vertical motion.",
            visual_elements=["launch", "rising", "maximum height", "falling"],
            visual_placement="before_steps", calculator=True, diagram_renderer=True,
            answer=(
                "# Projectile motion\n\n"
                "A projectile has constant horizontal velocity and vertical acceleration $-g$.\n\n"
                "$$x=u\\cos(\\theta)t$$\n"
                "$$y=u\\sin(\\theta)t-\\frac{1}{2}gt^2$$\n\n"
                "## Worked example\n\n"
                "For $u=20\\,\\text{m/s}$ and $\\theta=30^\\circ$, "
                "$u_y=20\\sin(30^\\circ)=10\\,\\text{m/s}$.\n\n"
                "| Component | Acceleration |\n|---|---|\n| Horizontal | $0$ |\n| Vertical | $-g$ |\n\n"
                "```mermaid\nflowchart LR\nA[Launch] --> B[Projectile rises]\n"
                "B --> C[Maximum height]\nC --> D[Projectile falls]\n```"
            ),
        ),
        "Why does the powerhouse of a cell need oxygen?": semantic_output(
            subject="biology", topic="mitochondria and cellular respiration", intent="why_question",
            response_type="explanation", answer_format="why_explanation", response_length="medium",
            visual_type="cell_diagram", visual_title="Mitochondrion and oxygen use",
            visual_reason="A labeled cell visual connects the indirect description to mitochondria.",
            visual_elements=["oxygen", "mitochondrion", "glucose", "ATP"], visual_placement="after_intro",
            diagram_renderer=True,
            answer="## Why mitochondria need oxygen\n\n💡 **Short answer:** Oxygen helps cells release usable energy from food.\n\n🧠 **Why this happens**\n\n1. Glucose is broken down.\n2. Oxygen supports the final stages of respiration.\n3. The mitochondrion produces ATP for cell activities.\n\n✨ **In short:** Oxygen lets mitochondria make energy efficiently.",
        ),
        "Why do I move forward when a bus suddenly stops?": semantic_output(
            subject="physics", topic="inertia", intent="why_question", response_type="explanation",
            answer_format="why_explanation", response_length="short",
            answer="## Inertia\n\n💡 **Short answer:** Your body keeps moving forward for a moment when the bus stops.\n\n⚙️ **What’s happening**\n\nThe bus slows suddenly, but your moving body tends to keep its motion. This tendency is **inertia**, described by Newton’s first law.\n\n✨ **In short:** The bus stops before your body does.",
        ),
        "Why does salt seem to disappear in water?": semantic_output(
            subject="chemistry", topic="dissolution and solutions", intent="why_question",
            response_type="explanation", answer_format="why_explanation", response_length="short",
            visual_type="particle_diagram", visual_title="Salt dissolving in water",
            visual_reason="A particle view makes invisible dissolved ions easier to understand.",
            visual_elements=["salt crystal", "water molecules", "sodium ions", "chloride ions"],
            visual_placement="after_intro", diagram_renderer=True,
            answer="## Salt dissolving in water\n\n💡 **Short answer:** The salt does not vanish; its particles spread through the water.\n\n⚗️ Water pulls sodium and chloride ions away from the crystal and surrounds them. They become too small and spread out to see.\n\n✨ **In short:** Dissolved salt is still present in the solution.",
        ),
        "Show me what happens to y when x increases in y = 2x + 3": semantic_output(
            subject="mathematics", topic="linear function y = 2x + 3", intent="graph_request",
            response_type="analysis", answer_format="math_graph", response_length="medium",
            visual_type="graph", visual_title="Graph of y = 2x + 3",
            visual_reason="A graph directly shows the constant rate of change.",
            visual_elements=["x-axis", "y-axis", "y-intercept 3", "slope 2"],
            visual_placement="before_summary", graph_engine=True,
            answer="## y = 2x + 3\n\n📌 **Equation**\n\n`y = 2x + 3`\n\n🧠 Each increase of 1 in `x` increases `y` by 2. The line crosses the y-axis at 3.\n\n🔍 **What we can observe**\n\n- Slope: `2`\n- y-intercept: `3`",
        ),
        "Why does the poet describe the night as a blanket?": semantic_output(
            subject="english", topic="metaphor in poetry", intent="poetry_analysis", response_type="analysis",
            answer_format="english_literature", response_length="short",
            answer="## The night as a blanket\n\n📖 **Meaning:** The poet presents darkness as something that covers everything.\n\n🔍 **Analysis:** The metaphor can suggest warmth and safety, or heaviness and confinement, depending on the poem’s context.\n\n💭 **Effect:** It turns an abstract idea—night—into an image the reader can feel.\n\n✨ **In short:** The comparison makes the night feel surrounding and physical.",
        ),
        "Why were people in France angry before the revolution?": semantic_output(
            subject="history", topic="causes of the French Revolution", intent="why_question",
            response_type="explanation", answer_format="history_causes", response_length="medium",
            visual_type="cause_effect_diagram", visual_title="Causes of the French Revolution",
            visual_reason="A cause-and-effect view connects several pressures without implying location matters.",
            visual_elements=["inequality", "tax burden", "food shortages", "debt", "revolution"],
            visual_placement="before_summary", diagram_renderer=True,
            answer="## Main causes\n\n1. Ordinary people carried much of the tax burden.\n2. Nobles and clergy had privileges.\n3. Bread prices rose and food was scarce.\n4. Government debt and weak leadership deepened the crisis.\n\n## What happened because of them\n\nPublic anger grew into demands for political and social change.",
        ),
        "Why does one side of a mountain get more rain than the other?": semantic_output(
            subject="geography", topic="orographic rainfall and rain shadow", intent="why_question",
            response_type="explanation", answer_format="geography_explanation", response_length="medium",
            visual_type="cross_section", visual_title="Mountain rainfall and rain shadow",
            visual_reason="A cross-section clearly shows rising wet air and descending dry air.",
            visual_elements=["moist wind", "windward slope", "cooling", "rain", "leeward rain shadow"],
            visual_placement="before_summary", diagram_renderer=True,
            answer="## Mountain rainfall\n\n🌍 Moist air is forced up the **windward** side of the mountain.\n\n1. Rising air expands and cools.\n2. Water vapour condenses and rain falls.\n3. The air descends on the **leeward** side, warms, and becomes drier.\n\n✨ **In short:** The windward side is wetter; the leeward side lies in a rain shadow.",
        ),
        "How does an idea finally become a law?": semantic_output(
            subject="civics", topic="legislative process", intent="how_question", response_type="step_by_step",
            answer_format="civics_process", response_length="medium", visual_type="flowchart",
            visual_title="How a bill becomes law", visual_reason="The legislative process is an ordered flow.",
            visual_elements=["idea", "bill", "debate", "vote", "approval", "law"],
            visual_placement="before_steps", diagram_renderer=True,
            answer="## How a bill becomes law\n\n🏛️ An idea is written as a bill and considered by the legislature.\n\n1. A bill is introduced.\n2. Members debate and may amend it.\n3. The required chambers vote.\n4. The head of state gives the required approval.\n\n🔑 The exact stages vary by country, but debate, voting, and formal approval are central.",
        ),
        "Why does my loop never stop?": semantic_output(
            subject="computer_science", topic="infinite loop debugging", intent="debugging",
            response_type="debugging", answer_format="debugging", response_length="medium", code_runner=True,
            answer="## 🐞 Problem\n\nThe loop condition never becomes false.\n\n## 🔧 Fix\n\nUpdate the value checked by the condition, or add the correct exit case.\n\n```python\ncount = 0\nwhile count < 5:\n    print(count)\n    count += 1\n```\n\n💡 **What changed:** `count` now increases on every pass.",
        ),
        "The current character is angry because he feels powerless. Explain.": semantic_output(
            subject="english", topic="character motivation and emotional conflict", intent="analyze",
            response_type="analysis", answer_format="english_literature", response_length="short",
            answer="📖 The character’s anger is likely a response to having little control. Feeling powerless can turn fear, frustration, or humiliation into anger. The words describe an emotional conflict—not an electrical or physical concept.",
        ),
        "What is the SI unit of force?": semantic_output(
            subject="physics", topic="SI unit of force", intent="definition", response_type="direct_answer",
            answer_format="direct_answer", response_length="very_short",
            answer="The SI unit of force is the **newton (N)**.",
        ),
        "What do mitochondria do?": semantic_output(
            subject="biology", topic="mitochondrial function", intent="concept_explanation",
            response_type="explanation", answer_format="biology_structure", response_length="short",
            visual_type="cell_diagram", visual_title="Mitochondrion",
            visual_reason="A small labeled diagram connects structure with energy production.",
            visual_elements=["outer membrane", "inner membrane", "cristae", "matrix", "ATP"],
            visual_placement="after_intro", diagram_renderer=True,
            answer="## Mitochondria\n\n💡 **What they are:** Structures inside most cells that release usable energy from food.\n\n🔬 **Main function:** They produce **ATP**, the cell’s main energy carrier, through cellular respiration.\n\n🔑 Their folded inner membrane gives more space for energy-releasing reactions.\n\n✨ **Remember:** Mitochondria turn energy in food into a form cells can use.",
        ),
        "Solve 4x + 3 = 19.": semantic_output(
            subject="mathematics", topic="linear equation", intent="solve_equation",
            response_type="worked_solution", answer_format="math_worked_solution", response_length="short",
            calculator=True,
            answer="## ✏️ Solution\n\n**Idea:** Isolate `x`.\n\n`4x + 3 = 19`\n\n**Step 1:** Subtract 3 from both sides.\n\n`4x = 16`\n\n**Step 2:** Divide both sides by 4.\n\n`x = 4`\n\n## ✅ Answer\n\n**x = 4**",
        ),
        "What is sublimation?": semantic_output(
            subject="chemistry", topic="sublimation", intent="definition", response_type="explanation",
            answer_format="concept_explanation", response_length="short", visual_type="process_diagram",
            visual_title="Sublimation", visual_reason="The direct solid-to-gas change is clearer as a process.",
            visual_elements=["solid", "heat absorbed", "gas", "liquid state skipped"],
            visual_placement="before_summary", diagram_renderer=True,
            answer="## Sublimation\n\n💡 A solid changes directly into a gas without becoming a liquid first.\n\n🔑 **Key points**\n\n- The liquid state is skipped.\n- Heat gives particles enough energy to escape the solid.\n\n🌍 **Examples:** Dry ice and mothballs; dye-sublimation is also used in printing.\n\n✨ **Remember:** solid → gas directly.",
        ),
        "Why did the French Revolution begin?": semantic_output(
            subject="history", topic="causes of the French Revolution", intent="why_question",
            response_type="explanation", answer_format="history_causes", response_length="medium",
            answer="## Main causes\n\n1. Deep inequality between social estates\n2. Heavy taxes on ordinary people\n3. Food shortages and rising bread prices\n4. Government debt and weak leadership\n5. New ideas about liberty and equality\n\n## What followed\n\nThese pressures turned public anger into a political revolution beginning in 1789.",
        ),
        "Difference between speed and velocity.": semantic_output(
            subject="physics", topic="speed and velocity", intent="compare", response_type="comparison",
            answer_format="comparison_table", response_length="short",
            answer="| Feature | Speed | Velocity |\n|---|---|---|\n| Meaning | Distance travelled per unit time | Displacement per unit time |\n| Type | Scalar | Vector |\n| Direction | Not included | Included |\n\n✨ **Main difference:** Velocity has direction; speed does not.",
        ),
        "What is photosynthesis?": semantic_output(
            subject="biology", topic="photosynthesis", intent="definition", response_type="explanation",
            answer_format="biology_process", response_length="short", visual_type="process_diagram",
            visual_title="Photosynthesis", visual_reason="Inputs and outputs form a useful process sequence.",
            visual_elements=["sunlight", "water", "carbon dioxide", "glucose", "oxygen"],
            visual_placement="before_steps", diagram_renderer=True,
            answer="## Photosynthesis\n\nPlants use light energy to make glucose from water and carbon dioxide, releasing oxygen.\n\n🔑 **Key idea:** Light energy becomes stored chemical energy in glucose.",
        ),
        "Explain it more simply.": semantic_output(
            subject="biology", topic="photosynthesis", intent="concept_explanation", response_type="explanation",
            answer_format="concept_explanation", response_length="very_short",
            answer="Plants use sunlight to make their food. They take in water and carbon dioxide, make sugar, and release oxygen.",
        ),
        "What's wrong with this sentence: \"She don't like apples\"?": semantic_output(
            subject="english", topic="subject-verb agreement", intent="grammar_help",
            response_type="explanation", answer_format="english_grammar", response_length="short",
            answer="**She doesn't like apples.**\n\nAlmost — **she** is singular, so the helping verb changes from **don't** to **doesn't**.",
        ),
        "Write a short speech about protecting the environment for a school assembly.": semantic_output(
            subject="english", topic="school assembly speech", intent="writing_help",
            response_type="writing", answer_format="writing_help", response_length="medium",
            answer="```writing\nTITLE: Protecting Our Environment\nGood morning, everyone. Protecting our planet starts with small choices we make each day.\n```",
        ),
    }


async def run_semantic_and_format_tests() -> None:
    provider = FakeSemanticProvider(fixtures())
    orchestrator = ChatbotOrchestrator(SemanticTutorService(provider))

    routing_cases = {
        "Why does the powerhouse of a cell need oxygen?": ("biology", "mitochondria"),
        "Why do I move forward when a bus suddenly stops?": ("physics", "inertia"),
        "Why does salt seem to disappear in water?": ("chemistry", "dissolution"),
        "Show me what happens to y when x increases in y = 2x + 3": ("mathematics", "linear"),
        "Why does the poet describe the night as a blanket?": ("english", "metaphor"),
        "Why were people in France angry before the revolution?": ("history", "French Revolution"),
        "Why does one side of a mountain get more rain than the other?": ("geography", "rain"),
        "How does an idea finally become a law?": ("civics", "legislative"),
        "Why does my loop never stop?": ("computer_science", "infinite loop"),
        "The current character is angry because he feels powerless. Explain.": ("english", "character"),
    }
    for index, (question, expected) in enumerate(routing_cases.items()):
        calls_before = len(provider.calls)
        response = await orchestrator.respond(ChatbotRequest(
            user_id="routing-test",
            conversation_id=f"route-{index}",
            message=question,
            profile=LearnerProfile(user_id="routing-test", grade="grade_9"),
        ))
        route = response.metadata["semantic_route"]
        assert route["subject"] == expected[0], (question, route)
        assert expected[1].lower() in route["topic"].lower(), (question, route)
        assert len(provider.calls) == calls_before + 1, "each answer should use exactly one LLM call"
        assert route["answer_format"] and route["response_length"]
        assert "subject:" not in response.answer.lower()

    projectile_prompt = (
        "Explain projectile motion for an 11th-grade student. Include the main equations, "
        "one worked example, a small comparison table, and a diagram."
    )
    projectile = await orchestrator.respond(ChatbotRequest(
        user_id="projectile-test",
        conversation_id="projectile-rich-response",
        message=projectile_prompt,
        profile=LearnerProfile(user_id="projectile-test", grade="grade_11"),
    ))
    assert projectile.subject.value == "physics"
    assert projectile.metadata["generation"]["status"] == "generated"
    assert "\\frac{1}{2}" in projectile.answer
    assert "| Component | Acceleration |" in projectile.answer
    assert "```mermaid" in projectile.answer
    assert SemanticTutorService.FRIENDLY_ERROR not in projectile.answer

    stream_events = []
    async for event in orchestrator.stream(ChatbotRequest(
        user_id="projectile-stream-test",
        conversation_id="projectile-rich-stream",
        message=projectile_prompt,
        profile=LearnerProfile(user_id="projectile-stream-test", grade="grade_11"),
    )):
        stream_events.append(event)
    streamed_answer = "".join(event.delta for event in stream_events)
    assert streamed_answer == stream_events[-1].payload["answer"]
    assert stream_events[-1].done is True
    assert SemanticTutorService.FRIENDLY_ERROR not in streamed_answer

    formatting_questions = [
        "What is the SI unit of force?",
        "What do mitochondria do?",
        "Solve 4x + 3 = 19.",
        "Why do I move forward when a bus suddenly stops?",
        "What is sublimation?",
        "Why does the poet describe the night as a blanket?",
        "Why did the French Revolution begin?",
        "Why does one side of a mountain get more rain than the other?",
        "Difference between speed and velocity.",
    ]
    formatted = {}
    for index, question in enumerate(formatting_questions):
        response = await orchestrator.respond(ChatbotRequest(
            user_id="format-test",
            conversation_id=f"format-{index}",
            message=question,
        ))
        formatted[question] = response

    fact = formatted["What is the SI unit of force?"]
    assert fact.response_length == "very_short"
    assert len(fact.answer.split()) <= 15
    assert fact.answer == "The SI unit of force is the **newton (N)**."
    assert fact.study_resources == []
    assert "Step 1" in formatted["Solve 4x + 3 = 19."].answer
    assert "**x = 4**" in formatted["Solve 4x + 3 = 19."].answer
    assert "| Feature | Speed | Velocity |" in formatted["Difference between speed and velocity."].answer
    assert formatted["What do mitochondria do?"].visual["placement"] == "after_intro"
    assert formatted["Why does one side of a mountain get more rain than the other?"].visual["needed"] is True

    grammar = await orchestrator.respond(ChatbotRequest(
        user_id="english-test",
        conversation_id="english-grammar",
        message='What\'s wrong with this sentence: "She don\'t like apples"?',
        client_context={"voice_mode": True, "voice_language": "en-US"},
    ))
    assert grammar.subject.value == "english"
    assert "She doesn't like apples" in grammar.answer
    assert "subject-verb agreement" in grammar.topic
    assert provider.calls[-1]["delivery_context"] == {"voice_mode": True, "voice_language": "en-US"}

    writing = await orchestrator.respond(ChatbotRequest(
        user_id="english-test",
        conversation_id="english-writing",
        message="Write a short speech about protecting the environment for a school assembly.",
    ))
    assert writing.subject.value == "english"
    assert "```writing" in writing.answer
    assert "TITLE: Protecting Our Environment" in writing.answer

    followup_id = "photosynthesis-followup"
    first = await orchestrator.respond(ChatbotRequest(
        user_id="followup-test", conversation_id=followup_id, message="What is photosynthesis?"
    ))
    second = await orchestrator.respond(ChatbotRequest(
        user_id="followup-test", conversation_id=followup_id, message="Explain it more simply."
    ))
    assert first.answer != second.answer
    assert second.topic == "photosynthesis"
    latest_context = provider.calls[-1]["conversation_context"]
    assert any("photosynthesis" in turn["content"].lower() for turn in latest_context)
    assert len(second.answer.split()) < len(first.answer.split())


async def run_error_tests() -> None:
    invalid = SemanticTutorService(InvalidSchemaProvider({}))
    invalid_result = await invalid.route_and_answer(
        student_question="Explain something",
        conversation_context=[],
        profile=LearnerProfile(),
        mode="prime",
    )
    assert invalid_result.status == "invalid_schema"
    assert invalid_result.output.classification.subject.value == "general"
    assert invalid_result.output.classification.visual.needed is False
    assert invalid_result.output.answer == SemanticTutorService.FRIENDLY_ERROR

    degraded = SemanticTutorService(MissingMetadataProvider({}))
    degraded_result = await degraded.route_and_answer(
        student_question="Explain a physics idea",
        conversation_context=[],
        profile=LearnerProfile(),
        mode="prime",
    )
    assert degraded_result.status == "generated_degraded"
    assert degraded_result.output.classification.subject.value == "general"
    assert "Useful text" in degraded_result.output.answer
    assert degraded_result.output.answer != SemanticTutorService.FRIENDLY_ERROR

    failed = SemanticTutorService(FailedProvider({}))
    failed_result = await failed.route_and_answer(
        student_question="Explain something",
        conversation_context=[],
        profile=LearnerProfile(),
        mode="prime",
    )
    assert failed_result.status == "timeout"
    assert failed_result.output.answer == SemanticTutorService.FRIENDLY_ERROR

    rate_limited = SemanticTutorService(RateLimitedProvider({}))
    rate_limited_result = await rate_limited.route_and_answer(
        student_question="Explain something",
        conversation_context=[],
        profile=LearnerProfile(),
        mode="prime",
    )
    assert rate_limited_result.status == "rate_limited"
    assert rate_limited_result.retry_after_seconds == 60
    assert rate_limited_result.output.answer == SemanticTutorService.RATE_LIMIT_ERROR
    assert rate_limited_result.output.answer != SemanticTutorService.FRIENDLY_ERROR


def run_schema_security_and_limit_tests() -> None:
    schema = SemanticTutorOutput.model_json_schema()
    assert schema["additionalProperties"] is False
    assert "spoken_answer" in schema["required"]
    classification = schema["$defs"]["SemanticClassification"]
    assert classification["additionalProperties"] is False
    for field in (
        "subject", "topic", "intent", "difficulty", "response_type", "answer_format",
        "response_length", "visual", "tools", "confidence",
    ):
        assert field in classification["required"]

    assert GroqProvider.DEFAULT_MODEL == "openai/gpt-oss-120b"

    inline_latex = (
        r"Inline $\frac{-8}{2\cdot2}$, $\boxed{x=2}$, and $\sqrt{16}$."
    )
    underescaped_inline_json = (
        r'{"answer":"Inline $\frac{-8}{2\cdot2}$, $\boxed{x=2}$, and $\sqrt{16}$."}'
    )
    assert load_structured_response_json(underescaped_inline_json)["answer"] == inline_latex

    delimiter_free_latex = (
        r"Commands remain literal: \frac{1}{2}, \text{m/s}, \theta, "
        r"and \boxed{x=2}."
    )
    underescaped_delimiter_free_json = (
        r'{"answer":"Commands remain literal: \frac{1}{2}, \text{m/s}, \theta, '
        r'and \boxed{x=2}."}'
    )
    assert (
        load_structured_response_json(underescaped_delimiter_free_json)["answer"]
        == delimiter_free_latex
    )

    already_decoded_controls_json = (
        '{"answer":"Decoded controls: '
        + "\f" + "rac{1}{2}, "
        + "\t" + "ext{m/s}, and "
        + "\t" + "heta." + '"}'
    )
    assert load_structured_response_json(already_decoded_controls_json)["answer"] == (
        r"Decoded controls: \frac{1}{2}, \text{m/s}, and \theta."
    )

    alternate_delimiters = (
        r"Inline \(\theta=30^\circ\) and display \[\nabla f=0\]."
    )
    underescaped_alternate_json = (
        r'{"answer":"Inline \(\theta=30^\circ\) and display \[\nabla f=0\]."}'
    )
    assert load_structured_response_json(underescaped_alternate_json)["answer"] == alternate_delimiters

    ordinary_json_line_break = r'{"answer":"Line one\nNext line."}'
    assert load_structured_response_json(ordinary_json_line_break)["answer"] == "Line one\nNext line."

    multiplication_spacing = r"$$x(t)=v_{0x}\,t$$"
    underescaped_spacing_json = r'{"answer":"$$x(t)=v_{0x}\,t$$"}'
    assert load_structured_response_json(underescaped_spacing_json)["answer"] == multiplication_spacing
    assert "v_{0x},t" not in multiplication_spacing

    display_latex = (
        "$$\\sqrt{16}=4$$\n"
        "$$\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}$$"
    )
    underescaped_display_json = (
        r'{"answer":"$$\sqrt{16}=4$$\n$$\begin{bmatrix}1 & 2 \\\\ 3 & 4\end{bmatrix}$$"}'
    )
    assert load_structured_response_json(underescaped_display_json)["answer"] == display_latex
    assert load_structured_response_json(json.dumps({"answer": display_latex}))["answer"] == display_latex
    assert clean_student_answer(display_latex) == display_latex

    multiline_rich_answer = (
        "Explanation with $v_y=u_y-gt$.\n\n"
        "| Part | Motion |\n|---|---|\n| Horizontal | Constant velocity |\n\n"
        "```mermaid\nflowchart LR\nA[Launch] --> B[Flight]\n```"
    )
    raw_multiline_json = '{"answer":"' + multiline_rich_answer + '"}'
    assert load_structured_response_json(raw_multiline_json)["answer"] == multiline_rich_answer

    streamed_latex = "\n".join((
        inline_latex,
        display_latex,
        delimiter_free_latex,
        alternate_delimiters,
        multiplication_spacing,
    ))
    chunks = ChatbotOrchestrator._chunk_answer(streamed_latex, size=7)
    assert "".join(chunks) == streamed_latex
    transported_chunks = [
        json.loads(StreamEvent(
            stage=ResponseStage.final,
            message="Writing answer...",
            delta=chunk,
        ).model_dump_json())["delta"]
        for chunk in chunks
    ]
    assert "".join(transported_chunks) == streamed_latex

    cleaned = clean_student_answer(
        "## Working\n\nSubtract 3 from both sides.\n\n"
        "### Final Answer\n\n**Final answer: x = 4**\n\n"
        "### Common Mistakes\nDo not change only one side.\n\n"
        "### Practice Question\nSolve x + 2 = 7."
    )
    assert "Final Answer" not in cleaned
    assert "Common Mistakes" not in cleaned
    assert "Practice Question" not in cleaned
    assert "x = 4" in cleaned
    assert "smallest useful number of sections" in ANSWER_GENERATION_PROMPT
    assert "Never append a practice problem" in ANSWER_GENERATION_PROMPT
    assert "smart, patient study friend" in ANSWER_GENERATION_PROMPT
    assert "not a formal teacher" in ANSWER_GENERATION_PROMPT
    assert "simplify or switch examples/analogies" in ANSWER_GENERATION_PROMPT
    assert "Correct mistakes casually" in ANSWER_GENERATION_PROMPT
    assert "Ask one short clarifying question only" in ANSWER_GENERATION_PROMPT
    assert "JSON-escape every literal backslash" in ANSWER_GENERATION_PROMPT
    assert "Never use a comma as multiplication" in ANSWER_GENERATION_PROMPT
    assert "Never invent image URLs" in ANSWER_GENERATION_PROMPT
    assert "grammar correction" in ANSWER_GENERATION_PROMPT
    assert "fenced `writing` block" in ANSWER_GENERATION_PROMPT
    assert "delivery_context.voice_mode" in ANSWER_GENERATION_PROMPT
    assert clean_spoken_answer("## Idea\nUse **inertia**.\n```mermaid\nA-->B\n```") == "Idea Use inertia ."
    assert normalize_transcription_language("English") == "en"
    assert normalize_transcription_language("te-IN") == "te"
    limiter = SlidingWindowRateLimiter(requests_per_minute=3, requests_per_hour=20)
    assert limiter.check("student:chat").allowed
    assert limiter.check("student:chat").allowed
    assert limiter.check("student:chat").allowed
    denied = limiter.check("student:chat")
    assert denied.allowed is False and denied.retry_after_seconds > 0

    frontend_files = list((ROOT / "js").rglob("*.js")) + list(ROOT.glob("*.html"))
    frontend_text = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in frontend_files)
    assert "GROQ_API_KEY" not in frontend_text
    assert "api.groq.com" not in frontend_text.lower()

    page = (ROOT / "maths_gpt.html").read_text(encoding="utf-8")
    for disabled_script in (
        "adaptive-intelligence.js", "response-engine.js", "gpt.js", "response-contract.js",
        "math-response-contract.js", "advanced-math-engine.js", "english-engine.js",
    ):
        assert f'<script src="js/chatbot/{disabled_script}">' not in page
        assert f'<script src="js/{disabled_script}">' not in page


def main() -> None:
    run_schema_security_and_limit_tests()
    asyncio.run(run_semantic_and_format_tests())
    asyncio.run(run_error_tests())
    print("Tutorly semantic routing, adaptive formatting, context, security, and error tests passed.")


if __name__ == "__main__":
    main()
