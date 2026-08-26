ALTER TABLE tutorly_users ADD COLUMN preferred_voice_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE tutorly_users ADD COLUMN voice_onboarding_completed INTEGER NOT NULL DEFAULT 0;
