from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.curriculum.importers.ncert import extract_titles_from_prelims
from backend.curriculum.sources import SOURCE_REGISTRY
from backend.curriculum_store import bootstrap, catalog, coverage, import_snapshot, resolve_context


def fixture_snapshot() -> dict:
    return {
        "metadata": {
            "board": "CBSE",
            "academic_year": "2026-27",
            "medium": "English",
            "generated_at": "2026-08-26T00:00:00+00:00",
        },
        "sources": [{
            "id": "ncert_textbooks", "board": "CBSE", "name": "NCERT Textbook Portal",
            "url": "https://ncert.nic.in/textbook.php", "kind": "official_textbook_portal", "official": True,
        }],
        "subjects": [{
            "id": "fixture:science", "board": "CBSE", "academic_year": "2026-27", "grade": 9,
            "medium": "English", "name": "Science", "sort_order": 1, "source_id": "ncert_textbooks",
            "source_url": "https://ncert.nic.in/textbook.php", "verification_status": "verified",
            "last_verified_at": "2026-08-26T00:00:00+00:00", "active": True,
            "books": [{
                "id": "fixture:science:part-1", "title": "Science Part 1", "part_label": "Part 1",
                "book_code": "fixture1", "sort_order": 1, "source_url": "https://ncert.nic.in/textbook.php",
                "verification_status": "verified", "last_verified_at": "2026-08-26T00:00:00+00:00",
                "active": True,
                "chapters": [{
                    "id": "fixture:science:part-1:motion", "chapter_number": "1", "chapter_name": "Motion",
                    "sort_order": 1, "source_url": "https://ncert.nic.in/example.pdf", "source_page": 1,
                    "verification_status": "verified", "last_verified_at": "2026-08-26T00:00:00+00:00",
                    "active": True,
                    "topics": [{
                        "id": "fixture:topic:telugu", "name": "వేగం", "sort_order": 1,
                        "source_url": "https://ncert.nic.in/example.pdf", "source_page": 2,
                        "verification_status": "verified", "last_verified_at": "2026-08-26T00:00:00+00:00",
                        "active": True,
                    }],
                    "diagrams": [{
                        "id": "fixture:diagram:motion", "diagram_title": "Distance-time graph",
                        "diagram_type": "physics_diagram", "important_labels": ["distance", "time"],
                        "source_url": "https://ncert.nic.in/example.pdf", "source_page": 4,
                        "reuse_allowed": False, "verification_status": "needs_review",
                        "last_verified_at": None, "active": True,
                    }],
                }, {
                    "id": "fixture:science:part-1:uncertain", "chapter_number": "2",
                    "chapter_name": "Chapter 2", "sort_order": 2,
                    "source_url": "https://ncert.nic.in/uncertain.pdf", "source_page": None,
                    "verification_status": "needs_review", "last_verified_at": None,
                    "active": True, "topics": [], "diagrams": [],
                }],
            }],
        }],
    }


def check_store() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "curriculum.db"
        bootstrap(db_path, seed_path=Path(temp_dir) / "missing-seed.json")
        counts = import_snapshot(fixture_snapshot(), db_path)
        assert counts["subjects"] == 1 and counts["chapters"] == 2

        current = catalog(board="NCERT", grade="Grade 9", database_path=db_path)
        assert current["available"] is True
        assert current["subjects"][0]["books"][0]["part_label"] == "Part 1"
        chapters = current["subjects"][0]["books"][0]["chapters"]
        assert [chapter["name"] for chapter in chapters] == ["Motion"]
        assert chapters[0]["topics"][0]["name"] == "వేగం"
        assert chapters[0]["diagrams"] == [], "needs_review diagrams must not publish"

        review = catalog(board="CBSE", grade=9, include_review=True, database_path=db_path)
        assert len(review["subjects"][0]["books"][0]["chapters"]) == 2
        assert len(review["subjects"][0]["books"][0]["chapters"][0]["diagrams"]) == 1

        missing = catalog(board="CISCE", grade=9, database_path=db_path)
        assert missing["available"] is False
        assert missing["message"] == "This curriculum is still being added to Tutorly."

        resolved = resolve_context(
            board="CBSE", grade=9, subject_id="fixture:science",
            book_id="fixture:science:part-1", chapter_id="fixture:science:part-1:motion",
            database_path=db_path,
        )
        assert resolved["subject"] == "Science" and resolved["chapter"] == "Motion"
        assert coverage(db_path)["coverage"][0]["verified_chapters"] == 1


def check_toc_parser() -> None:
    toc = """
    CONTENTS
    Chapter 1 : Introduction 1
    Chapter 2 : Collection of Data 9
    Chapter 3 : Organisation of Data 22
    """
    assert extract_titles_from_prelims(toc, [1, 2, 3]) == {
        1: "Introduction", 2: "Collection of Data", 3: "Organisation of Data"
    }

    merged_columns = """
    CONTENTS
    Chapter 1
    Chapter 3
    Chapter 2
    DEVELOPMENT 2
    SECTORS OF THE ECONOMY 18
    MONEY AND CREDIT 38
    """
    assert extract_titles_from_prelims(merged_columns, [1, 2, 3]) == {
        1: "DEVELOPMENT", 2: "SECTORS OF THE ECONOMY", 3: "MONEY AND CREDIT"
    }


def check_bundled_snapshot() -> None:
    seed_path = ROOT / "backend" / "curriculum" / "data" / "cbse-2026-27.json"
    if not seed_path.exists():
        raise AssertionError("The verified CBSE snapshot has not been generated")
    snapshot = json.loads(seed_path.read_text(encoding="utf-8"))
    grades = {subject["grade"] for subject in snapshot["subjects"]}
    assert grades == set(range(1, 13))
    for subject in snapshot["subjects"]:
        for book in subject["books"]:
            seen_numbers: set[str] = set()
            seen_names: set[str] = set()
            for chapter in book["chapters"]:
                assert chapter["chapter_number"] not in seen_numbers
                seen_numbers.add(chapter["chapter_number"])
                if chapter["verification_status"] == "verified":
                    normalized = " ".join(chapter["chapter_name"].casefold().split())
                    assert normalized not in seen_names
                    assert not normalized.startswith(("before you read", "read and find out", "enable you to"))
                    assert normalized not in {"chapter", "unit"}
                    seen_names.add(normalized)


def check_frontend_connections() -> None:
    syllabus = (ROOT / "js" / "exams" / "syllabus-config.js").read_text(encoding="utf-8")
    lesson_data = (ROOT / "js" / "lessons" / "lesson-data.js").read_text(encoding="utf-8")
    practice = (ROOT / "practice.html").read_text(encoding="utf-8")
    app = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
    assert "CBSE_GRADE_9" not in syllabus
    assert "Matter in Our Surroundings" not in lesson_data
    assert "practiceSubjectGrid" in practice and "curriculum-client.js" in practice
    assert "TutorlyCurriculum?.getActiveContext" in app


def main() -> None:
    assert SOURCE_REGISTRY["ncert_textbooks"].url == "https://ncert.nic.in/textbook.php"
    assert SOURCE_REGISTRY["cbse_academic_2026_27"].official is True
    check_store()
    check_toc_parser()
    check_bundled_snapshot()
    check_frontend_connections()
    print("Tutorly curriculum schema, verification gates, importer parsing, seed coverage, and frontend connections passed.")


if __name__ == "__main__":
    main()
