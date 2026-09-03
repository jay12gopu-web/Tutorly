from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, validator


class ChatMode(str, Enum):
    spark = "spark"
    prime = "prime"
    lens = "lens"
    deep = "deep"
    research = "research"
    creative = "creative"
    coding = "coding"
    study = "study"


class SubjectArea(str, Enum):
    mathematics = "mathematics"
    physics = "physics"
    chemistry = "chemistry"
    biology = "biology"
    history = "history"
    geography = "geography"
    civics = "civics"
    economics = "economics"
    computer_science = "computer_science"
    english = "english"
    science = "science"
    social_science = "social_science"
    general_knowledge = "general_knowledge"
    interdisciplinary = "interdisciplinary"
    general = "general"


class QuestionType(str, Enum):
    conceptual = "conceptual"
    numerical = "numerical"
    problem_solving = "problem_solving"
    explanation = "explanation"
    essay = "essay"
    literature = "literature"
    grammar = "grammar"
    coding = "coding"
    current_events = "current_events"


class GradeBand(str, Enum):
    grade_1_5 = "grade_1_5"
    grade_6_8 = "grade_6_8"
    grade_9_12 = "grade_9_12"
    college = "college"
    unknown = "unknown"


class DifficultyLevel(str, Enum):
    beginner = "beginner"
    school = "school"
    balanced = "balanced"
    advanced = "advanced"
    exam = "exam"


class ResponseStage(str, Enum):
    received = "received"
    understanding = "understanding_question"
    retrieving = "retrieving_context"
    planning = "planning_explanation"
    tooling = "using_tools"
    solving = "solving_problem"
    examples = "generating_examples"
    resources = "building_study_resources"
    final = "final_response"
    error = "error"


class Attachment(BaseModel):
    id: Optional[str] = None
    type: Literal["image", "pdf", "document", "audio", "other"] = "other"
    url: Optional[str] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    extracted_text: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class LearnerProfile(BaseModel):
    user_id: str = "guest"
    grade: Optional[str] = None
    board: Optional[str] = None
    learning_style: Optional[str] = None
    preferred_explanation_style: Optional[str] = None
    teaching_style: Optional[str] = None
    answer_detail: Optional[str] = None
    learning_approach: Optional[str] = None
    use_examples: bool = True
    show_diagrams: bool = True
    show_formulas: bool = True
    suggest_follow_ups: bool = False
    quick_answers: bool = True
    preferred_language: Optional[str] = None
    exam_goal: Optional[str] = None
    weak_concepts: List[str] = Field(default_factory=list)
    strong_concepts: List[str] = Field(default_factory=list)
    frequent_topics: List[str] = Field(default_factory=list)


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatbotRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = "guest"
    conversation_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("conversation_id", "conversationId"),
    )
    message: str
    mode: ChatMode = ChatMode.prime
    subject_hint: Optional[SubjectArea] = None
    attachments: List[Attachment] = Field(default_factory=list)
    profile: Optional[LearnerProfile] = None
    history: List[ConversationTurn] = Field(default_factory=list)
    client_context: Dict[str, Any] = Field(default_factory=dict)

    @validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        cleaned = (value or "").replace("\x00", "").strip()
        if not cleaned:
            raise ValueError("message cannot be empty")
        if len(cleaned) > 20000:
            raise ValueError("message is too long")
        return cleaned


class MemoryItem(BaseModel):
    id: str
    kind: Literal["session", "conversation", "long_term", "learning", "topic_mastery"]
    text: str
    score: float = 0.0
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ReasoningStep(BaseModel):
    title: str
    detail: str
    confidence: float = Field(default=0.7, ge=0, le=1)


class ToolCall(BaseModel):
    name: str
    reason: str
    input: Dict[str, Any] = Field(default_factory=dict)
    output: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.7, ge=0, le=1)


class Citation(BaseModel):
    label: str
    source: str
    url: Optional[str] = None
    confidence: float = Field(default=0.7, ge=0, le=1)


class StudyResource(BaseModel):
    type: Literal["quiz", "flashcards", "practice", "summary", "study_plan", "checkpoint"]
    title: str
    items: List[Dict[str, Any]] = Field(default_factory=list)


class AnalyticsSnapshot(BaseModel):
    subject: SubjectArea
    difficulty: DifficultyLevel
    confidence: float
    detected_intents: List[str] = Field(default_factory=list)
    weak_topic_candidates: List[str] = Field(default_factory=list)
    strong_topic_candidates: List[str] = Field(default_factory=list)
    recommended_next_actions: List[str] = Field(default_factory=list)


class ChatbotResponse(BaseModel):
    conversation_id: str
    mode: ChatMode
    subject: SubjectArea
    topic: str = ""
    intent: str = "concept_explanation"
    response_type: str = "explanation"
    answer_format: str = "concept_explanation"
    response_length: str = "short"
    visual: Dict[str, Any] = Field(default_factory=dict)
    answer: str
    stages: List[ResponseStage] = Field(default_factory=list)
    reasoning_plan: List[ReasoningStep] = Field(default_factory=list)
    memories_used: List[MemoryItem] = Field(default_factory=list)
    tool_calls: List[ToolCall] = Field(default_factory=list)
    citations: List[Citation] = Field(default_factory=list)
    study_resources: List[StudyResource] = Field(default_factory=list)
    analytics: AnalyticsSnapshot
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class QuestionAnalysis(BaseModel):
    subject: SubjectArea
    topic: str
    sub_topic: str = ""
    grade_level: GradeBand = GradeBand.unknown
    difficulty: DifficultyLevel = DifficultyLevel.balanced
    question_type: QuestionType = QuestionType.explanation
    confidence: float = Field(default=0.5, ge=0, le=1)
    keywords: List[str] = Field(default_factory=list)
    requires_freshness_check: bool = False
    reasoning_signals: List[str] = Field(default_factory=list)


class PatternMatch(BaseModel):
    id: str
    subject: SubjectArea
    topic: str
    solution_pattern: str
    teaching_pattern: str
    difficulty: DifficultyLevel = DifficultyLevel.balanced
    success_score: float = Field(default=0.5, ge=0, le=1)
    similarity: float = Field(default=0.0, ge=0, le=1)
    relevance_score: float = Field(default=0.0, ge=0, le=1)
    examples: List[str] = Field(default_factory=list)


class KnowledgeConfidence(BaseModel):
    confidence_score: float = Field(default=0.5, ge=0, le=1)
    requires_additional_knowledge: bool = False
    reason: str = ""


class RetrievedKnowledge(BaseModel):
    internal_notes: List[str] = Field(default_factory=list)
    previous_patterns: List[PatternMatch] = Field(default_factory=list)
    memory_summary: str = ""
    search_summary: str = ""
    sources: List[Citation] = Field(default_factory=list)


class MergedKnowledge(BaseModel):
    merged_knowledge: str = ""
    source_confidence: float = Field(default=0.5, ge=0, le=1)
    recommended_teaching_strategy: str = ""
    sources: List[Citation] = Field(default_factory=list)


class TeachingFeedbackRequest(BaseModel):
    user_id: str = "guest"
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None
    prompt: str
    answer: str = ""
    feedback_type: Literal["understood", "simpler", "examples", "confused", "up", "down"]
    analysis: Optional[QuestionAnalysis] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TeachingFeedbackResponse(BaseModel):
    ok: bool = True
    success_score: float = Field(default=0.5, ge=0, le=1)
    followup: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StreamEvent(BaseModel):
    stage: ResponseStage
    message: str
    delta: str = ""
    done: bool = False
    payload: Dict[str, Any] = Field(default_factory=dict)
