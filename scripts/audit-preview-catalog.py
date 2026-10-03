"""Loopback QA only: use the real curriculum store with an isolated temporary DB."""
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.curriculum_store import catalog

if __name__ == "__main__":
    grade = sys.argv[1] if len(sys.argv) > 1 else "9"
    with tempfile.TemporaryDirectory(prefix="tutorly-audit-catalog-") as directory:
        result = catalog(board="CBSE", grade=grade, academic_year="2026-27",
                         medium="English", database_path=Path(directory) / "catalog.db")
        print(json.dumps(result, ensure_ascii=True))
