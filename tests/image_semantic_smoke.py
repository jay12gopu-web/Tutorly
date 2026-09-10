"""Offline image-action regressions: routing output, rich text, and SSE coexist.

The model boundary is mocked deliberately. These tests verify that validated
semantic decisions drive tools, not the words in a student's question; they do
not claim to measure the live model's illustration-selection accuracy.
"""
from __future__ import annotations

import asyncio
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chatbot_backend_smoke import FakeSemanticProvider, semantic_output
from backend.chatbot.ai.semantic_router import SemanticTutorService
from backend.chatbot.orchestrator import ChatbotOrchestrator
from backend.chatbot.premium_credits import EDUCATIONAL_IMAGE_CREDIT_COST
from backend.chatbot.schemas import ChatbotRequest, ConversationTurn, LearnerProfile


VOLCANO_QUESTION = "Generate an illustration showing how a volcano erupts"
RICH_ANSWER = (
    "Magma rises as expanding gas pushes it toward the surface.\n\n"
    "Pressure is force per area: $P=\\frac{F}{A}$.\n\n"
    "| Material | Location |\n|---|---|\n| Magma | Underground |\n| Lava | Surface |"
)


def illustration_payload(*, explicit: bool = True) -> dict:
    output = semantic_output(
        subject="geography", topic="volcanic eruption", intent="diagram_request",
        response_type="explanation", answer_format="geography_explanation",
        response_length="short", answer=RICH_ANSWER,
        visual_type="educational_illustration", visual_title="A volcanic eruption",
        visual_reason="An illustrative landscape makes the event easier to imagine.",
        visual_elements=["magma chamber", "vent", "lava", "ash cloud"],
    )
    output["classification"]["visual"].update(
        generation_prompt=(
            "An uncluttered educational illustration of an erupting stratovolcano, "
            "with a clearly distinguished below-ground magma chamber, rising vent, "
            "surface lava flow and airborne ash cloud; suitable for Grade 9."
        ),
        image_style="clean_educational", aspect_ratio="landscape",
        explicit_image_request=explicit,
    )
    output["classification"]["tools"]["image_generator"] = True
    return output


async def test_actions_and_streaming() -> None:
    photosynthesis = semantic_output(
        subject="biology", topic="photosynthesis", intent="concept_explanation",
        response_type="explanation", answer_format="biology_process", response_length="short",
        visual_type="process_diagram", diagram_renderer=True,
        answer="Plants use light to turn water and carbon dioxide into sugars.\n\n"
               "```mermaid\nflowchart LR\nA[Light and water] --> B[Photosynthesis]\n```",
    )
    arithmetic = semantic_output(
        subject="mathematics", topic="multiplication", intent="numerical_problem",
        response_type="direct_answer", answer_format="direct_answer", response_length="very_short",
        answer="8 × 7 = **56**.", calculator=True,
    )
    fixture_by_question = {
        "Explain photosynthesis": photosynthesis,
        "What is 8 × 7?": arithmetic,
        VOLCANO_QUESTION: illustration_payload(),
        "Explain a volcanic landscape": illustration_payload(explicit=False),
        "Yes, please make that picture": illustration_payload(),
    }
    provider = FakeSemanticProvider(fixture_by_question)
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    for question in ("Explain photosynthesis", "What is 8 × 7?"):
        result = await tutor.respond(ChatbotRequest(message=question))
        assert result.metadata["image_generation"] == {"requested": False}
        assert not any(call.name == "image_generator" for call in result.tool_calls)
    assert len(provider.calls) == 2

    events = [event async for event in tutor.stream(ChatbotRequest(message=VOLCANO_QUESTION))]
    final = events[-1].payload
    action = final["metadata"]["image_generation"]
    assert "".join(event.delta or "" for event in events) == RICH_ANSWER
    assert events[-1].done is True and len(provider.calls) == 3
    assert action["requested"] is True and action["explicit_request"] is True
    assert action["credit_cost"] == EDUCATIONAL_IMAGE_CREDIT_COST
    assert action["action"] == "educationalImage"
    assert action["visual_type"] == "educational_illustration"
    assert action["description"].startswith("An uncluttered educational illustration")
    assert action["required_labels"] == ["magma chamber", "vent", "lava", "ash cloud"]
    assert final["answer"] == RICH_ANSWER
    assert not any("url" in key for key in action)
    assert final["tool_calls"][0]["output"]["status"] == "awaiting_secure_generation"

    result = await tutor.respond(ChatbotRequest(message="Explain a volcanic landscape"))
    assert result.metadata["image_generation"]["requested"] is True
    assert result.metadata["image_generation"]["explicit_request"] is False
    result = await tutor.respond(ChatbotRequest(
        message="Yes, please make that picture",
        history=[ConversationTurn(role="assistant", content="Would an eruption illustration help?")],
    ))
    assert result.metadata["image_generation"]["explicit_request"] is True
    assert provider.calls[-1]["conversation_context"][-1]["content"] == "Would an eruption illustration help?"
    assert len(provider.calls) == 5, "Image actions must not add a second text-model request"


