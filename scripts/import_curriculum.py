from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.curriculum.importers.ncert import (  # noqa: E402
    build_snapshot,
    discover_books,
    fetch_portal_html,
    select_core_books,
    write_snapshot,
)
from backend.curriculum_store import import_snapshot  # noqa: E402


def build_report(snapshot: dict, database_counts: dict, grades: set[int]) -> dict:
    inventory = []
    for subject in snapshot.get("subjects") or []:
        for book in subject.get("books") or []:
            chapters = book.get("chapters") or []
            inventory.append({
                "board": subject["board"],
                "grade": subject["grade"],
                "subject": subject["name"],
                "book": book["title"],
                "book_code": book["book_code"],
                "chapters_discovered": len(chapters),
                "chapters_verified": sum(chapter.get("verification_status") == "verified" for chapter in chapters),
                "chapters_needing_review": sum(chapter.get("verification_status") == "needs_review" for chapter in chapters),
                "topics_discovered": sum(len(chapter.get("topics") or []) for chapter in chapters),
                "diagrams_discovered": sum(len(chapter.get("diagrams") or []) for chapter in chapters),
            })
    return {
        **snapshot["metadata"],
        "database_records_processed": database_counts,
        "inventory": inventory,
        "grades_requested": sorted(grades),
        "records_needing_review_are_not_returned_by_student_apis": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import official NCERT curriculum metadata into Tutorly.")
    parser.add_argument("--academic-year", default="2026-27")
    parser.add_argument("--output", type=Path, default=ROOT / "backend" / "curriculum" / "data" / "cbse-2026-27.json")
    parser.add_argument("--report", type=Path, default=ROOT / "backend" / "curriculum" / "reports" / "cbse-2026-27.json")
    parser.add_argument("--database", type=Path, default=None)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--grades", default="1-12", help="Comma-separated grades or ranges, e.g. 1,5,9-12")
    args = parser.parse_args()

    grades: set[int] = set()
    for item in args.grades.split(","):
        value = item.strip()
        if "-" in value:
            start, end = value.split("-", 1)
            grades.update(range(int(start), int(end) + 1))
        elif value:
            grades.add(int(value))
    if not grades or any(grade < 1 or grade > 12 for grade in grades):
        parser.error("--grades must contain values from 1 through 12")

    discovered = discover_books(fetch_portal_html())
    selected = [book for book in select_core_books(discovered) if book.grade in grades]
    print(f"Discovered {len(discovered)} official portal books; importing {len(selected)} core books.", flush=True)
    snapshot = build_snapshot(academic_year=args.academic_year, books=selected, workers=args.workers)
    write_snapshot(snapshot, args.output)
    database_counts = import_snapshot(snapshot, args.database)

    report = build_report(snapshot, database_counts, grades)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
