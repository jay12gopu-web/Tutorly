from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
import sqlite3
from groq import Groq
from dotenv import load_dotenv
import os
import re
import uuid
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

try:
    from backend.chatbot.routes import router as chatbot_router, orchestrator as chatbot_orchestrator
    from backend.chatbot.knowledge_router import SmartKnowledgeRouter
    from backend.chatbot.adaptive_teaching_engine import AdaptiveTeachingEngine
    from backend.chatbot.knowledge_confidence_engine import KnowledgeConfidenceEngine
    from backend.chatbot.knowledge_merge_engine import KnowledgeMergeEngine
    from backend.chatbot.pattern_matching_engine import PatternMatchingEngine
    from backend.chatbot.practice_generator import PracticeGenerator
    from backend.chatbot.question_analyzer import QuestionAnalyzer
    from backend.chatbot.schemas import ChatbotRequest, RetrievedKnowledge, TeachingFeedbackRequest
    from backend.chatbot.teaching_success import TeachingSuccessScore
except Exception:
    from chatbot.routes import router as chatbot_router, orchestrator as chatbot_orchestrator
    from chatbot.knowledge_router import SmartKnowledgeRouter
    from chatbot.adaptive_teaching_engine import AdaptiveTeachingEngine
    from chatbot.knowledge_confidence_engine import KnowledgeConfidenceEngine
    from chatbot.knowledge_merge_engine import KnowledgeMergeEngine
    from chatbot.pattern_matching_engine import PatternMatchingEngine
    from chatbot.practice_generator import PracticeGenerator
    from chatbot.question_analyzer import QuestionAnalyzer
    from chatbot.schemas import ChatbotRequest, RetrievedKnowledge, TeachingFeedbackRequest
    from chatbot.teaching_success import TeachingSuccessScore

GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def mask_secret(value):
    if not value:
        return "missing"
    if len(value) <= 10:
        return "configured"
    return f"{value[:4]}...{value[-4:]}"

print(
    "[Tutorly][startup] Groq config loaded "
    f"model={GROQ_MODEL} "
    f"key_configured={bool(GROQ_API_KEY)} "
    f"key={mask_secret(GROQ_API_KEY)}"
)

app = FastAPI()
app.include_router(chatbot_router)
knowledge_router = SmartKnowledgeRouter()
question_analyzer = QuestionAnalyzer()
pattern_engine = PatternMatchingEngine()
confidence_engine = KnowledgeConfidenceEngine()
knowledge_merge_engine = KnowledgeMergeEngine()
adaptive_teaching_engine = AdaptiveTeachingEngine()
practice_generator = PracticeGenerator()
teaching_success_engine = TeachingSuccessScore(analyzer=question_analyzer, patterns=pattern_engine)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# âœ… CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ðŸ” Groq Client
client = Groq(
    api_key=GROQ_API_KEY
)

LIMIT = 30
COOLDOWN_DAYS = 2

# ðŸ§  Temporary memory
users_db = {}

# -----------------------
# ðŸ“¦ Request Model
# -----------------------
class ChatRequest(BaseModel):
    userId: str | None = None
    user_id: str | None = None
    message: str
    model: str | None = "prime"
    mode: str | None = None
    adaptiveContext: dict | None = None
    client_context: dict | None = None

@app.post("/upload-image")
async def upload_image(request: Request):
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Unsupported file type")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty image detected")

    original_name = request.headers.get("x-filename", "")
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]:
        ext = {
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/bmp": ".bmp"
        }.get(content_type, ".jpg")

    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as buffer:
        buffer.write(body)

    return {
        "url": f"/uploads/{filename}",
        "filename": filename
    }

# -----------------------
# ðŸ‘¤ Get User
# -----------------------
def get_user(user_id):
    if user_id not in users_db:
        users_db[user_id] = {
            "question_count": 0,
            "limit_reached_at": None,
            "last_question": None,
            "last_answer": None
        }

    return users_db[user_id]

# -----------------------
# ðŸ”’ Limit Check
# -----------------------
def check_limit(user):
    now = datetime.now()

    if user["question_count"] >= LIMIT:

        if not user["limit_reached_at"]:
            user["limit_reached_at"] = now
            return {
                "blocked": True,
                "msg": "ðŸš« Limit reached. Time for a study break ðŸ˜„"
            }

        diff = now - user["limit_reached_at"]

        if diff > timedelta(days=COOLDOWN_DAYS):
            user["question_count"] = 0
            user["limit_reached_at"] = None

            return {
                "blocked": False
            }

        return {
            "blocked": True,
            "msg": "â³ AI tutor is resting. Come back later."
        }

    return {
        "blocked": False
    }

