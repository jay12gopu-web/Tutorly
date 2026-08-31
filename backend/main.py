from __future__ import annotations

import logging
import os
import sqlite3
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

STARTUP_LOGGER = logging.getLogger("tutorly.startup")
REQUIRED_PROVIDER_KEYS = {
    "SARVAM_API_KEY": "Sarvam Vision homework-image reading",
    "ELEVENLABS_API_KEY": "ElevenLabs secure Voice Chat",
}


def missing_provider_keys() -> tuple[str, ...]:
    return tuple(name for name in REQUIRED_PROVIDER_KEYS if not os.getenv(name, "").strip())

try:
    from backend.auth_routes import router as auth_router
    from backend.curriculum_routes import router as curriculum_router
    from backend.chatbot.routes import (
        enforce_chat_rate_limit,
        orchestrator as chatbot_orchestrator,
        router as chatbot_router,
    )
    from backend.chatbot.schemas import ChatbotRequest, TeachingFeedbackRequest
    from backend.chatbot.teaching_success import TeachingSuccessScore
except ImportError:
    from auth_routes import router as auth_router
    from curriculum_routes import router as curriculum_router
    from chatbot.routes import enforce_chat_rate_limit, orchestrator as chatbot_orchestrator, router as chatbot_router
    from chatbot.schemas import ChatbotRequest, TeachingFeedbackRequest
    from chatbot.teaching_success import TeachingSuccessScore


app = FastAPI(title="Tutorly")
app.include_router(chatbot_router)
app.include_router(auth_router)
app.include_router(curriculum_router)
teaching_success_engine = TeachingSuccessScore()


@app.on_event("startup")
async def report_missing_provider_keys() -> None:
    for variable_name in missing_provider_keys():
        STARTUP_LOGGER.error(
            "Tutorly backend configuration is missing %s; %s is unavailable until it is set in the backend environment.",
            variable_name,
            REQUIRED_PROVIDER_KEYS[variable_name],
        )

UPLOAD_DIR = PROJECT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

DEFAULT_ALLOWED_ORIGINS = (
    "https://mytutor.co.in",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8765",
    "http://127.0.0.1:8769",
    "http://127.0.0.1:8770",
)
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "TUTORLY_ALLOWED_ORIGINS",
        ",".join(DEFAULT_ALLOWED_ORIGINS),
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


class LegacyChatRequest(BaseModel):
    userId: str | None = None
    user_id: str | None = None
    message: str
    model: str | None = "prime"
    mode: str | None = None
    conversationId: str | None = None
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
    extension = Path(original_name).suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
        extension = {
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/bmp": ".bmp",
        }.get(content_type, ".jpg")

    filename = f"{uuid.uuid4().hex}{extension}"
    (UPLOAD_DIR / filename).write_bytes(body)
    return {"url": f"/uploads/{filename}", "filename": filename}


def save_chat(user_id: str, question: str, answer: str, subject: str) -> None:
    with sqlite3.connect(PROJECT_DIR / "tutor.db") as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                subject TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO chat_history (user_id, question, answer, subject, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            """,
            (user_id, question, answer, subject),
        )


@app.post("/chat")
async def legacy_chat(request: LegacyChatRequest):
    """Compatibility bridge; the browser uses POST /api/chat."""
    user_id = request.userId or request.user_id or "student_browser"
    mode = (request.model or request.mode or "prime").strip().lower()
    valid_modes = {"spark", "prime", "lens", "deep", "research", "creative", "coding", "study"}
    if mode not in valid_modes:
        mode = "prime"

    tutor_request = ChatbotRequest(
        user_id=user_id,
        conversation_id=request.conversationId,
        message=request.message,
        mode=mode,
        client_context={
            "source": "legacy-/chat",
            "adaptiveContext": request.adaptiveContext or request.client_context or {},
        },
    )

    enforce_chat_rate_limit(tutor_request)
    try:
        response = await chatbot_orchestrator.respond(tutor_request)
    except HTTPException:
        raise
    except Exception as error:
        print(f"[Tutorly][legacy-chat] semantic bridge failed type={type(error).__name__}")
        raise HTTPException(
            status_code=503,
            detail="I couldn't process that question properly. Please try again.",
        ) from None

    subject = getattr(response.subject, "value", str(response.subject))
    save_chat(user_id, request.message, response.answer, subject)
    payload = response.model_dump()
    payload.update({
        "error": False,
        "response": response.answer,
        "legacy_bridge": True,
    })
    return payload


@app.options("/chat")
def legacy_chat_options():
    return {
        "status": "ok",
        "endpoint": "/chat",
        "modern_endpoint": "/api/chat",
        "allowed_methods": ["GET", "POST", "OPTIONS"],
    }


@app.get("/chat")
def legacy_chat_info():
    return {
        "status": "ok",
        "endpoint": "/chat",
        "required_method": "POST",
        "modern_endpoint": "/api/chat",
    }


@app.post("/chat-feedback")
def chat_feedback(request: TeachingFeedbackRequest):
    return teaching_success_engine.record(request).model_dump()
