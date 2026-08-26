from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
MIGRATION_PATH = BACKEND_DIR / "migrations" / "002_curriculum.sql"
DEFAULT_SEED_PATH = BACKEND_DIR / "curriculum" / "data" / "cbse-2026-27.json"
DEFAULT_ACADEMIC_YEAR = os.getenv("TUTORLY_ACADEMIC_YEAR", "2026-27").strip() or "2026-27"
DATABASE_PATH = Path(
    os.getenv("TUTORLY_CURRICULUM_DB_PATH", os.getenv("TUTORLY_DATABASE_PATH", str(PROJECT_DIR / "tutor.db")))
).resolve()

_BOOTSTRAP_LOCK = threading.Lock()
_BOOTSTRAPPED_PATHS: set[str] = set()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().casefold()
    text = re.sub(r"[^\w\s-]", " ", text, flags=re.UNICODE)
    return re.sub(r"[\s_-]+", " ", text).strip()


def slug(value: Any) -> str:
    normalized = normalize_text(value)
    ascii_value = unicodedata.normalize("NFKD", normalized).encode("ascii", "ignore").decode("ascii")
    clean = re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")
    return clean or "item"


def normalize_board(value: Any) -> str:
    clean = normalize_text(value).replace(" ", "_")
    aliases = {
        "cbse": "CBSE",
        "ncert": "CBSE",
        "cbse_ncert": "CBSE",
        "cisce": "CISCE",
        "icse": "CISCE",
        "isc": "CISCE",
        "maharashtra": "MAHARASHTRA",
        "maharashtra_state_board": "MAHARASHTRA",
        "kerala": "KERALA",
        "kerala_state_board": "KERALA",
        "telangana": "TELANGANA",
        "telangana_state_board": "TELANGANA",
        "tamil_nadu": "TAMIL_NADU",
        "tamil_nadu_state_board": "TAMIL_NADU",
    }
    return aliases.get(clean, clean.upper())


def normalize_grade(value: Any) -> int:
    match = re.search(r"\d{1,2}", str(value or ""))
    grade = int(match.group(0)) if match else 0
    if grade < 1 or grade > 12:
        raise ValueError("grade must be between 1 and 12")
    return grade


@contextmanager
def connection(database_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    path = (database_path or DATABASE_PATH).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=20)
    try:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(MIGRATION_PATH.read_text(encoding="utf-8"))
        yield db
        db.commit()
    finally:
        db.close()


def _upsert_source(db: sqlite3.Connection, source: dict[str, Any], checked_at: str) -> None:
    db.execute(
        """
        INSERT INTO curriculum_sources
            (id, board, source_name, source_url, source_kind, official, last_checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            board=excluded.board,
            source_name=excluded.source_name,
            source_url=excluded.source_url,
            source_kind=excluded.source_kind,
            official=excluded.official,
            last_checked_at=excluded.last_checked_at
        """,
        (
            source["id"], normalize_board(source["board"]), source["name"], source["url"],
            source.get("kind", "official_source"), int(bool(source.get("official", True))), checked_at,
        ),
    )


def _track_record_change(
    db: sqlite3.Connection,
    table: str,
    record_id: str,
    expected: dict[str, Any],
    changes: dict[str, int],
) -> None:
    columns = list(expected)
    row = db.execute(
        f"SELECT {', '.join(columns)} FROM {table} WHERE id=?",
        (record_id,),
    ).fetchone()
    if row is None:
        changes["new"] += 1
        return

    def comparable(value: Any) -> Any:
        if isinstance(value, bool):
            return int(value)
        return value

    if all(comparable(row[column]) == comparable(expected[column]) for column in columns):
        changes["unchanged"] += 1
    else:
        changes["updated"] += 1