# -----------------------
# ðŸ” Follow-up Detection
# -----------------------
def is_followup(text):
    t = re.sub(r"\s+", " ", (text or "").lower()).strip(" .?!")
    if not t:
        return False
    if len(t.split()) > 6:
        return False

    return any(re.fullmatch(pattern, t) for pattern in [
        r"explain better",
        r"explain again",
        r"simplify(?: it)?",
        r"huh+",
        r"i (?:do not|dont|did not|didnt) understand",
        r"again",
        r"what",
        r"come again",
        r"pardon me",
    ])

# -----------------------
# ðŸ§© Prompt Builder
# -----------------------
def build_prompt(
    message,
    user,
    classification=None,
    search_summary=None,
    analysis=None,
    pattern_matches=None,
    knowledge_confidence=None,
    merged_knowledge=None,
):

    if is_followup(message) and user["last_question"]:

        return f"""
Explain this more simply.

Question:
{user['last_question']}

Previous answer:
{user['last_answer']}

Keep it beginner friendly.
"""

    if analysis and merged_knowledge:
        search_required = bool(classification and classification.requires_search)
        base_prompt = adaptive_teaching_engine.system_prompt(
            analysis,
            merged_knowledge,
            search_required=search_required,
        )
        sources = search_summary.sources_markdown() if search_summary else "No live sources used."
        return f"""
{base_prompt}

Student question:
{message}

Routing decision:
- requiresSearch: {str(search_required).lower()}
- category: {classification.category if classification else analysis.subject.value}
- confidence: {classification.confidence if classification else analysis.confidence}

Knowledge confidence:
- score: {knowledge_confidence.confidence_score if knowledge_confidence else analysis.confidence}
- reason: {knowledge_confidence.reason if knowledge_confidence else "Analyzer confidence only."}

Pattern memory:
{format_pattern_matches(pattern_matches or [])}

Live sources:
{sources}

Now answer the student's exact question using the required Tutorly teaching structure.
"""

    if classification and classification.requires_search:
        sources = search_summary.sources_markdown() if search_summary else "No sources available."
        live_summary = search_summary.summary if search_summary else "No live search summary was available."
        return f"""
You are Tutorly AI, an expert teacher for students.

The student's question requires current or recent information.

Question:
{message}

Routing decision:
- requiresSearch: true
- category: {classification.category}
- confidence: {classification.confidence}

Search knowledge summary:
{live_summary}

Instructions:
- Do not dump raw search results.
- Use the search knowledge to produce a clear educational answer.
- If sources are missing or search is unavailable, say that current verification is needed.
- Keep the answer student-friendly and accurate.
- Use markdown.

Answer using this structure:
### Understanding the Question
Explain what the student is asking.

### Background
Give short context.

### Main Answer
Answer clearly.

### Explanation
Explain it in simple terms.

### Key Takeaways
Summarize the important points.

### Sources
Use these sources:
{sources}
"""

    return f"""
You are Tutorly AI, an expert teacher for students.

Question:
{message}

Routing decision:
- requiresSearch: false
- category: {classification.category if classification else "General Education"}
- confidence: {classification.confidence if classification else 0.7}

Instructions:
- Do not behave like a generic chatbot.
- Teach like a patient private tutor.
- Explain clearly and use markdown.
- Never search or mention web search for stable academic questions.
- If math, show formulas before using them, substitutions, calculations, and verification.
- If science, explain the concept first, connect it to real life, and add a memory trick when useful.
- If English grammar, explain the rule and why the answer is correct.
- If English literature, include evidence and exam-style phrasing.
- If social studies, connect cause and effect; use timeline/map context when relevant.
- Be encouraging and age-appropriate.

Use this structure for academic answers:
### 1. Understand the Question
### 2. Identify Given Information
### 3. Concept or Rule
### 4. Step-by-Step Solution
### 5. Final Answer
### 6. Why This Works
### 7. Common Mistakes
### 8. Practice Question
"""

