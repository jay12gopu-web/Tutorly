from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.curriculum.importers.ncert import reconcile_snapshots, validate_snapshot, write_snapshot  # noqa: E402
from backend.curriculum_store import import_snapshot  # noqa: E402
from scripts.import_curriculum import build_report  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Revalidate a Tutorly curriculum snapshot without refetching sources.")
    parser.add_argument(
        "--snapshot", type=Path,
        default=ROOT / "backend" / "curriculum" / "data" / "cbse-2026-27.json",
    )
    parser.add_argument(
        "--report", type=Path,
        default=ROOT / "backend" / "curriculum" / "reports" / "cbse-2026-27.json",
    )
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--reference", type=Path, action="append", default=[])
    args = parser.parse_args()

    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    references = [json.loads(path.read_text(encoding="utf-8")) for path in args.reference]
    snapshot = reconcile_snapshots(snapshot, references) if references else validate_snapshot(snapshot)
    write_snapshot(snapshot, args.snapshot)
    database_counts = import_snapshot(snapshot, args.database)
    grades = {int(subject["grade"]) for subject in snapshot.get("subjects") or []}
    report = build_report(snapshot, database_counts, grades)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
