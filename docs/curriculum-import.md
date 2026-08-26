# Tutorly curriculum imports

Tutorly stores one versioned curriculum catalog for Learn, Practice, Tests, Chat, Voice, Notes, Revision, and Progress.

## Current production snapshot

- Board: CBSE / NCERT
- Academic year: 2026–27
- Medium: English
- Grades: 1–12
- Canonical sources: the official [NCERT Textbook Portal](https://ncert.nic.in/textbook.php) and [CBSE Academic Curriculum 2026–27](https://cbseacademic.nic.in/curriculum_2027.html)

The bundled snapshot contains curriculum metadata and official source references only. It does not copy textbook prose or artwork. Records marked `needs_review` remain stored for review but are excluded from student APIs.

## Import

Install backend dependencies, then run:

```powershell
python scripts/import_curriculum.py --grades 1-12 --workers 8
```

The importer:

1. discovers book codes and chapter ranges from NCERT's official portal;
2. extracts official titles from textbook contents pages or chapter PDFs;
3. validates ordering, title quality, and duplicate verified titles;
4. writes `backend/curriculum/data/cbse-2026-27.json`;
5. writes a review report to `backend/curriculum/reports/cbse-2026-27.json`;
6. upserts the versioned records into Tutorly's curriculum database.

Use `--database <path>` for an isolated review database. Set `TUTORLY_CURRICULUM_DB_PATH` to choose the runtime database and `TUTORLY_ACADEMIC_YEAR` to choose the default active version.

## Verification rules

- `verified`: supported by a reliable official chapter marker or contents entry.
- `needs_review`: missing, ambiguous, conflicting, or low-confidence extraction; never returned by the normal student catalog endpoint.
- `rejected`: reviewed and rejected.
- `outdated`: belongs to a superseded source/version.

The report lists every imported Board, Grade, Subject, Book, and its verified/review totals. Additional official board sources are registered, but their catalogs are not marked complete until an adapter has imported and verified them.
