"""Offline adaptive-teaching integration regressions.

The semantic model boundary is scripted. These checks verify that validated
decisions change the delivered teaching method, scope private state correctly,
and repair repeated explanations without claiming to measure live LLM accuracy.
"""
from __future__ import annotations

import asyncio
import copy
import json
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from chatbot_backend_smoke import semantic_output
from backend.chatbot.ai.provider import AIProvider, ProviderFailure
from backend.chatbot.ai.semantic_router import ADAPTIVE_TEACHING_PROMPT, SemanticTutorService
from backend.chatbot.orchestrator import ChatbotOrchestrator
from backend.chatbot.schemas import ChatbotRequest, ConversationTurn, LearnerProfile
from backend.chatbot.teaching_strategy import TeachingStrategyEngine, topic_key


DIRECT = "A fraction names equal parts of a whole. In 3/4, the whole has four equal parts and three are selected."
SIMPLE = "Cut one sandwich into two equal pieces. Take one piece: you have half the sandwich, written 1/2."
STEPS = "1. Draw a rectangle.\n2. Split it into five equal boxes.\n3. Shade two boxes.\nThe shaded amount is 2/5."
ANALOGY = "Think of a team of six runners. If two wear blue shirts, the blue group is 2/6 of the team."
WORKED = "For 3/8 of 24 beads, first find one eighth: 24 ÷ 8 = 3. Then take three groups: 3 × 3 = 9 beads."


def output(answer=DIRECT, *, signal="none", strategy="direct", relation="new", topic="fractions", subject="mathematics", **teaching):
    result = semantic_output(
        subject=subject, topic=topic,
        intent="answer_only" if signal == "answer_only" else "concept_explanation",
        response_type="direct_answer" if signal == "answer_only" else "explanation",
        answer_format="direct_answer" if signal == "answer_only" else "concept_explanation",
        response_length="very_short" if signal == "answer_only" else "short",
        answer=answer,
    )
    result["teaching"] = {
        "signal": signal, "strategy": strategy, "topic_relation": relation,
        "requested_strategy": False, "visual_support": "none", "voice_support": "none",
        **teaching,
    }
    return result


class SequentialSemanticProvider(AIProvider):
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []
        self.system_prompts = []

    @property
    def name(self):
        return "offline-adaptive-fixture"

    @property
    def model(self):
        return "scripted-methods"

    @property
    def configured(self):
        return True

    async def complete_structured(self, *, messages, schema, schema_name):
        payload = json.loads(messages[-1]["content"])
        self.calls.append(payload)
        self.system_prompts.append(messages[0]["content"])
        assert self.responses, "Adaptive pipeline made an unexpected extra model call"
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return copy.deepcopy(response(payload) if callable(response) else response)


def tutor_for(*responses):
    provider = SequentialSemanticProvider(*responses)
    return ChatbotOrchestrator(SemanticTutorService(provider)), provider


def request(message, *, owner="test:alice", conversation="fractions-chat", **kwargs):
    value = ChatbotRequest(
        user_id="client-controlled-id", conversation_id=conversation, message=message, **kwargs,
    )
    value._session_owner = owner
    return value


def active(tutor, *, owner="test:alice", conversation="fractions-chat"):
    snapshot = tutor.teaching.snapshot(owner, conversation)
    return snapshot.topics[snapshot.active_topic]


def successful_repair(payload):
    repair = payload["teaching_context"]["repair"]
    return output(WORKED, signal="confused", strategy=repair["required_strategy"], relation="continuing")


