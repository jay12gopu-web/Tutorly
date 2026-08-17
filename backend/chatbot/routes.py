from __future__ import annotations

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from .orchestrator import ChatbotOrchestrator
from .schemas import ChatbotRequest, ResponseStage, StreamEvent, TeachingFeedbackRequest
from .teaching_success import TeachingSuccessScore


router = APIRouter(prefix="/api/chatbot", tags=["Tutorly Chatbot"])
orchestrator = ChatbotOrchestrator()
teaching_success = TeachingSuccessScore(analyzer=orchestrator.analyzer, patterns=orchestrator.patterns)


@router.get("/health")
async def chatbot_health() -> dict:
    return {
        "status": "ok",
        "service": "tutorly-chatbot",
        "modes": [strategy.mode.value for strategy in orchestrator.modes.all()],
    }


@router.options("/respond")
async def respond_options() -> dict:
    return {
        "status": "ok",
        "endpoint": "/api/chatbot/respond",
        "allowed_methods": ["POST", "OPTIONS"]
    }
@router.post("/respond")
async def respond(request: ChatbotRequest):
    return await orchestrator.respond(request)


@router.post("/feedback")
async def feedback(request: TeachingFeedbackRequest):
    return teaching_success.record(request)


@router.post("/stream")
async def stream(request: ChatbotRequest):
    async def event_source():
        async for event in orchestrator.stream(request):
            yield f"data: {event.json()}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.websocket("/ws")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_text()
            try:
                request = ChatbotRequest.parse_raw(payload)
            except Exception as error:
                event = StreamEvent(stage=ResponseStage.error, message=f"Invalid request: {error}", done=True)
                await websocket.send_text(event.json())
                continue

            async for event in orchestrator.stream(request):
                await websocket.send_text(event.json())
    except WebSocketDisconnect:
        return
    except Exception as error:
        await websocket.send_text(json.dumps({
            "stage": "error",
            "message": str(error),
            "done": True,
            "payload": {},
        }))