def import_snapshot(snapshot: dict[str, Any], database_path: Path | None = None) -> dict[str, Any]:
    metadata = snapshot.get("metadata") or {}
    checked_at = str(metadata.get("generated_at") or utc_now())
    counters = {"subjects": 0, "books": 0, "chapters": 0, "topics": 0, "diagrams": 0}
    changes = {
        "new": 0,
        "updated": 0,
        "unchanged": 0,
        "needs_review": 0,
        "conflicts": int((metadata.get("validation") or {}).get("conflict_count") or 0),
    }
    with connection(database_path) as db:
        for source in snapshot.get("sources") or []:
            _track_record_change(db, "curriculum_sources", source["id"], {
                "board": normalize_board(source["board"]), "source_name": source["name"],
                "source_url": source["url"], "source_kind": source.get("kind", "official_source"),
                "official": int(bool(source.get("official", True))),
            }, changes)
            _upsert_source(db, source, checked_at)

        for subject in snapshot.get("subjects") or []:
            subject_status = subject.get("verification_status", "needs_review")
            changes["needs_review"] += int(subject_status == "needs_review")
            _track_record_change(db, "curriculum_subjects", subject["id"], {
                "name": subject["name"], "normalized_name": normalize_text(subject["name"]),
                "sort_order": int(subject.get("sort_order", 0)), "source_url": subject["source_url"],
                "verification_status": subject_status, "active": int(bool(subject.get("active", True))),
            }, changes)
            db.execute(
                """
                INSERT INTO curriculum_subjects
                    (id, board, academic_year, grade, medium, name, normalized_name, sort_order,
                     source_id, source_url, verification_status, last_verified_at, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name, normalized_name=excluded.normalized_name,
                    sort_order=excluded.sort_order, source_url=excluded.source_url,
                    verification_status=excluded.verification_status,
                    last_verified_at=excluded.last_verified_at, active=excluded.active
                """,
                (
                    subject["id"], normalize_board(subject["board"]), subject["academic_year"],
                    normalize_grade(subject["grade"]), subject.get("medium", "English"), subject["name"],
                    normalize_text(subject["name"]), int(subject.get("sort_order", 0)), subject["source_id"],
                    subject["source_url"], subject.get("verification_status", "needs_review"),
                    subject.get("last_verified_at"), int(bool(subject.get("active", True))),
                ),
            )
            counters["subjects"] += 1
            for book in subject.get("books") or []:
                book_status = book.get("verification_status", "needs_review")
                changes["needs_review"] += int(book_status == "needs_review")
                _track_record_change(db, "curriculum_books", book["id"], {
                    "title": book["title"], "normalized_title": normalize_text(book["title"]),
                    "part_label": book.get("part_label", ""), "sort_order": int(book.get("sort_order", 0)),
                    "source_url": book["source_url"], "verification_status": book_status,
                    "active": int(bool(book.get("active", True))),
                }, changes)
                db.execute(
                    """
                    INSERT INTO curriculum_books
                        (id, subject_id, title, normalized_title, part_label, book_code, sort_order,
                         source_url, verification_status, last_verified_at, active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title=excluded.title, normalized_title=excluded.normalized_title,
                        part_label=excluded.part_label, sort_order=excluded.sort_order,
                        source_url=excluded.source_url, verification_status=excluded.verification_status,
                        last_verified_at=excluded.last_verified_at, active=excluded.active
                    """,
                    (
                        book["id"], subject["id"], book["title"], normalize_text(book["title"]),
                        book.get("part_label", ""), book["book_code"], int(book.get("sort_order", 0)),
                        book["source_url"], book.get("verification_status", "needs_review"),
                        book.get("last_verified_at"), int(bool(book.get("active", True))),
                    ),
                )
                counters["books"] += 1
                for chapter in book.get("chapters") or []:
                    chapter_status = chapter.get("verification_status", "needs_review")
                    changes["needs_review"] += int(chapter_status == "needs_review")
                    _track_record_change(db, "curriculum_chapters", chapter["id"], {
                        "chapter_number": str(chapter["chapter_number"]), "chapter_name": chapter["chapter_name"],
                        "normalized_chapter_name": normalize_text(chapter["chapter_name"]),
                        "sort_order": int(chapter.get("sort_order", 0)), "source_url": chapter["source_url"],
                        "source_page": chapter.get("source_page"), "verification_status": chapter_status,
                        "active": int(bool(chapter.get("active", True))),
                    }, changes)
                    db.execute(
                        """
                        INSERT INTO curriculum_chapters
                            (id, book_id, chapter_number, chapter_name, normalized_chapter_name,
                             sort_order, source_url, source_page, verification_status,
                             last_verified_at, active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            chapter_name=excluded.chapter_name,
                            normalized_chapter_name=excluded.normalized_chapter_name,
                            sort_order=excluded.sort_order, source_url=excluded.source_url,
                            source_page=excluded.source_page,
                            verification_status=excluded.verification_status,
                            last_verified_at=excluded.last_verified_at, active=excluded.active
                        """,
                        (
                            chapter["id"], book["id"], str(chapter["chapter_number"]), chapter["chapter_name"],
                            normalize_text(chapter["chapter_name"]), int(chapter.get("sort_order", 0)),
                            chapter["source_url"], chapter.get("source_page"),
                            chapter.get("verification_status", "needs_review"),
                            chapter.get("last_verified_at"), int(bool(chapter.get("active", True))),
                        ),
                    )
                    counters["chapters"] += 1
                    for topic in chapter.get("topics") or []:
                        topic_status = topic.get("verification_status", "needs_review")
                        changes["needs_review"] += int(topic_status == "needs_review")
                        _track_record_change(db, "curriculum_topics", topic["id"], {
                            "name": topic["name"], "normalized_name": normalize_text(topic["name"]),
                            "sort_order": int(topic.get("sort_order", 0)), "source_url": topic["source_url"],
                            "source_page": topic.get("source_page"), "verification_status": topic_status,
                            "active": int(bool(topic.get("active", True))),
                        }, changes)
                        db.execute(
                            """
                            INSERT INTO curriculum_topics
                                (id, chapter_id, name, normalized_name, sort_order, source_url,
                                 source_page, verification_status, last_verified_at, active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                name=excluded.name, normalized_name=excluded.normalized_name,
                                sort_order=excluded.sort_order, source_url=excluded.source_url,
                                source_page=excluded.source_page,
                                verification_status=excluded.verification_status,
                                last_verified_at=excluded.last_verified_at, active=excluded.active
                            """,
                            (
                                topic["id"], chapter["id"], topic["name"], normalize_text(topic["name"]),
                                int(topic.get("sort_order", 0)), topic["source_url"], topic.get("source_page"),
                                topic.get("verification_status", "needs_review"), topic.get("last_verified_at"),
                                int(bool(topic.get("active", True))),
                            ),
                        )
                        counters["topics"] += 1
                    for diagram in chapter.get("diagrams") or []:
                        diagram_status = diagram.get("verification_status", "needs_review")
                        changes["needs_review"] += int(diagram_status == "needs_review")
                        labels_json = json.dumps(diagram.get("important_labels") or [], ensure_ascii=False)
                        _track_record_change(db, "curriculum_diagrams", diagram["id"], {
                            "diagram_title": diagram["diagram_title"], "diagram_type": diagram["diagram_type"],
                            "important_labels_json": labels_json, "source_url": diagram["source_url"],
                            "source_page": diagram.get("source_page"),
                            "reuse_allowed": int(bool(diagram.get("reuse_allowed", False))),
                            "verification_status": diagram_status,
                            "active": int(bool(diagram.get("active", True))),
                        }, changes)
                        db.execute(
                            """
                            INSERT INTO curriculum_diagrams
                                (id, chapter_id, topic_id, diagram_title, diagram_type,
                                 important_labels_json, source_url, source_page, reuse_allowed,
                                 verification_status, last_verified_at, active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                diagram_title=excluded.diagram_title, diagram_type=excluded.diagram_type,
                                important_labels_json=excluded.important_labels_json,
                                source_url=excluded.source_url, source_page=excluded.source_page,
                                reuse_allowed=excluded.reuse_allowed,
                                verification_status=excluded.verification_status,
                                last_verified_at=excluded.last_verified_at, active=excluded.active
                            """,
                            (
                                diagram["id"], chapter["id"], diagram.get("topic_id"),
                                diagram["diagram_title"], diagram["diagram_type"],
                                labels_json,
                                diagram["source_url"], diagram.get("source_page"),
                                int(bool(diagram.get("reuse_allowed", False))),
                                diagram.get("verification_status", "needs_review"),
                                diagram.get("last_verified_at"), int(bool(diagram.get("active", True))),
                            ),
                        )
                        counters["diagrams"] += 1
        source_id = str((snapshot.get("sources") or [{}])[0].get("id") or "ncert_textbooks")
        run_id = f"{normalize_board(metadata.get('board'))}:{metadata.get('academic_year')}:{checked_at}"
        db.execute(
            """
            INSERT INTO curriculum_import_runs
                (id, board, academic_year, source_id, started_at, completed_at, status, report_json)
            VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)
            ON CONFLICT(id) DO UPDATE SET
                completed_at=excluded.completed_at, status=excluded.status, report_json=excluded.report_json
            """,
            (
                run_id, normalize_board(metadata.get("board")), metadata.get("academic_year"), source_id,
                checked_at, utc_now(), json.dumps({"processed": counters, "changes": changes}, ensure_ascii=False),
            ),
        )
    return {**counters, "changes": changes}


