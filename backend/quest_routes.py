from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

try:
    from backend import auth_routes
    from backend.quest_service import QuestService
except ImportError:
    import auth_routes
    from quest_service import QuestService


router = APIRouter(prefix="/api/quests", tags=["quests"])


class LearningEventRequest(BaseModel):
    event_type: str = Field(min_length=3, max_length=80)
    event_id: str = Field(min_length=6, max_length=180)
    metadata: dict[str, Any] = Field(default_factory=dict)


class LearningEventBatchRequest(BaseModel):
    events: list[LearningEventRequest] = Field(min_length=1, max_length=50)


def _service() -> QuestService:
    return QuestService(auth_routes.DATABASE_PATH)


def _user_id(authorization: str | None) -> int:
    return int(auth_routes.authenticated_user_context(authorization)["id"])


@router.get("")
def get_quests(authorization: str | None = Header(default=None)):
    return _service().snapshot(_user_id(authorization))


@router.post("/events")
def record_learning_event(
    payload: LearningEventRequest,
    authorization: str | None = Header(default=None),
):
    try:
        return _service().record_events(_user_id(authorization), [payload.model_dump()])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/events/batch")
def record_learning_events(
    payload: LearningEventBatchRequest,
    authorization: str | None = Header(default=None),
):
    try:
        return _service().record_events(
            _user_id(authorization),
            [event.model_dump() for event in payload.events],
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