def format_pattern_matches(pattern_matches):
    if not pattern_matches:
        return "No strong previous teaching pattern matched."
    lines = []
    for index, match in enumerate(pattern_matches[:3], start=1):
        lines.append(
            f"{index}. {match.topic} | similarity {match.similarity:.2f} | "
            f"success {match.success_score:.2f} | strategy: {match.teaching_pattern}"
        )
    return "\n".join(lines)


# -----------------------
# ðŸ¤– AI Response
# -----------------------
def build_search_not_configured_answer(message, classification, search_summary=None):
    provider = search_summary.provider if search_summary else knowledge_router.provider.name
    return f"""
### Understanding the Question
You are asking for current or recent information, so Tutorly must check Google/search results before answering.

### Search Status
Google Search is not configured yet, or it returned no usable results.

### Main Answer
I cannot answer this from memory because it may be outdated. Please configure Google Search for Tutorly, then ask again.

### What To Configure
- `TUTORLY_SEARCH_PROVIDER=google`
- `GOOGLE_SEARCH_API_KEY`
- `GOOGLE_SEARCH_ENGINE_ID`

### Why This Matters
Questions like this can change daily, so Tutorly should verify them with live Google results instead of guessing.

### Routing
- requiresSearch: true
- category: {classification.category}
- provider: {provider}
""".strip()


def get_ai_response(prompt):

    try:
        print(
            "[Tutorly][chat] Groq request sent "
            f"model={GROQ_MODEL} prompt_chars={len(prompt)}"
        )

        res = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        answer = res.choices[0].message.content
        print(
            "[Tutorly][chat] Groq response received "
            f"model={GROQ_MODEL} answer_chars={len(answer or '')}"
        )
        return answer

    except Exception as e:
        print(
            "[Tutorly][chat] Groq exception returned "
            f"type={type(e).__name__} message={e}"
        )
        return "âš  Error generating response"

# -----------------------
# ðŸ’¾ Save Chat
# -----------------------
def build_adaptive_context(message, classification, search_summary=None):
    analysis = question_analyzer.analyze(message)
    pattern_matches = pattern_engine.find_similar(message, analysis)
    knowledge_confidence = confidence_engine.assess(analysis, pattern_matches)
    retrieved = RetrievedKnowledge(
        internal_notes=[
            "Use Tutorly's strict teaching format.",
            "Generate a relevant practice question after the answer.",
        ],
        previous_patterns=pattern_matches,
        memory_summary=user_memory_preview(message),
        search_summary=search_summary.summary if search_summary else "",
    )
    merged_knowledge = knowledge_merge_engine.merge(analysis, retrieved, knowledge_confidence)
    return analysis, pattern_matches, knowledge_confidence, merged_knowledge


def user_memory_preview(message):
    words = " ".join(str(message or "").split()[:18])
    return words or "No previous context."


def validated_ai_answer(prompt, message, analysis, merged_knowledge):
    answer = get_ai_response(prompt)  # initial model answer before quality validation
    issues = adaptive_teaching_engine.validate_answer(answer, message, analysis)
    if not issues:
        return answer, {"status": "passed", "issues": [], "fallbackUsed": False, "regenerated": False}

    print(f"[Tutorly][quality] Regenerating answer due to issues={issues}")
    repair_prompt = adaptive_teaching_engine.repair_prompt(prompt, answer, issues)
    repaired = get_ai_response(repair_prompt)
    repair_issues = adaptive_teaching_engine.validate_answer(repaired, message, analysis)
    if not repair_issues:
        return repaired, {
            "status": "passed_after_regeneration",
            "issues": issues,
            "fallbackUsed": False,
            "regenerated": True,
        }

    print("[Tutorly][quality] Falling back to structured local teaching answer")
    return adaptive_teaching_engine.fallback_teaching_answer(message, analysis, merged_knowledge), {
        "status": "fallback_used",
        "issues": issues + repair_issues,
        "fallbackUsed": True,
        "regenerated": True,
    }