async def test_progression_and_private_context():
    tutor, provider = tutor_for(
        output(),
        output(SIMPLE, signal="simpler", strategy="simpler", relation="continuing"),
        output(STEPS, signal="confused", strategy="step_by_step", relation="continuing"),
        output(ANALOGY, signal="another_way", strategy="analogy", relation="continuing"),
    )
    profile = LearnerProfile(
        user_id="alice", learning_approach="step_by_step", preferred_language="te",
        weak_concepts=["geometry"], strong_concepts=["arithmetic"],
    )
    # Conversational struggle must never enter the completion/reward ledger.
    with patch("backend.quest_service.QuestService.record_events", side_effect=AssertionError("Chat awarded a learning event")):
        answers = []
        for message in ("Explain fractions", "Make it simpler", "I don't understand", "Another way please"):
            result = await tutor.respond(request(message, profile=profile))
            answers.append(result.answer)
            public = result.model_dump(mode="json")
            for forbidden in ("teaching_context", "confusion_count", "wrong_streak", "strategies_already_used"):
                assert forbidden not in json.dumps(public), forbidden
    assert answers == [DIRECT, SIMPLE, STEPS, ANALOGY]
    assert len(provider.calls) == 4, "Compliant turns should keep single-call latency"
    assert provider.calls[-1]["teaching_context"]["strategies_already_used"] == ["direct", "simpler", "step_by_step"]
    assert provider.calls[-1]["teaching_context"]["confusion_count"] == 2
    assert provider.calls[0]["teaching_context"]["preferred_initial_method"] == "step_by_step"
    assert provider.calls[0]["student_profile"]["preferred_language"] == "te"
    assert ADAPTIVE_TEACHING_PROMPT in provider.system_prompts[0]
    assert active(tutor).confusion_count == 3
    assert profile.weak_concepts == ["geometry"] and profile.strong_concepts == ["arithmetic"]


async def test_repetition_repair_is_bounded():
    tutor, provider = tutor_for(
        output(),
        output("The number below the line gives the total equal pieces; the number above counts chosen pieces.",
               signal="confused", relation="continuing"),
        successful_repair,
    )
    await tutor.respond(request("Explain fractions"))
    result = await tutor.respond(request("I still cannot follow"))
    assert result.answer == WORKED
    assert len(provider.calls) == 3
    repair = provider.calls[-1]["teaching_context"]["repair"]
    assert "direct" in repair["avoid_strategies"]
    assert repair["required_strategy"] != "direct"
    assert active(tutor).confusion_count == 1, "A repair is not another student confusion event"

    tutor, provider = tutor_for(
        output(),
        output(DIRECT, signal="confused", strategy="analogy", relation="continuing"),
        successful_repair,
    )
    await tutor.respond(request("Explain fractions"))
    result = await tutor.respond(request("A different explanation please"))
    assert result.answer == WORKED and len(provider.calls) == 3, "Changing metadata alone must not bypass repeated-text detection"

    tutor, provider = tutor_for(
        output(),
        output(DIRECT, signal="confused", strategy="analogy", relation="continuing"),
        output(DIRECT, signal="confused", strategy="worked_example", relation="continuing"),
    )
    await tutor.respond(request("Explain fractions"))
    result = await tutor.respond(request("Still lost"))
    assert result.answer != DIRECT and "?" in result.answer
    assert len(result.answer.split()) < 90, "Exhausted repair should offer a focused clarification"
    assert len(provider.calls) == 3
    assert active(tutor).last_strategy == "guided_questions"

    tutor, provider = tutor_for(
        output(),
        output(DIRECT, signal="confused", strategy="direct", relation="continuing"),
        output("A triangle's area is half its base times height.", signal="confused",
               strategy="worked_example", relation="continuing", topic="triangle area"),
    )
    await tutor.respond(request("Explain fractions"))
    result = await tutor.respond(request("I still don't understand fractions"))
    assert "triangle" not in result.answer and "?" in result.answer
    assert active(tutor).topic == "fractions", "A repair must not switch the topic"


