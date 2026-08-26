from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from time import perf_counter

import httpx
from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

try:
    from backend.activity_store import activity_store
    from backend.auth_routes import authenticated_user_context
except ImportError:
    from activity_store import activity_store
    from auth_routes import authenticated_user_context

from .orchestrator import ChatbotOrchestrator
from .rate_limit import SlidingWindowRateLimiter
from .schemas import ChatbotRequest, ResponseStage, StreamEvent, TeachingFeedbackRequest
from .teaching_success import TeachingSuccessScore


router = APIRouter(prefix="/api", tags=["Tutorly Chatbot"])
orchestrator = ChatbotOrchestrator()
teaching_success = TeachingSuccessScore()
chat_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=15, requests_per_hour=150)
voice_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=20, requests_per_hour=180)
voice_session_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=8, requests_per_hour=60)
LOGGER = logging.getLogger("tutorly.voice")

_VOICE_MIME_TYPES = {
    "audio/flac": ".flac",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".mp4",
    "audio/mp4a-latm": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "video/webm": ".webm",
}
_VOICE_EXTENSIONS = {".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm"}
_MAX_VOICE_BYTES = 10 * 1024 * 1024
_ELEVENLABS_TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token"


def _rate_limit_key(request: ChatbotRequest) -> str:
    user = (request.user_id or "guest").strip()[:120]
    conversation = (request.conversation_id or "new").strip()[:120]
    return f"{user}:{conversation}"


def enforce_chat_rate_limit(request: ChatbotRequest) -> None:
    decision = chat_rate_limiter.check(_rate_limit_key(request))
    if decision.allowed:
        return
    raise HTTPException(
        status_code=429,
        detail="You're sending questions a little too quickly. Please wait a moment and try again.",
        headers={"Retry-After": str(decision.retry_after_seconds)},
    )


@router.get("/chatbot/health")
async def chatbot_health() -> dict:
    provider = orchestrator.semantic_tutor.provider
    return {
        "status": "ok",
        "service": "tutorly-semantic-chatbot",
        "provider": provider.name,
        "model": provider.model,
        "provider_configured": provider.configured,
        "routing": "semantic_llm",
        "modes": [strategy.mode.value for strategy in orchestrator.modes.all()],
        "transcription": "groq_whisper",
    }


def _elevenlabs_configuration() -> tuple[str, str]:
    return (
        os.getenv("ELEVENLABS_API_KEY", "").strip(),
        os.getenv("ELEVENLABS_AGENT_ID", "").strip(),
    )


@router.get("/voice/config")
async def voice_configuration() -> dict:
    api_key, agent_id = _elevenlabs_configuration()
    return {
        "enabled": bool(api_key and agent_id),
        "provider": "elevenlabs" if api_key and agent_id else "tutorly",
        "transport": "webrtc" if api_key and agent_id else "existing_voice_pipeline",
    }


