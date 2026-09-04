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