async def test_explicit_requests_and_failure():
    tutor, provider = tutor_for(
        output(),
        output(DIRECT, signal="repeat", relation="continuing", requested_strategy=True),
        output("9", signal="answer_only", relation="continuing"),
        ProviderFailure("timeout"),
    )
    await tutor.respond(request("Explain fractions"))
    repeated = await tutor.respond(request("Repeat that exact explanation"))
    answer_only = await tutor.respond(request("Only the answer: 3/8 of 24"))
    before = copy.deepcopy(active(tutor))
    failed = await tutor.respond(request("Can you try again?"))
    assert repeated.answer == DIRECT and answer_only.answer == "9"
    assert answer_only.metadata["teaching_actions"] == []
    assert failed.metadata["generation"]["status"] == "timeout"
    assert active(tutor) == before, "Provider failures must not count as student learning evidence"
    assert len(provider.calls) == 4

    tutor, provider = tutor_for(output(), output(DIRECT, signal="confused", relation="continuing"))
    await tutor.respond(request("Explain fractions"))
    original_complete = provider.complete_structured
    async def stall_only_repair(**kwargs):
        if json.loads(kwargs["messages"][-1]["content"])["teaching_context"].get("repair"):
            await asyncio.sleep(5)
        return await original_complete(**kwargs)
    provider.complete_structured = stall_only_repair
    tutor.MAX_REPAIR_SECONDS = .01
    result = await asyncio.wait_for(tutor.respond(request("Still confused")), timeout=1)
    assert "?" in result.answer and result.answer != DIRECT
    assert tutor._conversation_locks == {}, "A timed-out repair must release the conversation"


async def test_topic_and_account_isolation():
    tutor, provider = tutor_for(
        output(),
        output(SIMPLE, signal="incorrect_answer", strategy="simpler", relation="continuing"),
        output(STEPS, signal="repeated_incorrect", strategy="step_by_step", relation="continuing"),
        output("Evaporation changes liquid water into water vapour when molecules escape its surface.",
               topic="evaporation", subject="physics"),
        output(ANALOGY, signal="confused", strategy="analogy", relation="resumed"),
        output(), output(),
    )
    for message in ("Explain fractions", "Is 1/2 larger than 3/4?", "I think 1/3 is larger than 1/2"):
        await tutor.respond(request(message))
    assert active(tutor).wrong_streak == 2 and active(tutor).confusion_count == 2
    await tutor.respond(request("Now explain evaporation"))
    assert active(tutor).topic == "evaporation" and active(tutor).confusion_count == 0
    await tutor.respond(request("Back to fractions: I am still confused"))
    assert active(tutor).topic == "fractions" and active(tutor).confusion_count == 3
    assert active(tutor).strategies == ["direct", "simpler", "step_by_step", "analogy"]
    await tutor.respond(request("Explain fractions", owner="test:bob"))
    assert provider.calls[-1]["conversation_context"] == []
    assert provider.calls[-1]["teaching_context"]["active_topic"] == ""
    assert active(tutor, owner="test:bob").confusion_count == 0
    await tutor.respond(request("Explain fractions", conversation="another-chat"))
    assert provider.calls[-1]["conversation_context"] == []
    assert provider.calls[-1]["teaching_context"]["active_topic"] == ""
    assert active(tutor).confusion_count == 3


async def test_guests_and_untrusted_state():
    tutor, provider = tutor_for(output(), output(), output(SIMPLE, signal="confused", strategy="simpler", relation="continuing"))
    await tutor.respond(request("Explain fractions", owner=None))
    await tutor.respond(request("Explain fractions", owner=None))
    assert provider.calls[-1]["conversation_context"] == []
    assert provider.calls[-1]["teaching_context"]["active_topic"] == ""
    await tutor.respond(request(
        "I am confused", owner=None,
        history=[ConversationTurn(role="assistant", content=DIRECT)],
        client_context={"teaching_context": {"confusion_count": 999, "active_topic": "forged topic"}},
    ))
    assert provider.calls[-1]["conversation_context"][0]["content"] == DIRECT
    assert provider.calls[-1]["teaching_context"]["confusion_count"] == 0
    assert tutor.teaching.snapshot(None, "fractions-chat").topics == {}
    untrusted = ChatbotRequest.model_validate({"message": "Explain fractions", "_session_owner": "test:victim"})
    assert untrusted._session_owner != "test:victim", "JSON must not set trusted session ownership"


