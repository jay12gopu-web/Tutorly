PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS curriculum_sources (
    id TEXT PRIMARY KEY,
    board TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    official INTEGER NOT NULL DEFAULT 1,
    last_checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS curriculum_subjects (
    id TEXT PRIMARY KEY,
    board TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 12),
    medium TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN ('verified', 'needs_review', 'rejected', 'outdated')
    ),
    last_verified_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(source_id) REFERENCES curriculum_sources(id),
    UNIQUE(board, academic_year, grade, medium, normalized_name)
);

CREATE TABLE IF NOT EXISTS curriculum_books (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    part_label TEXT NOT NULL DEFAULT '',
    book_code TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_url TEXT NOT NULL,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN ('verified', 'needs_review', 'rejected', 'outdated')
    ),
    last_verified_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(subject_id) REFERENCES curriculum_subjects(id),
    UNIQUE(subject_id, book_code)
);

CREATE TABLE IF NOT EXISTS curriculum_chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter_number TEXT NOT NULL,
    chapter_name TEXT NOT NULL,
    normalized_chapter_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_url TEXT NOT NULL,
    source_page INTEGER,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN ('verified', 'needs_review', 'rejected', 'outdated')
    ),
    last_verified_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(book_id) REFERENCES curriculum_books(id),
    UNIQUE(book_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS curriculum_topics (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_url TEXT NOT NULL,
    source_page INTEGER,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN ('verified', 'needs_review', 'rejected', 'outdated')
    ),
    last_verified_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(chapter_id) REFERENCES curriculum_chapters(id),
    UNIQUE(chapter_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS curriculum_diagrams (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    topic_id TEXT,
    diagram_title TEXT NOT NULL,
    diagram_type TEXT NOT NULL,
    important_labels_json TEXT NOT NULL DEFAULT '[]',
    source_url TEXT NOT NULL,
    source_page INTEGER,
    reuse_allowed INTEGER NOT NULL DEFAULT 0,
    verification_status TEXT NOT NULL CHECK (
        verification_status IN ('verified', 'needs_review', 'rejected', 'outdated')
    ),
    last_verified_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(chapter_id) REFERENCES curriculum_chapters(id),
    FOREIGN KEY(topic_id) REFERENCES curriculum_topics(id)
);

CREATE TABLE IF NOT EXISTS curriculum_import_runs (
    id TEXT PRIMARY KEY,
    board TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    source_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    report_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY(source_id) REFERENCES curriculum_sources(id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_subject_lookup
    ON curriculum_subjects(board, academic_year, grade, medium, verification_status, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_curriculum_book_subject
    ON curriculum_books(subject_id, verification_status, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_curriculum_chapter_book
    ON curriculum_chapters(book_id, verification_status, active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_verified_chapter_name
    ON curriculum_chapters(book_id, normalized_chapter_name)
    WHERE active=1 AND verification_status='verified';
CREATE INDEX IF NOT EXISTS idx_curriculum_topic_chapter
    ON curriculum_topics(chapter_id, verification_status, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_curriculum_diagram_chapter
    ON curriculum_diagrams(chapter_id, verification_status, active);
