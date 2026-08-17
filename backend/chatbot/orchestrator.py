from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncIterator, List

from .analytics_engine import AnalyticsEngine
from .adaptive_teaching_engine import AdaptiveTeachingEngine
from .knowledge_confidence_engine import KnowledgeConfidenceEngine
from .knowledge_engine import KnowledgeEngine
from .knowledge_merge_engine import KnowledgeMergeEngine
from .memory_engine import MemoryEngine
from .modes import ModeRegistry
from .pattern_matching_engine import PatternMatchingEngine
from .practice_generator import PracticeGenerator
from .question_analyzer import QuestionAnalyzer
from .reasoning_engine import ReasoningEngine
from .schemas import ChatbotRequest, ChatbotResponse, LearnerProfile, ResponseStage, RetrievedKnowledge, StreamEvent
from .scope_guard import EducationScopeGuard
from .subject_classifier import SubjectClassifier
from .tool_engine import ToolEngine
from .groq_tutor import GroqTutor
from .tutor_engine import TutorEngine


class ChatbotOrchestrator:
    def __init__(self) -> None:
        self.modes = ModeRegistry()
        self.analyzer = QuestionAnalyzer()
        self.classifier = SubjectClassifier()
        self.patterns = PatternMatchingEngine()
        self.confidence = KnowledgeConfidenceEngine()
        self.memory = MemoryEngine()
        self.reasoning = ReasoningEngine()
        self.knowledge = KnowledgeEngine()
        self.merge = KnowledgeMergeEngine()
        self.tools = ToolEngine()
        self.tutor = TutorEngine()
        self.groq_tutor = GroqTutor()
        self.scope_guard = EducationScopeGuard()
        self.adaptive_tutor = AdaptiveTeachingEngine()
        self.practice = PracticeGenerator()
        self.analytics = AnalyticsEngine()

    async def respond(self, request: ChatbotRequest) -> ChatbotResponse:
        result = await self._build_response(request)
        return result

    async def stream(self, request: ChatbotRequest) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(stage=ResponseStage.received, message="Question received.")
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.understanding, message="Understanding your question...")
        analysis = self.analyzer.analyze(request.message, request.subject_hint)
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.retrieving, message="Checking similar solved patterns...")
        pattern_matches = self.patterns.find_similar(request.message, analysis)
        memories = self.memory.retrieve(request.user_id, request.message, analysis.subject)
        await asyncio.sleep(0)
        knowledge_confidence = self.confidence.assess(analysis, pattern_matches)
        yield StreamEvent(stage=ResponseStage.planning, message="Planning the best teaching strategy...")
        strategy = self.modes.get(request.mode)
        intents = [analysis.question_type.value]
        reasoning_plan = self.reasoning.plan(request.message, analysis.subject, analysis.difficulty, strategy, intents)
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.tooling, message="Checking useful tools...")
        selected_tools = self.tools.choose_tools(request.message, analysis.subject, request.mode, bool(request.attachments))
        tool_calls = self.tools.run_tools(selected_tools, request.message)
        await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.solving, message="Solving and verifying the answer...")
        response = await self._build_response(
            request,
            precomputed={
                "analysis": analysis,
                "memories": memories,
                "pattern_matches": pattern_matches,
                "knowledge_confidence": knowledge_confidence,
                "strategy": strategy,
                "reasoning_plan": reasoning_plan,
                "tool_calls": tool_calls,
            },
        )
        for chunk in self._chunk_answer(response.answer):
            yield StreamEvent(stage=ResponseStage.final, message="Writing answer...", delta=chunk)
            await asyncio.sleep(0)
        yield StreamEvent(stage=ResponseStage.final, message="Done.", done=True, payload=json.loads(response.json()))

    async def _build_response(self, request: ChatbotRequest, precomputed: dict | None = None) -> ChatbotResponse:
        precomputed = precomputed or {}
        analysis = precomputed.get("analysis") or self.analyzer.analyze(request.message, request.subject_hint)
        scope = self.scope_guard.assess(request.message)
        if not scope.allowed:
            return self._out_of_scope_response(request, analysis, scope.category)

        classification = self.classifier.classify(request.message, analysis.subject)
        strategy = precomputed.get("strategy") or self.modes.get(request.mode)
        profile = request.profile or LearnerProfile(user_id=request.user_id)
        profile = self.memory.update_profile_from_message(profile, request.message, analysis.subject)
        memories = precomputed.get("memories") or self.memory.retrieve(request.user_id, request.message, analysis.subject)
        pattern_matches = precomputed.get("pattern_matches") or self.patterns.find_similar(request.message, analysis)
        knowledge_confidence = precomputed.get("knowledge_confidence") or self.confidence.assess(analysis, pattern_matches)
        knowledge_hits = self.knowledge.retrieve(request.message, analysis.subject)
        reasoning_plan = precomputed.get("reasoning_plan") or self.reasoning.plan(
            request.message,
            analysis.subject,
            analysis.difficulty,
            strategy,
            [analysis.question_type.value],
        )
        selected_tools = self.tools.choose_tools(request.message, analysis.subject, request.mode, bool(request.attachments))
        tool_calls = precomputed.get("tool_calls") or self.tools.run_tools(selected_tools, request.message)
        knowledge_notes: List[str] = [hit.content for hit in knowledge_hits]
        retrieved = RetrievedKnowledge(
            internal_notes=knowledge_notes,
            previous_patterns=pattern_matches,
            memory_summary=self.memory.summarize_for_prompt(memories),
        )
        merged = self.merge.merge(analysis, retrieved, knowledge_confidence)
        practice_question = self.practice.generate(analysis, request.message)

        fallback_answer = self.tutor.compose_answer(
            message=request.message,
            subject=analysis.subject,
            difficulty=analysis.difficulty,
            strategy=strategy,
            profile=profile,
            reasoning_plan=reasoning_plan,
            memories=memories,
            tool_calls=tool_calls,
            knowledge_notes=knowledge_notes,
            analysis=analysis,
            merged_knowledge=merged,
            practice_question=practice_question,
        )
        generated = await self.groq_tutor.compose(
            message=request.message,
            analysis=analysis,
            profile=profile,
            strategy=strategy,
            attachments=request.attachments,
            fallback=fallback_answer,
        )
        answer = generated.answer

        confidence = max(
            knowledge_confidence.confidence_score,
            self.reasoning.estimate_confidence(request.message, analysis.subject, len(tool_calls), len(memories)) * 0.85,
        )
        issues = self.reasoning.verify_answer_shape(answer) + self.adaptive_tutor.validate_answer(answer, request.message, analysis)
        if issues:
            answer = self.adaptive_tutor.fallback_teaching_answer(request.message, analysis, merged)
            issues = self.adaptive_tutor.validate_answer(answer, request.message, analysis)
        analytics = self.analytics.snapshot(
            subject=analysis.subject,
            difficulty=analysis.difficulty,
            confidence=confidence,
            intents=[analysis.question_type.value],
            keywords=analysis.keywords,
            tool_calls=tool_calls,
        )
        resources = self.tutor.create_study_resources(analysis.subject, request.message, request.mode)
        citations = self.knowledge.citations_from_hits(knowledge_hits) if request.mode.value == "research" else []
        conversation_id = request.conversation_id or f"chat_{uuid.uuid4().hex[:16]}"

        self.memory.remember(
            request.user_id,
            f"{analysis.subject.value}: {request.message}",
            kind="conversation",
            tags=[analysis.subject.value, request.mode.value],
        )
        self.patterns.remember_successful_teaching(request.message, analysis, answer, score=0.62)

        return ChatbotResponse(
            conversation_id=conversation_id,
            mode=request.mode,
            subject=analysis.subject,
            answer=answer,
            stages=[
                ResponseStage.received,
                ResponseStage.understanding,
                ResponseStage.retrieving,
                ResponseStage.planning,
                ResponseStage.tooling,
                ResponseStage.solving,
                ResponseStage.resources,
                ResponseStage.final,
            ],
            reasoning_plan=reasoning_plan,
            memories_used=memories,
            tool_calls=tool_calls,
            citations=citations,
            study_resources=resources,
            analytics=analytics,
            metadata={
                "mode_strategy": strategy.title,
                "verification_issues": issues,
                "classification_confidence": analysis.confidence,
                "analysis": analysis.dict(),
                "knowledge_confidence": knowledge_confidence.dict(),
                "pattern_matches": [match.dict() for match in pattern_matches],
                "recommended_teaching_strategy": merged.recommended_teaching_strategy,
                "scope": {"allowed": True, "category": scope.category},
                "generation": {
                    "provider": "groq" if generated.provider_used else "local_tutor",
                    "status": generated.status,
                },
            },
        )

    def _out_of_scope_response(self, request: ChatbotRequest, analysis, category: str) -> ChatbotResponse:
        strategy = self.modes.get(request.mode)
        conversation_id = request.conversation_id or f"chat_{uuid.uuid4().hex[:16]}"
        answer = self.scope_guard.assess(request.message).refusal()
        return ChatbotResponse(
            conversation_id=conversation_id,
            mode=request.mode,
            subject=analysis.subject,
            answer=answer,
            stages=[ResponseStage.received, ResponseStage.understanding, ResponseStage.final],
            reasoning_plan=[],
            memories_used=[],
            tool_calls=[],
            citations=[],
            study_resources=[],
            analytics=self.analytics.snapshot(
                subject=analysis.subject,
                difficulty=analysis.difficulty,
                confidence=analysis.confidence,
                intents=[analysis.question_type.value],
                keywords=analysis.keywords,
                tool_calls=[],
            ),
            metadata={
                "mode_strategy": strategy.title,
                "scope": {"allowed": False, "category": category},
                "generation": {"provider": "none", "status": "redirected"},
            },
        )

    def _chunk_answer(self, answer: str, size: int = 120) -> List[str]:
        return [answer[index:index + size] for index in range(0, len(answer), size)]
