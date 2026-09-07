from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.activity_store import ActivityStore, observability_store


def main() -> None:
    captured: list[dict] = []
    original = observability_store.record_provider
    observability_store.record_provider = lambda **values: captured.append(values)
    try:
        store = ActivityStore()
        request_id = store.record_chat(
            user_id="private-student-id",
            grade="10",
            question="private homework question",
            answer="private tutor answer",
            subject="mathematics",
            mode="prime",
            provider="groq",
            model="provider-model",
            provider_status="generated",
            latency_ms=180,
        )
        assert request_id.startswith("req_")
        serialized = str(captured)
        assert "private-student-id" not in serialized
        assert "private homework question" not in serialized
        assert "private tutor answer" not in serialized
        assert "provider-model" not in serialized
        assert captured[0] == {
            "provider": "groq",
            "operation": "chat_completion",
            "status": "success",
            "latency_ms": 180,
            "error_code": None,
        }
        feedback_id = store.record_feedback(user_id="private-student-id", feedback_type="up")
        assert feedback_id.startswith("feedback_")
        assert len(captured) == 1
    finally:
        observability_store.record_provider = original

    print("Tutorly anonymous operational persistence and private-content exclusion checks passed.")


if __name__ == "__main__":
    main()