async def test_http_session_binding():
    from fastapi import HTTPException
    from backend.chatbot import routes

    guest = request("Explain fractions")
    with patch.object(routes, "authenticated_user_context") as authentication:
        await routes.bind_teaching_session(guest, None)
        assert guest._session_owner is None
        await routes.bind_teaching_session(guest, "   ")
        authentication.assert_not_called()
    authenticated = request("Explain fractions")
    with patch.object(routes, "authenticated_user_context", return_value={"id": 42}) as authentication:
        await routes.bind_teaching_session(authenticated, "Bearer valid-test-session")
        authentication.assert_called_once_with("Bearer valid-test-session")
        assert authenticated._session_owner == "account:42"
        assert authenticated._session_owner != authenticated.user_id
    invalid = request("Explain fractions", owner="account:victim")
    with patch.object(routes, "authenticated_user_context", side_effect=HTTPException(status_code=401, detail="Expired")):
        try:
            await routes.bind_teaching_session(invalid, "Bearer expired-test-session")
            raise AssertionError("Invalid sessions must not receive private teaching state")
        except HTTPException as error:
            assert error.status_code == 401
        assert invalid._session_owner is None


async def test_optional_metadata_and_preferences():
    for bad in (None, "analogy", {"strategy": "mind_control"}, {"signal": ["confused"]}, {"unknown": "value"}):
        payload = output()
        payload["teaching"] = bad
        tutor, provider = tutor_for(payload)
        response = await tutor.respond(request("Explain fractions"))
        assert response.answer == DIRECT and response.subject.value == "mathematics"
        assert len(provider.calls) == 1
    legacy = output()
    legacy.pop("teaching")
    tutor, provider = tutor_for(legacy)
    assert (await tutor.respond(request("Explain fractions"))).answer == DIRECT

    tutor, provider = tutor_for(output())
    await tutor.respond(request("Explain fractions", profile=LearnerProfile(show_diagrams=False, use_examples=False)))
    methods = provider.calls[0]["teaching_context"]["available_methods_if_confused"]
    assert not set(methods) & {"diagram", "illustration", "analogy", "real_life_example", "worked_example"}


async def test_science_visual_and_voice_controls():
    offered = output(
        "In a leaf, light powers the conversion of water and carbon dioxide into sugars.",
        subject="biology", topic="photosynthesis", strategy="direct", visual_support="offer", voice_support="offer",
    )
    diagram = output(
        "Follow the inputs toward the leaf and the products away from it.\n\n"
        "```mermaid\nflowchart LR\nA[Light and water] --> B[Leaf]\nB --> C[Sugar and oxygen]\n```",
        subject="biology", topic="photosynthesis", strategy="diagram", relation="continuing",
        visual_support="show", requested_strategy=True,
    )
    diagram["classification"]["visual"].update(needed=True, type="process_diagram", title="Photosynthesis")
    diagram["classification"]["tools"]["diagram_renderer"] = True
    voice = output(
        "Think of the leaf as a tiny kitchen. Sunlight supplies the energy to make its food.",
        signal="confused", strategy="analogy", relation="continuing", subject="biology", topic="photosynthesis",
        voice_support="offer",
    )
    voice["spoken_answer"] = "Sunlight gives the leaf energy to make food from water and carbon dioxide."
    tutor, provider = tutor_for(offered, diagram, voice)
    result = await tutor.respond(request("Explain photosynthesis"))
    assert result.answer == offered["answer"] and "```" not in result.answer
    assert result.visual["needed"] is False and result.metadata["image_generation"] == {"requested": False}
    assert not result.tool_calls, "Offering a visual must not execute or charge for generation"
    assert {action["id"] for action in result.metadata["teaching_actions"]} >= {"show_diagram", "talk_it_through"}
    assert active(tutor).visual_shown is False and active(tutor).voice_offered is True

    result = await tutor.respond(request("Show that diagram", client_context={"teaching_action": "show_diagram"}))
    assert provider.calls[-1]["requested_teaching_action"] == "show_diagram"
    assert "```mermaid" in result.answer and result.visual["needed"] is True
    assert active(tutor).visual_shown is True
    assert result.metadata["image_generation"] == {"requested": False}

    result = await tutor.respond(request("Talk through the leaf idea", client_context={"voice_mode": True}))
    assert result.metadata["spoken_answer"] == voice["spoken_answer"]
    assert all(action["id"] != "talk_it_through" for action in result.metadata["teaching_actions"])
    assert provider.calls[-1]["teaching_context"]["voice_already_offered"] is True
    assert len(provider.calls) == 3

    tutor, _ = tutor_for(offered)
    result = await tutor.respond(request("Explain photosynthesis", profile=LearnerProfile(show_diagrams=False, use_examples=False)))
    ids = {action["id"] for action in result.metadata["teaching_actions"]}
    assert "show_diagram" not in ids and "give_example" not in ids


