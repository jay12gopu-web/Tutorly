from __future__ import annotations

import asyncio
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.activity_store import ActivityStore, _ai_status, _feedback_type
from backend.chatbot import routes
from backend.chatbot.schemas import ChatbotRequest, TeachingFeedbackRequest


class FakeActivityStore:
    def __init__(self) -> None:
        self.chats: list[dict] = []
        self.feedback: list[dict] = []
        self.failures: list[dict] = []

    def record_chat(self, **payload):
        self.chats.append(payload)
        return "chat_persistence_test"

    def record_feedback(self, **payload):
        self.feedback.append(payload)
        return "feedback_persistence_test"

    def record_failure(self, **payload):
        self.failures.append(payload)


async def run() -> None:
    assert ActivityStore("").configured is False
    assert _ai_status("generated") == "success"
    assert _ai_status("timeout") == "failed"
    assert _feedback_type("up") == "positive"
    assert _feedback_type("down") == "negative"

    fake = FakeActivityStore()
    routes.activity_store = fake
    response = await routes.respond(ChatbotRequest(
        user_id="student_persistence_test",
        conversation_id="conversation_persistence_test",
        message="2 + 2",
    ))
    assert response.metadata["activity_chat_id"] == "chat_persistence_test"
    assert fake.chats[0]["question"] == "2 + 2"
    assert fake.chats[0]["user_id"] == "student_persistence_test"
    assert fake.chats[0]["endpoint"] == "/api/chat"

    feedback = await routes.feedback(TeachingFeedbackRequest(
        user_id="student_persistence_test",
        conversation_id="conversation_persistence_test",
        message_id="assistant_message_test",
        prompt="2 + 2",
        answer="4",
        feedback_type="up",
        metadata={"activity_chat_id": "chat_persistence_test"},
    ))
    assert feedback.ok is True
    assert fake.feedback[0]["chat_id"] == "chat_persistence_test"


if __name__ == "__main__":
    asyncio.run(run())
    print("Tutorly activity persistence smoke tests passed.")