async def test_optional_image_failures_preserve_text() -> None:
    mutations = [
        ("visual", "generation_prompt", None),
        ("visual", "generation_prompt", {"prompt": "unexpected object"}),
        ("visual", "generation_prompt", "x" * 1801),
        ("visual", "image_style", "unsupported"),
        ("visual", "image_style", ["clean_educational"]),
        ("visual", "aspect_ratio", {"width": 1024}),
        ("visual", "aspect_ratio", "panorama"),
        ("visual", "explicit_image_request", "yes"),
        ("tools", "image_generator", "true"),
        ("tools", "image_generator", 1),
    ]
    for branch, field, value in mutations:
        payload = illustration_payload()
        payload["classification"][branch][field] = value
        provider = FakeSemanticProvider({VOLCANO_QUESTION: payload})
        tutor = ChatbotOrchestrator(SemanticTutorService(provider))
        response = await tutor.respond(ChatbotRequest(message=VOLCANO_QUESTION))
        assert response.answer == RICH_ANSWER, (branch, field)
        assert response.subject.value == "geography", (branch, field)
        assert response.metadata["generation"]["status"] == "generated", (branch, field)
        assert response.metadata["image_generation"] == {"requested": False}, (branch, field)
        assert response.visual["needed"] is False
        assert len(provider.calls) == 1

    missing = illustration_payload()
    for field in ("generation_prompt", "image_style", "aspect_ratio", "explicit_image_request"):
        missing["classification"]["visual"].pop(field)
    missing["classification"]["tools"].pop("image_generator")
    service = SemanticTutorService(FakeSemanticProvider({VOLCANO_QUESTION: missing}))
    result = await service.route_and_answer(
        student_question=VOLCANO_QUESTION, conversation_context=[], profile=LearnerProfile(), mode="prime",
    )
    assert result.status == "generated" and result.output.answer == RICH_ANSWER
    assert result.output.classification.subject.value == "geography"
    assert result.output.classification.tools.image_generator is False


async def test_tool_consistency() -> None:
    deterministic = illustration_payload()
    deterministic["classification"]["visual"]["type"] = "flowchart"
    deterministic["classification"]["tools"]["diagram_renderer"] = True
    service = SemanticTutorService(FakeSemanticProvider({"An arbitrary request": deterministic}))
    result = await service.route_and_answer(
        student_question="An arbitrary request", conversation_context=[], profile=LearnerProfile(), mode="prime",
    )
    assert result.output.classification.tools.image_generator is False
    assert result.output.classification.tools.diagram_renderer is True
    assert result.output.classification.visual.needed is True

    conflicting = illustration_payload()
    for field in ("graph_engine", "geometry_renderer", "diagram_renderer"):
        conflicting["classification"]["tools"][field] = True
    service = SemanticTutorService(FakeSemanticProvider({"An arbitrary request": conflicting}))
    result = await service.route_and_answer(
        student_question="An arbitrary request", conversation_context=[], profile=LearnerProfile(), mode="prime",
    )
    tools = result.output.classification.tools
    assert tools.image_generator is True
    assert not (tools.graph_engine or tools.geometry_renderer or tools.diagram_renderer)


def test_strict_provider_schema() -> None:
    schema = SemanticTutorService._provider_schema()

    def check(node):
        if isinstance(node, dict):
            assert "default" not in node
            if node.get("type") == "object":
                assert set(node["required"]) == set(node["properties"])
                assert node["additionalProperties"] is False
            for child in node.values():
                check(child)
        elif isinstance(node, list):
            for child in node:
                check(child)

    check(schema)
    assert "explicit_image_request" in schema["$defs"]["VisualDecision"]["required"]


def main() -> None:
    test_strict_provider_schema()
    asyncio.run(test_actions_and_streaming())
    asyncio.run(test_optional_image_failures_preserve_text())
    asyncio.run(test_tool_consistency())
    print("Image semantic action, old-payload compatibility, malformed-metadata, and SSE regressions passed (offline mocks).")


if __name__ == "__main__":
    main()
