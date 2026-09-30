# Tutorly Study Bot

The existing Study chat mode now has an exam planner inside `maths_gpt.html`.
There is still one composer, one chat request pipeline, and the existing history store.
No new database, authentication system, quiz backend, or visual engine is introduced.

## Modules

- `js/study/plan-engine.js`: pure, versioned, deterministic scheduling and rebalancing.
- `js/study/plan-store.js`: account-ID-scoped browser storage; guests use a separate device-only namespace.
- `js/study/planner-ui.js`: progressive setup, verified curriculum selection, daily tasks, edits and saved results.
- `js/study/session-controller.js`: existing-chat bridge, microlearning actions, explicit task/quiz saving.
- `js/study/setup-controls.js`: keyboard-accessible calendar and draggable circular target score.
- `js/study/materials.js`: bounded note reading through existing backend/auth connections.
- `js/study/quiz-card.js`: small interactive checks using Tutorly's existing question shape.
- `css/study-planner.css` and `css/study-session.css`: scoped Tutorly styles.
- `backend/chatbot/ai/semantic_router.py`: bounded Study context, small-chunk teaching rules and no-Live-Board guard.

## Planning and progress

Calendar dates use local today and UTC day ordinals for date differences; the exam date is excluded.
Tasks are weighted by supplied size/difficulty/priority, missed work and recorded quiz scores.
Learning chunks are at most 15 planned minutes. Checkpoints have 3 planned questions.
Final revision/mini-mock time is reserved; excess work stays visibly unscheduled rather than disappearing.
Completed task IDs and history survive date/time/syllabus changes. Expired plans stop scheduling.
Progress is completed planned minutes divided by all active planned minutes, including unscheduled work.
Page visits and AI responses do not automatically complete tasks or manufacture mastery.

## Teaching and evidence

Start uses the same Tutorly conversation for that exam, with small explanations, examples and 2–4-question checks.
Follow-ups keep compact plan/task/topic context. Finish & save task records the student's completion and requests a short recap.
Interactive checks present 2–4 AI-generated questions one at a time, save first attempts and adjust remaining revision after grading against the generated key. They are formative practice, not certified assessment. A separate form still accepts explicitly self-reported quiz results.
Optional legacy quiz import requires confirmation that the device's results belong to the student and exact single-chapter, Board and Grade matches.
Results are planning evidence, not certified grades. No existing scroll-based Learn progress is treated as completion.
Study Bot does not open Live Board. Ordinary Tutorly chat keeps its existing Live Board behavior.

## Honest limitations / integration points

- Plans are saved in this browser, not synchronized to a server or across devices. Storage failure is surfaced; memory fallback cannot survive refresh.
- Curriculum chapter metadata comes only from verified central-catalog records. Manual topic titles are student-provided, not invented official syllabus.
- Students can paste notes or add TXT, selectable-text PDF and supported photos. TXT is read locally; PDFs use `/api/study/material/extract`; photos reuse existing image extraction. Extracted text is previewable/editable and stored with the browser-local plan. Original files are not persisted by this uploader. Study requests include bounded, explicitly untrusted excerpts. Scanned PDFs need a photo or pasted text; Drive/Classroom are not connected.
- YouTube retrieval is not connected here. No fabricated video links or success states. A future verified video adapter can supply short videos when useful, not a fixed quota.
- LLM microlearning behavior needs the deployed backend/provider. Offline tests verify request contracts and guards; fixture browser tests do not prove live-provider answer quality.
- `npm run check:study` covers scheduling, persistence/contracts and backend boundaries.

## Verification (2026-09-21)

- Passed 25 scheduler check groups, including 168 budget/date/syllabus combinations.
- Passed 9 UI/storage contract checks and 8 offline backend boundary tests.
- Passed existing chatbot static/failure, chatbot backend, rich-response, Live Board, curriculum, site-consistency and responsive-navigation checks.
- Local browser fixture: created seven-day Science and three-day English plans, started tasks in the main chat, restored the same session after refresh, saved a reported quiz result and task completion, changed the exam date without losing completion, and confirmed Study suppresses an intentionally requested board.
- Desktop 1280px, tablet 768px and phone 390px checked for horizontal overflow. Fixed an existing mobile `!important` rule that otherwise showed chat behind the planner.
- AI answers in browser checks were labelled local fixtures. Live-provider answer quality, production deployment, automatic grading and video retrieval were not tested or claimed.

Existing files modified for this feature: `maths_gpt.html`, `js/app.js`, `js/chatbot/mode-registry.js`, `backend/chatbot/modes.py`, `backend/chatbot/ai/semantic_router.py`, `package.json`.
The local preview fixture was extended for isolated Study checks. Unrelated existing edits, including `backend/chatbot/adaptive_teaching_engine.py`, were preserved.

## Interactive setup and checks (2026-09-30)

- Setup order: exam calendar → subject dropdown → circular target/worries → material → topic review. Subject choices reuse the central education registry; they do not imply verified curriculum coverage.
- The target can be dragged around its circumference or adjusted using arrows, Page Up/Down, Home and End. It is optional and is never presented as a predicted result.
- Calendar supports month navigation, keyboard date navigation and date shortcuts. Study time uses a 15–120 minute slider. Existing task scheduling still excludes exam day.
- Browser checks verified month navigation, dropdown selection, pointer drag, keyboard adjustment, TXT extraction/preview, plan saving, and opening today's task in the same AI Tutor chat. At 390px the page had no horizontal overflow.
- Study check answers and adaptation evidence persist per account and plan/task. Quiz mounting waits for account resolution on refresh, avoiding an incorrect guest/read-only state.
- One opt-in smoke request using synthetic Motion notes succeeded through the existing Groq provider and returned two valid structured questions. Local browser replies use labelled fixtures, not production AI.
- No new dependencies, databases, provider secrets or Live Board implementation were introduced. Video retrieval and cross-device plan synchronization remain unconnected.

## Release readiness (2026-09-27)

- The hosted chat page was checked and did not yet include the Study Bot sidebar entry or planner scripts. The feature exists locally; backend redeployment alone does not publish these frontend files.
- Updated the chat and mode-registry asset versions so the release loads the Study integration instead of a cached chat script.
- Removed duplicate setup input listeners; all existing scheduling and storage behavior remains unchanged.
- Re-ran all 42 Study checks (25 scheduling groups, 9 UI/storage checks, 8 backend boundary tests), plus existing chatbot frontend/backend, curriculum, Live Board, rich-response, site consistency and responsive navigation checks: passed.
- Local fixture browser check: created a seven-day Mathematics plan using supplied topics, started a task in the existing chat, saved completion, refreshed and confirmed 1/10 completed tasks persisted. At 390px the planner had no horizontal overflow and the chat surface stayed hidden behind it.
- No live AI lesson or production deployment is claimed by these fixture checks. Plans remain browser-local, quiz results self-reported, and video retrieval unconnected.
