from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable


EVENT_TYPES = frozenset(
    {
        "practice_question_correct",
        "practice_session_completed",
        "test_completed",
        "lesson_completed",
        "topic_mastered",
        "weak_topic_improved",
    }
)

QUEST_DEFINITIONS = (
    {
        "id": "daily_question_sprint",
        "title": "Question Sprint",
        "description": "Get 8 practice questions correct.",
        "type": "daily",
        "target_event": "practice_question_correct",
        "target_amount": 8,
        "xp_reward": 80,
        "coin_reward": 10,
    },
    {
        "id": "daily_practice_habit",
        "title": "Practice Habit",
        "description": "Complete one practice session.",
        "type": "daily",
        "target_event": "practice_session_completed",
        "target_amount": 1,
        "xp_reward": 45,
        "coin_reward": 5,
    },
    {
        "id": "daily_lesson",
        "title": "Learn Something New",
        "description": "Complete one lesson.",
        "type": "daily",
        "target_event": "lesson_completed",
        "target_amount": 1,
        "xp_reward": 50,
        "coin_reward": 5,
    },
    {
        "id": "weekly_test_momentum",
        "title": "Test Momentum",
        "description": "Complete 3 chapter tests or exam challenges.",
        "type": "weekly",
        "target_event": "test_completed",
        "target_amount": 3,
        "xp_reward": 180,
        "coin_reward": 25,
    },
    {
        "id": "weekly_mastery_builder",
        "title": "Mastery Builder",
        "description": "Master 2 topics this week.",
        "type": "weekly",
        "target_event": "topic_mastered",
        "target_amount": 2,
        "xp_reward": 220,
        "coin_reward": 30,
    },
    {
        "id": "weekly_turn_it_around",
        "title": "Turn It Around",
        "description": "Improve 2 weak topics this week.",
        "type": "weekly",
        "target_event": "weak_topic_improved",
        "target_amount": 2,
        "xp_reward": 200,
        "coin_reward": 25,
    },
)

EVENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_\-.]{5,179}$")


