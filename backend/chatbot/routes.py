from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from .orchestrator import ChatbotOrchestrator
from .rate_limit import SlidingWindowRateLimiter
from .schemas import ChatbotRequest, ResponseStage, StreamEvent, TeachingFeedbackRequest
from .teaching_success import TeachingSuccessScore


router = APIRouter(prefix="/api", tags=["Tutorly Chatbot"])
orchestrator = ChatbotOrchestrator()
teaching_success = TeachingSuccessScore()
chat_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=15, requests_per_hour=150)


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
    }


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
    enforce_chat_rate_limit(request)
    try:
        return await orchestrator.respond(request)
    except HTTPException:
        raise
    except Exception as error:
        print(f"[Tutorly][semantic-chat] unexpected failure type={type(error).__name__}")
        raise HTTPException(
            status_code=503,
            detail="I couldn't process that question properly. Please try again.",
        ) from None


@router.post("/chatbot/feedback")
async def feedback(request: TeachingFeedbackRequest):
    return teaching_success.record(request)


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
