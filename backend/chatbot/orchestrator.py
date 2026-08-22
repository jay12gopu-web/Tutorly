from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncIterator, Dict, List

from .ai import GroqProvider, SemanticClassification, SemanticTutorService, TutorlyIntent
from .analytics_engine import AnalyticsEngine
from .conversation_context import ConversationContextStore
from .memory_engine import MemoryEngine
from .modes import ModeRegistry
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


class ChatbotOrchestrator:
    """Conversation-aware semantic Tutorly chat pipeline.

    All live subject, topic, intent, tool, and visual routing comes from the
    validated semantic LLM response.
    """

    def __init__(self, semantic_tutor: SemanticTutorService | None = None) -> None:
        self.modes = ModeRegistry()
        self.memory = MemoryEngine()
        self.tools = ToolEngine()
        self.analytics = AnalyticsEngine()
        self.response_policy = ResponsePolicyEngine()
        self.conversations = ConversationContextStore(max_turns=12)
        self.semantic_tutor = semantic_tutor or SemanticTutorService(GroqProvider())

    async def respond(self, request: ChatbotRequest) -> ChatbotResponse:
        return await self._build_response(request)

    async def stream(self, request: ChatbotRequest) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(stage=ResponseStage.received, message="Question received.")
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.understanding, message="Understanding the complete question and context...")
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.planning, message="Choosing the best explanation, tools, and visual...")
        response = await self._build_response(request)
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
        conversation_id = request.conversation_id or f"chat_{uuid.uuid4().hex[:16]}"
        profile = request.profile or LearnerProfile(user_id=request.user_id)
        recent_context = self.conversations.recent(conversation_id, request.history)
        semantic_result = await self.semantic_tutor.route_and_answer(
            student_question=request.message,
            conversation_context=recent_context,
            profile=profile,
            mode=request.mode.value,
            attachments=request.attachments,
        )
        classification = semantic_result.output.classification
        analysis = self._analysis_from_semantic(classification)
        profile = self.memory.update_profile_from_message(profile, request.message, analysis.subject)
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

        analytics = self.analytics.snapshot(
            subject=analysis.subject,
            difficulty=analysis.difficulty,
            confidence=confidence,
            intents=[classification.intent.value],
            keywords=[],
            tool_calls=tool_calls,
        )
        # Student answers stay focused. Practice/quiz content is generated only
        # when the student explicitly requests it, never as an automatic bundle.
        resources = []

        self.conversations.append(conversation_id, "user", request.message)
        self.conversations.append(conversation_id, "assistant", answer)
        self.memory.remember(
            request.user_id,
            f"{analysis.subject.value}: {request.message}",
            kind="conversation",
            tags=[analysis.subject.value, request.mode.value],
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
                },
                "response_policy": plan_metadata,
                "quick_actions": self.response_policy.action_metadata(response_plan),
                "visual": route_metadata["visual"],
                "tools": route_metadata["tools"],
            },
        )

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