def save_chat(user_id, question, answer, subject):

    conn = sqlite3.connect("tutor.db")
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        subject TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    INSERT INTO chat_history
    (user_id, question, answer, subject, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    """, (user_id, question, answer, subject))

    conn.commit()
    conn.close()


def build_chat_diagnostics(
    *,
    classification,
    analysis,
    pattern_matches,
    knowledge_confidence,
    merged_knowledge,
    search_summary,
    validation=None,
):
    template = "General"
    if analysis.subject.value in {"physics", "chemistry", "biology"}:
        template = "Science"
    elif analysis.subject.value == "mathematics":
        template = "Mathematics"
    elif analysis.subject.value == "english":
        template = "English"
    elif analysis.subject.value in {"history", "geography", "civics", "economics"}:
        template = "Social Studies"

    return {
        "subject": analysis.subject.value,
        "topic": analysis.topic,
        "subtopic": analysis.sub_topic,
        "difficulty": analysis.difficulty.value,
        "questionType": analysis.question_type.value,
        "confidenceScore": analysis.confidence,
        "router": classification.as_dict(),
        "patternMatch": bool(pattern_matches),
        "patterns": [
            {
                "id": match.id,
                "subject": match.subject.value,
                "topic": match.topic,
                "similarity": match.similarity,
                "relevanceScore": match.relevance_score,
                "successScore": match.success_score,
            }
            for match in pattern_matches
        ],
        "knowledgeConfidence": knowledge_confidence.dict(),
        "search": {
            "triggered": bool(classification.requires_search),
            "provider": search_summary.provider if search_summary else None,
            "resultsFound": len(search_summary.results) if search_summary else 0,
            "sourceCount": len(search_summary.results) if search_summary else 0,
            "searchTimeMs": search_summary.search_time_ms if search_summary else 0,
            "warning": search_summary.warning if search_summary else "",
        },
        "internalKnowledgeUsed": True,
        "patternMemoryUsed": bool(pattern_matches),
        "teachingStrategy": merged_knowledge.recommended_teaching_strategy,
        "templateUsed": template,
        "validation": validation or {
            "status": "not_run",
            "issues": [],
            "fallbackUsed": False,
            "regenerated": False,
        },
    }

# -----------------------
# Chat Route (legacy bridge to TutorEngine)
# -----------------------
@app.post("/chat")
async def chat(req: ChatRequest):
    user_id = req.userId or req.user_id or "student_browser"
    adaptive_context = req.adaptiveContext or req.client_context or {}
    print(
        "[Tutorly][chat] Legacy /chat received request "
        f"userId={user_id} message_chars={len(req.message or '')} "
        "forwarding_to=TutorEngine"
    )

    user = get_user(user_id)
    limit = check_limit(user)
    if limit["blocked"]:
        return {
            "error": True,
            "message": limit["msg"]
        }

    mode = (req.model or req.mode or "prime").strip().lower()
    valid_modes = {"spark", "prime", "lens", "deep", "research", "creative", "coding", "study"}
    if mode not in valid_modes:
        mode = "prime"

    tutor_request = ChatbotRequest(
        user_id=user_id,
        message=req.message,
        mode=mode,
        client_context={
            "source": "legacy-/chat",
            "legacy_endpoint": True,
            "adaptiveContext": adaptive_context,
        },
    )

    try:
        tutor_response = await chatbot_orchestrator.respond(tutor_request)
    except Exception as error:
        print("[Tutorly][chat] TutorEngine bridge failed", repr(error))
        raise HTTPException(status_code=500, detail=f"TutorEngine failed: {error}")

    answer = tutor_response.answer
    subject = getattr(tutor_response.subject, "value", str(tutor_response.subject))

    save_chat(user_id, req.message, answer, subject)
    if not is_followup(req.message):
        user["last_question"] = req.message
    user["last_answer"] = answer
    user["question_count"] += 1

    payload = tutor_response.dict()
    payload.update({
        "error": False,
        "answer": answer,
        "response": answer,
        "questions_left": LIMIT - user["question_count"],
        "legacy_bridge": True,
    })
    return payload

@app.options("/chat")
def chat_options():
    return {
        "status": "ok",
        "endpoint": "/chat",
        "allowed_methods": ["GET", "POST", "OPTIONS"],
        "modern_endpoint": "/api/chatbot/respond"
    }
@app.get("/chat")
def chat_route_info():
    return {
        "status": "ok",
        "endpoint": "/chat",
        "required_method": "POST",
        "modern_endpoint": "/api/chatbot/respond",
        "message": "Send JSON with userId, message, and optional model. The frontend should prefer /api/chatbot/respond."
    }

@app.post("/chat-feedback")
def chat_feedback(req: TeachingFeedbackRequest):
    result = teaching_success_engine.record(req)
    return result.dict()


