"""Offline regressions for ordinary conversation beside adaptive tutoring.

Scripted provider decisions verify schema, delivery and state boundaries. They
do not measure a live model's classification accuracy or conversational quality,
and this file never calls an AI or search API.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chatbot_backend_smoke import FakeSemanticProvider, semantic_output
from backend.chatbot.ai.provider import ProviderFailure
from backend.chatbot.ai.semantic_router import SemanticTutorOutput, SemanticTutorService
from backend.chatbot.orchestrator import ChatbotOrchestrator
from backend.chatbot.schemas import ChatbotRequest, LearnerProfile


class RecordingProvider(FakeSemanticProvider):
    def __init__(self, responses):
        super().__init__(responses)
        self.system_prompts = []

    async def complete_structured(self, **kwargs):
        self.system_prompts.append(kwargs["messages"][0]["content"])
        return await super().complete_structured(**kwargs)


def conversation(answer, *, topic="casual conversation"):
    return semantic_output(
        subject="general", topic=topic, intent="conversation",
        response_type="direct_answer", answer_format="direct_answer",
        response_length="very_short", answer=answer,
    )


def academic(answer, *, signal="none", strategy="direct", relation="new"):
    result = semantic_output(
        subject="mathematics", topic="fractions", intent="concept_explanation",
        response_type="explanation", answer_format="concept_explanation",
        response_length="short", answer=answer,
    )
    result["teaching"] = {
        "signal": signal, "strategy": strategy, "topic_relation": relation,
        "requested_strategy": False, "visual_support": "none", "voice_support": "none",
    }
    return result


def request(message, **kwargs):
    value = ChatbotRequest(
        user_id="browser-supplied-user", conversation_id="conversation-regression",
        message=message, **kwargs,
    )
    value._session_owner = "test:conversation-owner"
    return value


def session(tutor):
    return tutor.teaching.snapshot("test:conversation-owner", "conversation-regression")


def no_tools(tool_names, message):
    assert tool_names == [], f"Unexpected tool request for {message!r}: {tool_names}"
    return []


def assert_conversation_response(result, expected_answer):
    assert result.metadata["generation"]["status"] == "generated"
    assert result.intent == "conversation"
    assert result.answer == expected_answer
    assert result.response_type == result.answer_format == "direct_answer"
    assert result.visual["needed"] is False
    assert result.visual["type"] == "none"
    assert not any(result.metadata["tools"].values())
    assert result.tool_calls == result.citations == result.study_resources == []
    assert result.metadata["teaching_actions"] == []
    assert result.metadata["quick_actions"] == []
    assert result.metadata["image_generation"] == {"requested": False}


async def test_everyday_conversation_delivery():
    cases = {
        "hi": "Hey!",
        "Thanks, that helped": "You're welcome!",
        "bye, see you later": "See you!",
        "I made the school team today!": "That's exciting! Your practice paid off.",
        "I had a really rough day": "I'm sorry today was rough. I'm here to listen.",
        "yo what's up": "Hey! Ready to chat.",
        "I'm just bored and feel like chatting": "Fair enough. We can just chat for a bit.",
    }
    provider = RecordingProvider({message: conversation(answer) for message, answer in cases.items()})
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    with patch.object(tutor.tools, "run_tools", side_effect=no_tools):
        for message, expected_answer in cases.items():
            result = await tutor.respond(request(message))
            assert_conversation_response(result, expected_answer)
            assert session(tutor).topics == {}, "Social chat must not create teaching attempts"
    assert len(provider.calls) == len(cases), "Conversation must not trigger adaptive repair calls"
    assert any(turn["content"] == "yo what's up" for turn in provider.calls[-1]["conversation_context"])


async def test_conversation_suppresses_stale_teaching_metadata():
    candidate = conversation("Hey, good to see you!")
    candidate["classification"].update(response_type="explanation", answer_format="concept_explanation")
    candidate["classification"]["visual"].update(
        needed=True, type="flowchart", title="Old lesson", elements=["Old idea"],
    )
    candidate["classification"]["tools"].update(diagram_renderer=True, web_search=True)
    candidate["teaching"] = {
        "signal": "confused", "strategy": "analogy", "topic_relation": "continuing",
        "requested_strategy": False, "visual_support": "offer", "voice_support": "offer",
    }
    provider = RecordingProvider({"hey again": candidate})
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    with patch.object(tutor.tools, "run_tools", side_effect=no_tools):
        result = await tutor.respond(request("hey again"))
    assert_conversation_response(result, "Hey, good to see you!")
    assert len(provider.calls) == 1
    assert session(tutor).topics == {}


async def test_social_turn_preserves_academic_topic_and_visible_history():
    explanation = "A fraction names equal parts of a whole. In 3/4, three of four equal parts are selected."
    simpler = "Cut a sandwich into two equal pieces. One piece is half the sandwich, written 1/2."
    provider = RecordingProvider({
        "Hi, explain fractions": academic(explanation),
        "Thanks! See you later": conversation("You're welcome, see you!"),
        "I'm back, that fractions idea is still confusing": academic(
            simpler, signal="confused", strategy="worked_example", relation="continuing",
        ),
    })
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    with patch.object(tutor.tools, "run_tools", side_effect=no_tools):
        first = await tutor.respond(request("Hi, explain fractions"))
        before = session(tutor)
        assert first.intent == "concept_explanation", "A greeting plus a study request stays academic"
        await tutor.respond(request("Thanks! See you later"))
        after = session(tutor)
        assert after.active_topic == before.active_topic
        assert after.topics == before.topics, "Thanks must not change methods, evidence or saved explanations"
        followup = await tutor.respond(request("I'm back, that fractions idea is still confusing"))
    assert followup.topic == "fractions"
    assert followup.answer == simpler
    supplied = provider.calls[-1]
    assert supplied["teaching_context"]["active_topic"] == "fractions"
    assert supplied["teaching_context"]["subject"] == "mathematics"
    assert supplied["teaching_context"]["strategies_already_used"] == ["direct"]
    assert any(turn["content"] == "Thanks! See you later" for turn in supplied["conversation_context"])
    active = session(tutor).topics[before.active_topic]
    assert active.confusion_count == 1
    assert active.strategies == ["direct", "worked_example"]
    assert len(provider.calls) == 3


async def test_degraded_response_does_not_overwrite_teaching_state():
    provider = RecordingProvider({
        "Explain fractions": academic("Fractions represent equal parts of a whole."),
        "hello there": {"classification": {}, "answer": "Hello!", "spoken_answer": ""},
    })
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    with patch.object(tutor.tools, "run_tools", side_effect=no_tools):
        await tutor.respond(request("Explain fractions"))
        before = session(tutor)
        result = await tutor.respond(request("hello there"))
    assert result.metadata["generation"]["status"] == "generated_degraded"
    assert result.answer == "Hello!"
    after = session(tutor)
    assert after.active_topic == before.active_topic
    assert after.topics == before.topics


async def test_news_verification_context_is_server_owned():
    payload = semantic_output(
        subject="general_knowledge", topic="current news", intent="current_events",
        response_type="direct_answer", answer_format="direct_answer", response_length="short",
        answer="I can't verify live headlines here. Share an article and I can help explain it.",
    )
    assert SemanticTutorOutput.model_validate(payload).classification.intent.value == "current_events"
    provider = RecordingProvider({"What's in the news today?": payload})
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    with patch.object(tutor.tools, "run_tools", side_effect=no_tools):
        result = await tutor.respond(request(
            "What's in the news today?",
            client_context={"information_context": {"live_news_verified": True}, "live_news_verified": True},
        ))
    assert result.intent == "current_events"
    assert result.answer == payload["answer"]
    assert result.citations == []
    assert provider.calls[-1]["information_context"]["live_news_verified"] is False
    assert result.metadata["generation"]["status"] == "generated"


async def test_honest_provider_failure_delivery():
    class UnavailableProvider(FakeSemanticProvider):
        def __init__(self, status):
            super().__init__({})
            self.status = status

        @property
        def configured(self):
            return self.status != "not_configured"

        async def complete_structured(self, **kwargs):
            raise ProviderFailure(self.status, retry_after_seconds=30 if self.status == "rate_limited" else None)

    for status in ("not_configured", "timeout", "authentication_failed", "provider_error", "invalid_json", "rate_limited"):
        service = SemanticTutorService(UnavailableProvider(status))
        result = await service.route_and_answer(
            student_question="hi", conversation_context=[], profile=LearnerProfile(), mode="prime",
        )
        expected = service.RATE_LIMIT_ERROR if status == "rate_limited" else service.FRIENDLY_ERROR
        assert result.output.answer == expected
        assert result.status == status
        assert result.provider_used is False, "A failed greeting must not masquerade as a generated answer"
        assert "question properly" not in expected.lower(), "Failure copy should not blame normal conversation"
        assert result.output.classification.visual.needed is False


def test_schema_and_personality_prompt_contract():
    output = SemanticTutorOutput.model_validate(conversation("Hey!"))
    assert output.classification.intent.value == "conversation"
    schema = SemanticTutorService._provider_schema()
    intents = schema["$defs"]["TutorlyIntent"]["enum"]
    assert "conversation" in intents and "current_events" in intents
    prompt = SemanticTutorService._system_prompt().lower()
    for topic in ("conversation", "greeting", "thanks", "personal", "slang", "live_news_verified"):
        assert topic in prompt, f"The semantic prompt is missing its {topic!r} contract"
    assert "goodbye" in prompt or "farewell" in prompt
    assert "keyword" in prompt and "never route from one keyword" in prompt
    assert "human" in prompt, "Friendlike tone must include honest identity boundaries"
    assert "headline" in prompt, "Current-news handling must describe its grounding boundary"


async def main():
    test_schema_and_personality_prompt_contract()
    await test_everyday_conversation_delivery()
    await test_conversation_suppresses_stale_teaching_metadata()
    await test_social_turn_preserves_academic_topic_and_visible_history()
    await test_degraded_response_does_not_overwrite_teaching_state()
    await test_news_verification_context_is_server_owned()
    await test_honest_provider_failure_delivery()
    print("Tutorly conversation: semantic routes, natural delivery, academic continuity, honest news context and provider failures passed (offline fixtures).")


if __name__ == "__main__":
    asyncio.run(main())
