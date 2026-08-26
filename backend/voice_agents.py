from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
REGISTRY_PATH = PROJECT_DIR / "shared" / "tutorly-voice-agents.json"
VOICE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{1,30}$")
AGENT_ID_PATTERN = re.compile(r"^agent_[a-z0-9]+$")
EXPECTED_KEYS = ("miles", "theo", "leo", "ethan", "aria", "clara", "luna", "nova")


@lru_cache(maxsize=1)
def voice_agents() -> dict[str, dict[str, object]]:
    payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    entries = payload.get("voices") if isinstance(payload, dict) else None
    if not isinstance(entries, list) or len(entries) != len(EXPECTED_KEYS):
        raise RuntimeError("Tutorly voice registry is invalid.")

    registry: dict[str, dict[str, object]] = {}
    for expected_key, raw in zip(EXPECTED_KEYS, entries):
        if not isinstance(raw, dict):
            raise RuntimeError("Tutorly voice registry is invalid.")
        key = str(raw.get("key") or "").strip().lower()
        agent_id = str(raw.get("agentId") or "").strip()
        if key != expected_key or not VOICE_KEY_PATTERN.fullmatch(key) or not AGENT_ID_PATTERN.fullmatch(agent_id):
            raise RuntimeError("Tutorly voice registry is invalid.")
        registry[key] = {
            "key": key,
            "name": str(raw.get("name") or "").strip(),
            "description": str(raw.get("description") or "").strip(),
            "agent_id": agent_id,
            "gender_group": "girl" if raw.get("genderGroup") == "girl" else "boy",
        }
    return registry


def voice_agent(voice_key: str) -> dict[str, object] | None:
    return voice_agents().get(str(voice_key or "").strip().lower())

