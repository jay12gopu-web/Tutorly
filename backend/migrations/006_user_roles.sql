-- Additive role system. New accounts remain students unless promoted server-side.
ALTER TABLE tutorly_users ADD COLUMN role TEXT NOT NULL DEFAULT 'student';
