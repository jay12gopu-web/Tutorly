from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import replace
from typing import AsyncIterator, Dict, List

try:
    from backend.curriculum_store import resolve_context as resolve_curriculum_context
except ImportError:
    from curriculum_store import resolve_context as resolve_curriculum_context

from .ai import GroqProvider, SemanticClassification, SemanticTutorService, TutorlyIntent
from .analytics_engine import AnalyticsEngine
from .conversation_context import ConversationContextStore
from .memory_engine import MemoryEngine
from .modes import ModeRegistry
from .premium_credits import EDUCATIONAL_IMAGE_CREDIT_COST
from .response_policy import ResponsePolicyEngine
from .schemas import (
    ChatbotRequest,
    ChatbotResponse,
    DifficultyLevel,
    GradeBand,
    LearnerProfile,
    QuestionAnalysis,
    QuestionType,
    ResponseStage,
    StreamEvent,
    SubjectArea,
)
from .tool_engine import ToolEngine
from .teaching_strategy import TeachingStrategyEngine, topic_key


class ChatbotOrchestrator:
    """Conversation-aware semantic Tutorly chat pipeline.

    All live subject, topic, intent, tool, and visual routing comes from the
    validated semantic LLM response.
    """
    MAX_REPAIR_SECONDS = 12.0
    MAX_ADAPTIVE_SECONDS = 44.0  # Leave headroom inside the existing 50s browser timeout.

    def __init__(self, semantic_tutor: SemanticTutorService | None = None) -> None:
        self.modes = ModeRegistry()
        self.memory = MemoryEngine()
        self.tools = ToolEngine()
        self.analytics = AnalyticsEngine()
        self.response_policy = ResponsePolicyEngine()
        self.conversations = ConversationContextStore(max_turns=12)
        self.semantic_tutor = semantic_tutor or SemanticTutorService(GroqProvider())
        self.teaching = TeachingStrategyEngine()
        self._conversation_locks = {}

    async def respond(self, request: ChatbotRequest) -> ChatbotResponse:
        return await self._build_response(request)

    async def stream(self, request: ChatbotRequest) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(stage=ResponseStage.received, message="Question received.")
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.understanding, message="Understanding the complete question and context...")
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.planning, message="Choosing the best explanation, tools, and visual...")
        response = await self._build_response(request)
        if response.metadata["generation"]["provider"] == "none":
            yield StreamEvent(stage=ResponseStage.error, message=response.answer, done=True)
            return
        for chunk in self._chunk_answer(response.answer):
            yield StreamEvent(stage=ResponseStage.final, message="Writing answer...", delta=chunk)
            await asyncio.sleep(0)
        yield StreamEvent(
            stage=ResponseStage.final,
            message="Done.",
            done=True,
            payload=json.loads(response.model_dump_json()),
        )

    async def _build_response(self, request: ChatbotRequest) -> ChatbotResponse:
        request.conversation_id = request.conversation_id or f"chat_{uuid.uuid4().hex[:16]}"
        if not request._session_owner:
            return await self._build_response_locked(request)
        # Serialize only turns sharing a verified account AND conversation.
        # Reference counts include waiters; cancel/failure removes idle locks.
        key = (request._session_owner, request.conversation_id)
        entry = self._conversation_locks.setdefault(key, [asyncio.Lock(), 0])
        entry[1] += 1
        try:
            async with entry[0]:
                return await self._build_response_locked(request)
        finally:
            entry[1] -= 1
            if not entry[1]:
                self._conversation_locks.pop(key, None)

    async def _build_response_locked(self, request: ChatbotRequest) -> ChatbotResponse:
        conversation_id = request.conversation_id or f"chat_{uuid.uuid4().hex[:16]}"
        profile = request.profile or LearnerProfile(user_id=request.user_id)
        requested_curriculum = request.client_context.get("curriculum")
        if isinstance(requested_curriculum, dict):
            try:
                request.client_context["curriculum"] = resolve_curriculum_context(
                    board=profile.board or requested_curriculum.get("board"),
                    grade=profile.grade or requested_curriculum.get("grade"),
                    subject_id=str(requested_curriculum.get("subject_id") or ""),
                    book_id=str(requested_curriculum.get("book_id") or ""),
                    chapter_id=str(requested_curriculum.get("chapter_id") or ""),
                    academic_year=str(requested_curriculum.get("academic_year") or "2026-27"),
                    medium=str(requested_curriculum.get("medium") or "English"),
                )
            except (TypeError, ValueError):
                request.client_context["curriculum"] = {}
        owner = request._session_owner
        context_key = (owner, conversation_id)
        recent_context = self.conversations.recent(context_key, request.history) if owner else request.history[-12:]
        teaching_session = self.teaching.snapshot(owner, conversation_id)
        teaching_context = self.teaching.context(teaching_session, profile)
        generation_args = dict(
            student_question=request.message,
            conversation_context=recent_context,
            profile=profile,
            mode=request.mode.value,
            attachments=request.attachments,
            client_context=request.client_context,
        )
        started = asyncio.get_running_loop().time()
        semantic_result = await self.semantic_tutor.route_and_answer(**generation_args, teaching_context=teaching_context)
        if semantic_result.status == "generated" and semantic_result.output.classification.intent != TutorlyIntent.conversation:
            issue = self.teaching.repetition_issue(teaching_session, semantic_result.output, recent_context)
            if issue:
                repair = self.teaching.repair_context(teaching_session, semantic_result.output, profile)
                original = semantic_result.output
                remaining = min(
                    self.MAX_REPAIR_SECONDS,
                    self.MAX_ADAPTIVE_SECONDS - (asyncio.get_running_loop().time() - started),
                )
                repaired = None
                if remaining > 0:
                    try:
                        repaired = await asyncio.wait_for(self.semantic_tutor.route_and_answer(
                            **generation_args, teaching_context={**teaching_context, "repair": {**repair, "issue": issue}},
                        ), timeout=remaining)
                    except asyncio.TimeoutError:
                        pass  # A stalled optional repair must not discard the answer.
                if repaired and repaired.provider_used:
                    # A retry is the same student turn, not new learning evidence.
                    repaired.output.teaching.signal = original.teaching.signal
                    repaired.output.teaching.topic_relation = original.teaching.topic_relation
                    repaired.output.teaching.requested_strategy = original.teaching.requested_strategy
                acceptable = (
                    repaired is not None and repaired.provider_used
                    and repaired.output.teaching.strategy == repair["required_strategy"]
                    and repaired.output.classification.subject == original.classification.subject
                    and topic_key(repaired.output.classification.subject.value, repaired.output.classification.topic)
                    == topic_key(original.classification.subject.value, original.classification.topic)
                    and not self.teaching.repetition_issue(teaching_session, repaired.output, recent_context)
                )
                if acceptable:
                    semantic_result = repaired
                else:
                    # Never deliver a repeated lecture, nor discard chat on an
                    # optional repair failure. Ask for concrete diagnostic input.
                    safe_output = original.model_copy(deep=True)
                    safe_output.answer = self.teaching.diagnostic_question(teaching_session, original)
                    safe_output.spoken_answer = safe_output.answer
                    safe_output.teaching.strategy = "guided_questions"
                    safe_output.teaching.visual_support = "none"
                    safe_output.teaching.voice_support = "none"
                    safe_output.classification.visual.needed = False
                    safe_output.classification.visual.type = type(original.classification.visual.type).none
                    safe_output.classification.visual.generation_prompt = ""
                    safe_output.classification.visual.title = ""
                    safe_output.classification.visual.elements = []
                    safe_output.classification.visual.explicit_image_request = False
                    for tool in type(safe_output.classification.tools).model_fields:
                        setattr(safe_output.classification.tools, tool, False)
                    semantic_result = replace(semantic_result, output=safe_output)
        classification = semantic_result.output.classification
        is_conversation = classification.intent == TutorlyIntent.conversation
        analysis = self._analysis_from_semantic(classification)
        response_plan = self.response_policy.from_semantic(classification.model_dump(mode="json"))

        selected_tools = self.tools.choose_tools_from_semantic(
            classification.tools.model_dump(),
            has_attachments=bool(request.attachments),
        )
        tool_calls = self.tools.run_tools(selected_tools, request.message)
        answer = semantic_result.output.answer
        confidence = max(0.0, min(1.0, float(classification.confidence)))
        plan_metadata = response_plan.as_metadata()
        route_metadata = classification.model_dump(mode="json")
        image_generation = self._image_generation_action(classification, profile)
        teaching_actions = self.teaching.actions(
            semantic_result.output,
            self.teaching.previous(teaching_session, classification, semantic_result.output.teaching),
            profile, voice_mode=bool(request.client_context.get("voice_mode")),
        ) if semantic_result.status == "generated" and not is_conversation else []

        analytics = self.analytics.snapshot(
            subject=analysis.subject,
            difficulty=analysis.difficulty,
            confidence=confidence,
            intents=[classification.intent.value],
            keywords=[],
            tool_calls=tool_calls,
        )
        if is_conversation:
            analytics.weak_topic_candidates = []
            analytics.strong_topic_candidates = []
            analytics.recommended_next_actions = []
        # Student answers stay focused. Practice/quiz content is generated only
        # when the student explicitly requests it, never as an automatic bundle.
        resources = []

        if semantic_result.provider_used:
            if owner:
                self.conversations.append(context_key, "user", request.message)
                self.conversations.append(context_key, "assistant", answer)
            if semantic_result.status == "generated" and not is_conversation:
                self.teaching.remember(
                    owner, conversation_id, teaching_session, semantic_result.output,
                    # Illustrations are only proposed here, not generated yet.
                    visual_shown=classification.visual.needed and not image_generation.get("requested"),
                    voice_offered=any(action["id"] == "talk_it_through" for action in teaching_actions),
                )

        return ChatbotResponse(
            conversation_id=conversation_id,
            mode=request.mode,
            subject=analysis.subject,
            topic=classification.topic,
            intent=classification.intent.value,
            response_type=classification.response_type.value,
            answer_format=classification.answer_format.value,
            response_length=classification.response_length.value,
            visual=route_metadata["visual"],
            answer=answer,
            stages=[
                ResponseStage.received,
                ResponseStage.understanding,
                ResponseStage.planning,
                ResponseStage.tooling,
                ResponseStage.solving,
                ResponseStage.resources,
                ResponseStage.final,
            ],
            reasoning_plan=[],
            memories_used=[],
            tool_calls=tool_calls,
            citations=[],
            study_resources=resources,
            analytics=analytics,
            metadata={
                "mode_strategy": self.modes.get(request.mode).title,
                "classification_confidence": confidence,
                "analysis": analysis.model_dump(mode="json"),
                "semantic_route": route_metadata,
                "router_architecture": "single_call_classification_and_answer",
                "generation": {
                    "provider": semantic_result.provider if semantic_result.provider_used else "none",
                    "model": semantic_result.model,
                    "status": semantic_result.status,
                    "retry_after_seconds": semantic_result.retry_after_seconds,
                },
                "response_policy": plan_metadata,
                "quick_actions": self.response_policy.action_metadata(response_plan),
                "teaching_actions": teaching_actions,
                "spoken_answer": semantic_result.output.spoken_answer,
                "visual": route_metadata["visual"],
                "tools": route_metadata["tools"],
                "image_generation": image_generation,
            },
        )

    @staticmethod
    def _image_generation_action(
        route: SemanticClassification,
        profile: LearnerProfile,
    ) -> dict[str, object]:
        visual = route.visual
        requested = bool(
            route.tools.image_generator
            and visual.needed
            and visual.type.value == "educational_illustration"
            and visual.generation_prompt.strip()
        )
        if not requested:
            return {"requested": False}
        return {
            "requested": True,
            "action": "educationalImage",
            "credit_cost": EDUCATIONAL_IMAGE_CREDIT_COST,
            "explicit_request": visual.explicit_image_request,
            "visual_type": visual.type.value,
            "topic": route.topic[:160],
            "description": visual.generation_prompt[:1800],
            "required_labels": [label[:80] for label in visual.elements[:7]],
            "educational_context": (
                f"Tutorly study visual for {route.subject.value}; "
                f"student level {route.difficulty.value}; topic {route.topic}."
            )[:500],
            "style": visual.image_style.value,
            "aspect_ratio": visual.aspect_ratio.value,
            "placement": visual.placement.value,
            "alt_text": visual.title[:180] or f"Educational illustration of {route.topic}",
            "student_grade": str(profile.grade or route.difficulty.value)[:40],
        }

    def _analysis_from_semantic(self, route: SemanticClassification) -> QuestionAnalysis:
        subject = SubjectArea(route.subject.value)
        grade_level, difficulty = self._difficulty_mapping(route.difficulty.value)
        question_type = self._question_type_mapping(route.intent)
        return QuestionAnalysis(
            subject=subject,
            topic=route.topic.strip() or "General explanation",
            sub_topic=route.response_type.value.replace("_", " ").title(),
            grade_level=grade_level,
            difficulty=difficulty,
            question_type=question_type,
            confidence=max(0.0, min(1.0, route.confidence)),
            keywords=[],
            requires_freshness_check=route.tools.web_search,
            reasoning_signals=["llm_semantic_router"],
        )

    @staticmethod
    def _difficulty_mapping(level: str) -> tuple[GradeBand, DifficultyLevel]:
        if level in {"grade_1", "grade_2", "grade_3", "grade_4", "grade_5"}:
            return GradeBand.grade_1_5, DifficultyLevel.beginner
        if level in {"grade_6", "grade_7", "grade_8"}:
            return GradeBand.grade_6_8, DifficultyLevel.school
        if level in {"grade_9", "grade_10", "grade_11", "grade_12"}:
            return GradeBand.grade_9_12, DifficultyLevel.school
        if level == "college":
            return GradeBand.college, DifficultyLevel.advanced
        return GradeBand.unknown, DifficultyLevel.balanced

    @staticmethod
    def _question_type_mapping(intent: TutorlyIntent) -> QuestionType:
        mapping: Dict[TutorlyIntent, QuestionType] = {
            TutorlyIntent.numerical_problem: QuestionType.numerical,
            TutorlyIntent.solve_equation: QuestionType.problem_solving,
            TutorlyIntent.proof: QuestionType.problem_solving,
            TutorlyIntent.writing_help: QuestionType.essay,
            TutorlyIntent.grammar_help: QuestionType.grammar,
            TutorlyIntent.literature_explanation: QuestionType.literature,
            TutorlyIntent.poetry_analysis: QuestionType.literature,
            TutorlyIntent.reading_comprehension: QuestionType.literature,
            TutorlyIntent.debugging: QuestionType.coding,
            TutorlyIntent.analyze: QuestionType.explanation,
        }
        return mapping.get(intent, QuestionType.explanation)

    @staticmethod
    def _chunk_answer(answer: str, size: int = 120) -> List[str]:
        return [answer[index:index + size] for index in range(0, len(answer), size)]
