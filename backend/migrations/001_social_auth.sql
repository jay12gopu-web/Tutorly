-- Tutorly social authentication schema.
-- Existing deployments apply the user-column additions conditionally in
-- backend/auth_routes.py because SQLite does not support ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS tutorly_social_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_email TEXT NOT NULL DEFAULT '',
    provider_email_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL,
    UNIQUE(provider, provider_user_id),
    FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
);

CREATE INDEX IF NOT EXISTS idx_tutorly_social_user
    ON tutorly_social_identities(user_id);

CREATE TABLE IF NOT EXISTS tutorly_oauth_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state_hash TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    flow TEXT NOT NULL,
    request_ip TEXT NOT NULL,
    nonce TEXT NOT NULL,
    code_verifier TEXT NOT NULL DEFAULT '',
    user_id INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
);

CREATE TABLE IF NOT EXISTS tutorly_oauth_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES tutorly_users(id)
);