class QuestService:
    """Server-authoritative quest progress and exactly-once reward ledger."""

    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path)

    def _connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        self._ensure_schema(connection)
        return connection

    @staticmethod
    def _ensure_schema(connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS tutorly_quest_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                quest_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                quest_type TEXT NOT NULL,
                target_event TEXT NOT NULL,
                target_amount INTEGER NOT NULL,
                current_progress INTEGER NOT NULL DEFAULT 0,
                xp_reward INTEGER NOT NULL DEFAULT 0,
                coin_reward INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                expires_at INTEGER NOT NULL,
                completed_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, quest_id, period_key),
                FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_quest_progress_user_period
                ON tutorly_quest_progress(user_id, expires_at DESC);

            CREATE TABLE IF NOT EXISTS tutorly_learning_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                event_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, event_id),
                FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_learning_events_user_type
                ON tutorly_learning_events(user_id, event_type, created_at DESC);

            CREATE TABLE IF NOT EXISTS tutorly_quest_rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                quest_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                xp_awarded INTEGER NOT NULL DEFAULT 0,
                coins_awarded INTEGER NOT NULL DEFAULT 0,
                awarded_at INTEGER NOT NULL,
                UNIQUE(user_id, quest_id, period_key),
                FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
            );

            CREATE TABLE IF NOT EXISTS tutorly_quest_wallets (
                user_id INTEGER PRIMARY KEY,
                total_xp INTEGER NOT NULL DEFAULT 0,
                weekly_xp INTEGER NOT NULL DEFAULT 0,
                weekly_period TEXT NOT NULL DEFAULT '',
                coins INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
            );
            """
        )

    @staticmethod
    def _period(quest_type: str, now: datetime) -> tuple[str, int]:
        if quest_type == "daily":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            return start.date().isoformat(), int(end.timestamp())
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        iso_year, iso_week, _ = start.isocalendar()
        return f"{iso_year}-W{iso_week:02d}", int(end.timestamp())

    def _sync_current_quests(self, connection: sqlite3.Connection, user_id: int, now: datetime) -> None:
        created_at = int(now.timestamp())
        for definition in QUEST_DEFINITIONS:
            period_key, expires_at = self._period(str(definition["type"]), now)
            connection.execute(
                """
                INSERT OR IGNORE INTO tutorly_quest_progress (
                    user_id, quest_id, period_key, title, description, quest_type,
                    target_event, target_amount, current_progress, xp_reward,
                    coin_reward, status, expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'active', ?, ?, ?)
                """,
                (
                    user_id,
                    definition["id"],
                    period_key,
                    definition["title"],
                    definition["description"],
                    definition["type"],
                    definition["target_event"],
                    definition["target_amount"],
                    definition["xp_reward"],
                    definition["coin_reward"],
                    expires_at,
                    created_at,
                    created_at,
                ),
            )
        weekly_period, _ = self._period("weekly", now)
        connection.execute(
            """
            INSERT OR IGNORE INTO tutorly_quest_wallets
                (user_id, total_xp, weekly_xp, weekly_period, coins, updated_at)
            VALUES (?, 0, 0, ?, 0, ?)
            """,
            (user_id, weekly_period, created_at),
        )
        connection.execute(
            """
            UPDATE tutorly_quest_wallets
            SET weekly_xp = 0, weekly_period = ?, updated_at = ?
            WHERE user_id = ? AND weekly_period <> ?
            """,
            (weekly_period, created_at, user_id, weekly_period),
        )

    @staticmethod
    def _iso_timestamp(value: int) -> str:
        return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")

    def _payload(self, connection: sqlite3.Connection, user_id: int, now: datetime) -> dict[str, Any]:
        rows = connection.execute(
            """
            SELECT * FROM tutorly_quest_progress
            WHERE user_id = ? AND expires_at > ?
            ORDER BY CASE quest_type WHEN 'daily' THEN 0 ELSE 1 END, id
            """,
            (user_id, int(now.timestamp())),
        ).fetchall()
        wallet = connection.execute(
            "SELECT total_xp, weekly_xp, coins FROM tutorly_quest_wallets WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return {
            "quests": [
                {
                    "id": str(row["quest_id"]),
                    "title": str(row["title"]),
                    "description": str(row["description"]),
                    "type": str(row["quest_type"]),
                    "target_event": str(row["target_event"]),
                    "target_amount": int(row["target_amount"]),
                    "current_progress": int(row["current_progress"]),
                    "xp_reward": int(row["xp_reward"]),
                    "coin_reward": int(row["coin_reward"]),
                    "status": str(row["status"]),
                    "expires_at": self._iso_timestamp(int(row["expires_at"])),
                }
                for row in rows
            ],
            "wallet": {
                "total_xp": int(wallet["total_xp"] if wallet else 0),
                "weekly_xp": int(wallet["weekly_xp"] if wallet else 0),
                "coins": int(wallet["coins"] if wallet else 0),
            },
        }

    def snapshot(self, user_id: int, now: datetime | None = None) -> dict[str, Any]:
        current = now or datetime.now(timezone.utc)
        with self._connection() as connection:
            self._sync_current_quests(connection, user_id, current)
            return self._payload(connection, user_id, current)

    @staticmethod
    def _clean_event(event: dict[str, Any]) -> tuple[str, str, str]:
        event_type = str(event.get("event_type") or "").strip().lower()
        event_id = str(event.get("event_id") or "").strip()
        if event_type not in EVENT_TYPES:
            raise ValueError("Unsupported learning event.")
        if not EVENT_ID_PATTERN.fullmatch(event_id):
            raise ValueError("Invalid learning event identifier.")
        metadata = event.get("metadata") or {}
        if not isinstance(metadata, dict):
            raise ValueError("Learning event metadata must be an object.")
        metadata_json = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        if len(metadata_json) > 4000:
            raise ValueError("Learning event metadata is too large.")
        return event_type, event_id, metadata_json

    def record_events(
        self,
        user_id: int,
        events: Iterable[dict[str, Any]],
        now: datetime | None = None,
    ) -> dict[str, Any]:
        cleaned = [self._clean_event(event) for event in events]
        if not cleaned or len(cleaned) > 50:
            raise ValueError("Submit between 1 and 50 learning events.")
        current = now or datetime.now(timezone.utc)
        timestamp = int(current.timestamp())
        newly_completed: list[dict[str, Any]] = []
        accepted = 0
        duplicates = 0

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            self._sync_current_quests(connection, user_id, current)
            for event_type, event_id, metadata_json in cleaned:
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO tutorly_learning_events
                        (user_id, event_id, event_type, metadata_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (user_id, event_id, event_type, metadata_json, timestamp),
                )
                if cursor.rowcount != 1:
                    duplicates += 1
                    continue
                accepted += 1
                matching = connection.execute(
                    """
                    SELECT * FROM tutorly_quest_progress
                    WHERE user_id = ? AND target_event = ? AND status = 'active' AND expires_at > ?
                    """,
                    (user_id, event_type, timestamp),
                ).fetchall()
                for quest in matching:
                    progress = min(int(quest["target_amount"]), int(quest["current_progress"]) + 1)
                    completed = progress >= int(quest["target_amount"])
                    connection.execute(
                        """
                        UPDATE tutorly_quest_progress
                        SET current_progress = ?, status = ?, completed_at = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            progress,
                            "completed" if completed else "active",
                            timestamp if completed else None,
                            timestamp,
                            int(quest["id"]),
                        ),
                    )
                    if not completed:
                        continue
                    reward = connection.execute(
                        """
                        INSERT OR IGNORE INTO tutorly_quest_rewards
                            (user_id, quest_id, period_key, xp_awarded, coins_awarded, awarded_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            user_id,
                            quest["quest_id"],
                            quest["period_key"],
                            int(quest["xp_reward"]),
                            int(quest["coin_reward"]),
                            timestamp,
                        ),
                    )
                    if reward.rowcount != 1:
                        continue
                    connection.execute(
                        """
                        UPDATE tutorly_quest_wallets
                        SET total_xp = total_xp + ?, weekly_xp = weekly_xp + ?,
                            coins = coins + ?, updated_at = ?
                        WHERE user_id = ?
                        """,
                        (
                            int(quest["xp_reward"]),
                            int(quest["xp_reward"]),
                            int(quest["coin_reward"]),
                            timestamp,
                            user_id,
                        ),
                    )
                    newly_completed.append(
                        {
                            "id": str(quest["quest_id"]),
                            "title": str(quest["title"]),
                            "xp_reward": int(quest["xp_reward"]),
                            "coin_reward": int(quest["coin_reward"]),
                        }
                    )
            payload = self._payload(connection, user_id, current)
            payload.update(
                {
                    "accepted_events": accepted,
                    "duplicate_events": duplicates,
                    "newly_completed": newly_completed,
                }
            )
            return payload
