from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

PROJECT_DIR = Path(__file__).resolve().parents[1]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend import auth_routes, quest_routes


def main() -> None:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        database_path = Path(directory) / "quests.db"
        auth_routes.DATABASE_PATH = database_path
        os.environ["TUTORLY_OTP_SECRET"] = "test-only-secret-with-at-least-24-characters"

        app = FastAPI()
        app.include_router(auth_routes.router)
        app.include_router(quest_routes.router)
        client = TestClient(app)

        registered = client.post(
            "/api/auth/register",
            json={"full_name": "Quest Student", "email": "quests@example.com", "password": "strong-pass-123"},
        )
        assert registered.status_code == 200, registered.text
        headers = {"Authorization": f"Bearer {registered.json()['session_token']}"}

        unauthorized = client.get("/api/quests")
        assert unauthorized.status_code == 401

        initial = client.get("/api/quests", headers=headers)
        assert initial.status_code == 200, initial.text
        assert len(initial.json()["quests"]) == 6
        assert {quest["type"] for quest in initial.json()["quests"]} == {"daily", "weekly"}
        assert initial.json()["wallet"] == {"total_xp": 0, "weekly_xp": 0, "coins": 0}

        latest = None
        for index in range(8):
            latest = client.post(
                "/api/quests/events",
                headers=headers,
                json={
                    "event_type": "practice_question_correct",
                    "event_id": f"practice:session-1:question:{index}",
                    "metadata": {"subject": "Mathematics"},
                },
            )
            assert latest.status_code == 200, latest.text
        assert latest is not None
        question_sprint = next(quest for quest in latest.json()["quests"] if quest["id"] == "daily_question_sprint")
        assert question_sprint["current_progress"] == 8
        assert question_sprint["status"] == "completed"
        assert latest.json()["wallet"] == {"total_xp": 80, "weekly_xp": 80, "coins": 10}
        assert [item["id"] for item in latest.json()["newly_completed"]] == ["daily_question_sprint"]

        duplicate = client.post(
            "/api/quests/events",
            headers=headers,
            json={
                "event_type": "practice_question_correct",
                "event_id": "practice:session-1:question:7",
                "metadata": {},
            },
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["duplicate_events"] == 1
        assert duplicate.json()["newly_completed"] == []
        assert duplicate.json()["wallet"]["total_xp"] == 80

        session = client.post(
            "/api/quests/events/batch",
            headers=headers,
            json={
                "events": [
                    {
                        "event_type": "practice_session_completed",
                        "event_id": "practice:session-1:completed",
                        "metadata": {"score": 80},
                    },
                    {
                        "event_type": "topic_mastered",
                        "event_id": "mastery:test-1:algebra",
                        "metadata": {"topic": "Algebra"},
                    },
                ]
            },
        )
        assert session.status_code == 200, session.text
        assert session.json()["wallet"]["total_xp"] == 125
        assert session.json()["wallet"]["coins"] == 15

        invalid = client.post(
            "/api/quests/events",
            headers=headers,
            json={"event_type": "manual_complete", "event_id": "manual:quest:1", "metadata": {}},
        )
        assert invalid.status_code == 400

        with sqlite3.connect(database_path) as connection:
            rewards = connection.execute("SELECT COUNT(*) FROM tutorly_quest_rewards").fetchone()[0]
            events = connection.execute("SELECT COUNT(*) FROM tutorly_learning_events").fetchone()[0]
        assert rewards == 2
        assert events == 10
        client.close()

    print("Tutorly server-owned quest progress, event deduplication, and exactly-once rewards passed.")


if __name__ == "__main__":
    main()