@router.post("/voice/session")
async def create_voice_session(
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Issue a short-lived ElevenLabs WebRTC token without exposing provider secrets."""
    account = authenticated_user_context(authorization)
    client_host = request.client.host if request.client else "unknown"
    limit_key = f"{client_host}:user-{account['id']}"
    decision = voice_session_rate_limiter.check(limit_key)
    if not decision.allowed:
        raise HTTPException(
            status_code=429,
            detail="Voice Chat is busy for a moment. Please wait and try again.",
            headers={"Retry-After": str(decision.retry_after_seconds)},
        )

    api_key, agent_id = _elevenlabs_configuration()
    if not api_key or not agent_id:
        raise HTTPException(status_code=503, detail="Live Voice Chat is temporarily unavailable.")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0)) as client:
            response = await client.get(
                _ELEVENLABS_TOKEN_URL,
                params={
                    "agent_id": agent_id,
                    "environment": os.getenv("ELEVENLABS_ENVIRONMENT", "production").strip() or "production",
                    "participant_name": f"tutorly_user_{account['id']}",
                },
                headers={"xi-api-key": api_key, "Accept": "application/json"},
            )
    except httpx.TimeoutException:
        LOGGER.warning("ElevenLabs token request failed category=timeout user_id=%s", account["id"])
        raise HTTPException(status_code=504, detail="Live Voice Chat took too long to start. Please try again.") from None
    except httpx.HTTPError:
        LOGGER.warning("ElevenLabs token request failed category=network user_id=%s", account["id"])
        raise HTTPException(status_code=502, detail="Live Voice Chat couldn't start. Please try again.") from None

    if response.status_code == 429:
        LOGGER.warning("ElevenLabs token request rejected category=rate_limit user_id=%s", account["id"])
        raise HTTPException(status_code=429, detail="Live Voice Chat is busy for a moment. Please try again shortly.")
    if not response.is_success:
        LOGGER.warning(
            "ElevenLabs token request rejected category=provider status=%s user_id=%s",
            response.status_code,
            account["id"],
        )
        raise HTTPException(status_code=502, detail="Live Voice Chat couldn't start. Please try again.")

    try:
        payload = response.json()
    except (TypeError, ValueError):
        payload = {}
    token = str(payload.get("token") or "").strip() if isinstance(payload, dict) else ""
    conversation_id = str(payload.get("conversation_id") or "").strip() if isinstance(payload, dict) else ""
    if not token or len(token) > 20_000:
        LOGGER.warning("ElevenLabs token response rejected category=invalid_payload user_id=%s", account["id"])
        raise HTTPException(status_code=502, detail="Live Voice Chat couldn't start. Please try again.")

    return {
        "conversation_token": token,
        "conversation_id": conversation_id[:200],
        "provider": "elevenlabs",
        "transport": "webrtc",
    }


@router.post("/transcribe")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form("auto"),
    session_id: str = Form("guest"),
):
    provider = orchestrator.semantic_tutor.provider
    client_host = request.client.host if request.client else "unknown"
    limit_key = f"{client_host}:{(session_id or 'guest').strip()[:100]}"
    decision = voice_rate_limiter.check(limit_key)
    if not decision.allowed:
        raise HTTPException(
            status_code=429,
            detail="Voice is receiving too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(decision.retry_after_seconds)},
        )

    mime_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
    raw_filename = Path(audio.filename or "voice.webm").name
    suffix = Path(raw_filename).suffix.lower()
    if suffix not in _VOICE_EXTENSIONS:
        suffix = _VOICE_MIME_TYPES.get(mime_type, "")
    if mime_type not in _VOICE_MIME_TYPES or not suffix:
        raise HTTPException(status_code=400, detail="That audio format is not supported.")

    payload = await audio.read(_MAX_VOICE_BYTES + 1)
    await audio.close()
    if not payload:
        raise HTTPException(status_code=400, detail="I couldn't hear any audio. Please try again.")
    if len(payload) > _MAX_VOICE_BYTES:
        raise HTTPException(status_code=413, detail="That recording is too large. Please try a shorter question.")

    normalized_language = (language or "auto").strip().lower().split("-", 1)[0]
    if normalized_language == "auto":
        normalized_language = ""
    try:
        result = await provider.transcribe_audio(
            audio=payload,
            filename=f"voice{suffix}",
            mime_type=mime_type,
            language=normalized_language or None,
        )
    except Exception as error:
        status = getattr(error, "status", "transcription_failed")
        if status == "rate_limited":
            raise HTTPException(status_code=429, detail="Voice is temporarily busy. Please try again shortly.") from None
        if status == "timeout":
            raise HTTPException(status_code=504, detail="Voice transcription took too long. Please try again.") from None
        if status in {"not_configured", "authentication_failed", "transcription_unsupported"}:
            raise HTTPException(status_code=503, detail="Voice transcription is temporarily unavailable.") from None
        raise HTTPException(status_code=502, detail="I couldn't hear that clearly. Please try saying it again.") from None

    text = str(result.get("text") or "").replace("\x00", "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="I couldn't hear that clearly. Please try saying it again.")
    return {"text": text[:5000], "language": str(result.get("language") or normalized_language or "")[:12]}


@router.options("/chat")
@router.options("/chatbot/respond")
async def respond_options() -> dict:
    return {
        "status": "ok",
        "endpoint": "/api/chat",
        "compatibility_endpoint": "/api/chatbot/respond",
        "allowed_methods": ["POST", "OPTIONS"],
    }


@router.post("/chat")
@router.post("/chatbot/respond")
async def respond(request: ChatbotRequest):
    started = perf_counter()
    try:
        enforce_chat_rate_limit(request)
        response = await orchestrator.respond(request)
        generation = response.metadata.get("generation", {})
        chat_id = await asyncio.to_thread(
            activity_store.record_chat,
            user_id=request.user_id,
            grade=request.profile.grade if request.profile and request.profile.grade else "",
            question=request.message,
            answer=response.answer,
            subject=response.subject.value,
            mode=request.mode.value,
            provider=str(generation.get("provider") or "groq"),
            model=str(generation.get("model") or ""),
            provider_status=str(generation.get("status") or "unknown"),
            latency_ms=round((perf_counter() - started) * 1000),
            endpoint="/api/chat",
        )
        if chat_id:
            response.metadata["activity_chat_id"] = chat_id
        return response
    except HTTPException as error:
        await asyncio.to_thread(
            activity_store.record_failure,
            user_id=request.user_id,
            grade=request.profile.grade if request.profile and request.profile.grade else "",
            provider=orchestrator.semantic_tutor.provider.name,
            model=orchestrator.semantic_tutor.provider.model,
            error_code=f"HTTP_{error.status_code}",
            http_status=error.status_code,
            latency_ms=round((perf_counter() - started) * 1000),
            endpoint="/api/chat",
        )
        raise
    except Exception as error:
        print(f"[Tutorly][semantic-chat] unexpected failure type={type(error).__name__}")
        await asyncio.to_thread(
            activity_store.record_failure,
            user_id=request.user_id,
            grade=request.profile.grade if request.profile and request.profile.grade else "",
            provider=orchestrator.semantic_tutor.provider.name,
            model=orchestrator.semantic_tutor.provider.model,
            error_code="BACKEND_EXCEPTION",
            http_status=503,
            latency_ms=round((perf_counter() - started) * 1000),
            endpoint="/api/chat",
        )
        raise HTTPException(
            status_code=503,
            detail="I couldn't process that question properly. Please try again.",
        ) from None


@router.post("/chatbot/feedback")
async def feedback(request: TeachingFeedbackRequest):
    result = teaching_success.record(request)
    await asyncio.to_thread(
        activity_store.record_feedback,
        user_id=request.user_id,
        chat_id=str(request.metadata.get("activity_chat_id") or "") if isinstance(request.metadata, dict) else None,
        conversation_id=request.conversation_id,
        feedback_type=request.feedback_type,
    )
    return result


@router.post("/chatbot/stream")
async def stream(request: ChatbotRequest):
    enforce_chat_rate_limit(request)

    async def event_source():
        try:
            async for event in orchestrator.stream(request):
                yield f"data: {event.model_dump_json()}\n\n"
        except Exception as error:
            print(f"[Tutorly][semantic-stream] failure type={type(error).__name__}")
            safe = StreamEvent(
                stage=ResponseStage.error,
                message="I couldn't process that question properly. Please try again.",
                done=True,
            )
            yield f"data: {safe.model_dump_json()}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.websocket("/chatbot/ws")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_text()
            try:
                request = ChatbotRequest.model_validate_json(payload)
                enforce_chat_rate_limit(request)
            except HTTPException:
                event = StreamEvent(
                    stage=ResponseStage.error,
                    message="You're sending questions a little too quickly. Please wait a moment and try again.",
                    done=True,
                )
                await websocket.send_text(event.model_dump_json())
                continue
            except Exception:
                event = StreamEvent(
                    stage=ResponseStage.error,
                    message="That request was invalid. Please check the message and try again.",
                    done=True,
                )
                await websocket.send_text(event.model_dump_json())
                continue

            async for event in orchestrator.stream(request):
                await websocket.send_text(event.model_dump_json())
    except WebSocketDisconnect:
        return
    except Exception as error:
        print(f"[Tutorly][semantic-ws] failure type={type(error).__name__}")
        await websocket.send_text(json.dumps({
            "stage": "error",
            "message": "I couldn't process that question properly. Please try again.",
            "done": True,
            "payload": {},
        }))
