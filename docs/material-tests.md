# Tests from study material

Tests now starts with files or pasted notes, followed by the existing paper settings, question player and report/history UI. It no longer requires subject or chapter selection. Saved grade/board still informs question difficulty without requiring a supported curriculum.

- PDF/TXT/JPG/PNG reading reuses `TutorlyStudyMaterials`; 5 MB per file, five sources and 24,000 combined characters. Preview/edit/remove and reading retry are supported. Original files are not stored by this uploader; notes remain in the current tab until refresh. Existing reports store generated questions/answers, not the original document text.
- `POST /api/tests/generate` uses the existing Tutorly AI provider and session validation. Input is bounded, rate-limited and treated as untrusted material, never instructions. Output choices, keys, duplicate questions and source references are validated. Each supporting quote must exist in its submitted source. This is grounding validation, not a guarantee that an AI answer is correct.
- Insufficient material may yield fewer questions with an explicit notice. Provider/network failures keep the setup and allow retry; no fake paper fallback is generated.
- Multiple choice uses the generated answer key. Written answers are explicitly self-reviewed against an answer guide, not silently graded by keyword matching. Scores are practice feedback, not certified grades.
- Old reports remain viewable and retake uses saved questions. Material-based attempts do not masquerade as verified curriculum chapter mastery.

Checks: `npm run check:test-materials`. Optional real-provider synthetic-data check: `python tests/material_test_live.py --live`. Browser fixture replies are labelled separately from the successful real-provider check. No new API keys or dependencies are required; the updated backend must deploy alongside the frontend.