def bootstrap(database_path: Path | None = None, seed_path: Path | None = None) -> None:
    db_path = (database_path or DATABASE_PATH).resolve()
    key = str(db_path)
    if key in _BOOTSTRAPPED_PATHS:
        return
    with _BOOTSTRAP_LOCK:
        if key in _BOOTSTRAPPED_PATHS:
            return
        with connection(db_path):
            pass
        path = seed_path or DEFAULT_SEED_PATH
        if path.exists():
            import_snapshot(json.loads(path.read_text(encoding="utf-8")), db_path)
        _BOOTSTRAPPED_PATHS.add(key)


def catalog(
    *,
    board: Any,
    grade: Any,
    academic_year: str = DEFAULT_ACADEMIC_YEAR,
    medium: str = "English",
    include_review: bool = False,
    database_path: Path | None = None,
) -> dict[str, Any]:
    db_path = (database_path or DATABASE_PATH).resolve()
    bootstrap(db_path)
    normalized_board = normalize_board(board)
    normalized_grade = normalize_grade(grade)
    statuses = ("verified", "needs_review") if include_review else ("verified",)
    placeholders = ",".join("?" for _ in statuses)
    params: list[Any] = [normalized_board, academic_year, normalized_grade, medium, *statuses]
    with connection(db_path) as db:
        subject_rows = db.execute(
            f"""
            SELECT * FROM curriculum_subjects
            WHERE board=? AND academic_year=? AND grade=? AND medium=?
              AND active=1 AND verification_status IN ({placeholders})
            ORDER BY sort_order, name
            """,
            params,
        ).fetchall()
        subjects: list[dict[str, Any]] = []
        for subject in subject_rows:
            books = db.execute(
                f"""
                SELECT * FROM curriculum_books
                WHERE subject_id=? AND active=1 AND verification_status IN ({placeholders})
                ORDER BY sort_order, title
                """,
                [subject["id"], *statuses],
            ).fetchall()
            public_books: list[dict[str, Any]] = []
            for book in books:
                chapters = db.execute(
                    f"""
                    SELECT * FROM curriculum_chapters
                    WHERE book_id=? AND active=1 AND verification_status IN ({placeholders})
                    ORDER BY sort_order, CAST(chapter_number AS INTEGER), chapter_name
                    """,
                    [book["id"], *statuses],
                ).fetchall()
                public_chapters: list[dict[str, Any]] = []
                for chapter in chapters:
                    topics = db.execute(
                        f"""
                        SELECT id, name, sort_order, source_url, source_page, verification_status
                        FROM curriculum_topics
                        WHERE chapter_id=? AND active=1 AND verification_status IN ({placeholders})
                        ORDER BY sort_order, name
                        """,
                        [chapter["id"], *statuses],
                    ).fetchall()
                    diagrams = db.execute(
                        f"""
                        SELECT id, diagram_title, diagram_type, important_labels_json,
                               source_url, source_page, reuse_allowed, verification_status
                        FROM curriculum_diagrams
                        WHERE chapter_id=? AND active=1 AND verification_status IN ({placeholders})
                        ORDER BY source_page, diagram_title
                        """,
                        [chapter["id"], *statuses],
                    ).fetchall()
                    public_chapters.append({
                        "id": chapter["id"],
                        "number": chapter["chapter_number"],
                        "name": chapter["chapter_name"],
                        "sort_order": chapter["sort_order"],
                        "source_url": chapter["source_url"],
                        "source_page": chapter["source_page"],
                        "verification_status": chapter["verification_status"],
                        "topics": [dict(row) for row in topics],
                        "diagrams": [
                            {**dict(row), "important_labels": json.loads(row["important_labels_json"] or "[]")}
                            for row in diagrams
                        ],
                    })
                if public_chapters or include_review:
                    public_books.append({
                        "id": book["id"], "title": book["title"], "part_label": book["part_label"],
                        "book_code": book["book_code"], "source_url": book["source_url"],
                        "verification_status": book["verification_status"], "chapters": public_chapters,
                    })
            if public_books or include_review:
                subjects.append({
                    "id": subject["id"], "name": subject["name"], "medium": subject["medium"],
                    "source_url": subject["source_url"],
                    "verification_status": subject["verification_status"], "books": public_books,
                    "chapter_count": sum(len(book["chapters"]) for book in public_books),
                })

        status_rows = db.execute(
            """
            SELECT c.verification_status AS verification_status, COUNT(*) AS total
            FROM curriculum_chapters c
            JOIN curriculum_books b ON b.id=c.book_id
            JOIN curriculum_subjects s ON s.id=b.subject_id
            WHERE s.board=? AND s.academic_year=? AND s.grade=? AND s.medium=? AND c.active=1
            GROUP BY c.verification_status
            """,
            (normalized_board, academic_year, normalized_grade, medium),
        ).fetchall()
    status = {row["verification_status"]: row["total"] for row in status_rows}
    return {
        "available": bool(subjects),
        "board": normalized_board,
        "academic_year": academic_year,
        "grade": normalized_grade,
        "medium": medium,
        "subjects": subjects,
        "verification": status,
        "message": "" if subjects else "This curriculum is still being added to Tutorly.",
    }