async def test_concurrent_turns_keep_order_without_blocking_other_accounts():
    class CoordinatedProvider(SequentialSemanticProvider):
        def __init__(self):
            super().__init__(output(), output(), output(SIMPLE, signal="simpler", strategy="simpler", relation="continuing"))
            self.entered = asyncio.Event()
            self.release = asyncio.Event()

        async def complete_structured(self, **kwargs):
            result = await super().complete_structured(**kwargs)
            if self.calls[-1]["student_question"] == "first turn":
                self.entered.set()
                await self.release.wait()
            return result

    provider = CoordinatedProvider()
    tutor = ChatbotOrchestrator(SemanticTutorService(provider))
    first = asyncio.create_task(tutor.respond(request("first turn")))
    await asyncio.wait_for(provider.entered.wait(), timeout=2)
    second = asyncio.create_task(tutor.respond(request("Make it simpler")))
    try:
        await asyncio.sleep(0)
        assert len(provider.calls) == 1, "A simultaneous follow-up must wait for the preceding answer"
        other = await asyncio.wait_for(tutor.respond(request("Bob's independent turn", owner="test:bob")), timeout=2)
        assert other.answer == DIRECT
        assert provider.calls[-1]["conversation_context"] == []
        cancelled = asyncio.create_task(tutor.respond(request("Cancelled follow-up")))
        await asyncio.sleep(0)
        cancelled.cancel()
        try:
            await cancelled
        except asyncio.CancelledError:
            pass
    finally:
        provider.release.set()
    results = await asyncio.gather(first, second)
    assert [result.answer for result in results] == [DIRECT, SIMPLE]
    assert any(turn["content"] == DIRECT for turn in provider.calls[-1]["conversation_context"])
    assert active(tutor).confusion_count == 1
    assert tutor._conversation_locks == {}, "Completed and cancelled requests must release their scoped locks"


def test_bounded_state():
    engine = TeachingStrategyEngine(max_sessions=2, ttl_seconds=10, max_topics=2)
    with patch("backend.chatbot.teaching_strategy.time.monotonic", return_value=100):
        engine.snapshot("a", "chat")
        engine.snapshot("b", "chat")
        engine.snapshot("c", "chat")
        assert len(engine._sessions) == 2 and ("a", "chat") not in engine._sessions
    with patch("backend.chatbot.teaching_strategy.time.monotonic", return_value=111):
        engine.snapshot("d", "chat")
        assert list(engine._sessions) == [("d", "chat")]
    assert topic_key("mathematics", "  FrAcTiOnS  ") == "mathematics:fractions"
    engine = TeachingStrategyEngine(max_sessions=2)
    snapshots = [engine.snapshot(str(index), "chat") for index in range(6)]
    from backend.chatbot.ai.semantic_router import SemanticTutorOutput
    for index, snapshot in enumerate(snapshots):
        engine.remember(str(index), "chat", snapshot, SemanticTutorOutput.model_validate(output()))
        assert len(engine._sessions) <= 2, "Finishing concurrent requests must respect the session bound"


async def main():
    await test_progression_and_private_context()
    await test_repetition_repair_is_bounded()
    await test_explicit_requests_and_failure()
    await test_topic_and_account_isolation()
    await test_guests_and_untrusted_state()
    await test_http_session_binding()
    await test_optional_metadata_and_preferences()
    await test_science_visual_and_voice_controls()
    await test_concurrent_turns_keep_order_without_blocking_other_accounts()
    test_bounded_state()
    print("Tutorly adaptive teaching: progression, bounded repair, isolation, preferences, and reward/mastery boundaries passed.")


if __name__ == "__main__":
    asyncio.run(main())