def coverage(database_path: Path | None = None) -> dict[str, Any]:
    db_path = (database_path or DATABASE_PATH).resolve()
    bootstrap(db_path)
    with connection(db_path) as db:
        rows = db.execute(
            """
            SELECT s.board, s.academic_year, s.grade, s.medium,
                   COUNT(DISTINCT s.id) AS subjects,
                   COUNT(DISTINCT b.id) AS books,
                   SUM(CASE WHEN c.verification_status='verified' THEN 1 ELSE 0 END) AS verified_chapters,
                   SUM(CASE WHEN c.verification_status='needs_review' THEN 1 ELSE 0 END) AS needs_review
            FROM curriculum_subjects s
            LEFT JOIN curriculum_books b ON b.subject_id=s.id AND b.active=1
            LEFT JOIN curriculum_chapters c ON c.book_id=b.id AND c.active=1
            WHERE s.active=1
            GROUP BY s.board, s.academic_year, s.grade, s.medium
            ORDER BY s.board, s.academic_year DESC, s.grade, s.medium
            """
        ).fetchall()
    return {"coverage": [dict(row) for row in rows]}


def resolve_context(
    *,
    board: Any,
    grade: Any,
    subject_id: str = "",
    book_id: str = "",
    chapter_id: str = "",
    academic_year: str = DEFAULT_ACADEMIC_YEAR,
    medium: str = "English",
    database_path: Path | None = None,
) -> dict[str, str]:
    """Resolve client-selected IDs to verified server-owned curriculum labels."""
    if not subject_id:
        return {}
    db_path = (database_path or DATABASE_PATH).resolve()
    bootstrap(db_path)
    with connection(db_path) as db:
        row = db.execute(
            """
            SELECT s.id AS subject_id, s.name AS subject, b.id AS book_id, b.title AS book,
                   c.id AS chapter_id, c.chapter_name AS chapter
            FROM curriculum_subjects s
            LEFT JOIN curriculum_books b
              ON b.subject_id=s.id AND b.id=? AND b.active=1 AND b.verification_status='verified'
            LEFT JOIN curriculum_chapters c
              ON c.book_id=b.id AND c.id=? AND c.active=1 AND c.verification_status='verified'
            WHERE s.id=? AND s.board=? AND s.grade=? AND s.academic_year=? AND s.medium=?
              AND s.active=1 AND s.verification_status='verified'
            LIMIT 1
            """,
            (
                str(book_id or ""), str(chapter_id or ""), str(subject_id), normalize_board(board),
                normalize_grade(grade), academic_year, medium,
            ),
        ).fetchone()
    if not row:
        return {}
    resolved = {
        "board": normalize_board(board),
        "grade": str(normalize_grade(grade)),
        "academic_year": academic_year,
        "medium": medium,
        "subject_id": row["subject_id"],
        "subject": row["subject"],
    }
    if row["book_id"]:
        resolved.update({"book_id": row["book_id"], "book": row["book"]})
    if row["chapter_id"]:
        resolved.update({"chapter_id": row["chapter_id"], "chapter": row["chapter"]})
    return resolved
