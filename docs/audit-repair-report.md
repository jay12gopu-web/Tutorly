# Tutorly audit — local repair report

3 October 2026. Source: Tutorly-All-Issues-and-Fixes.pdf (61 original IDs).

## Outcome

38 fixed and verified, 11 implemented but unverified, 10 blocked, 2 not reproduced. [The complete original-ID checklist](audit-repair-checklist.md) states the specific evidence and limitations for every item.

**Not committed, pushed or deployed. Deployment is held for user approval.** This report is not a claim that all production services or all 61 findings are resolved.

Changes reuse the existing Tutorly chat, Study planner, curriculum client/store, profile, quizzes, navigation and Live Board. No second app, auth/profile database, chatbot or visual engine was introduced. No database migration or regenerated curriculum snapshot is included. Unrelated local work, especially backend/chatbot/adaptive_teaching_engine.py, was not edited by this repair pass.

## Main repairs

- Chat: recoverable Retry and Stop; request-version/abort cleanup; exclude failed turns from provider history and feedback; retain existing conversations, uploads and voice entrypoints.
- Curriculum handoff: selected verified chapter IDs survive Practice/chat/Test actions. Backend resolves IDs against the canonical catalog rather than trusting client labels. Tests still require uploaded/pasted notes; metadata is not teaching content.
- Learn safety: removed generic filler and unrelated hardcoded explanations from canonical chapter records. Reader shows an official-source link and clearly separates pending reviewed content from AI generation. Opening a chapter does not complete it.
- Study: completed tasks have Review/Undo, progress recomputes and pending work is rescheduled. A short visible start prompt replaces internal control instructions. Normal model preference is restored after Study.
- Local recovery: private JSON backup/restore for plans/bookmarks, bounded input and validation, merge without overwriting existing records. No cross-device sync claim.
- Live Board: clear old scene/context and stale async work on New Chat, keep drawing/playback controls in layout flow, fit existing scene focus and stop inventing generic diagrams for unsupported requests. Study continues to avoid Live Board per your latest instruction.
- Mobile: cart placement/focus/close/Earn route, dark chat/table headers, single-column doubt form, bookmark artwork, menu focus containment, dark reader/header and collapsed reader tools.
- Honesty: local tutor/doubt/leaderboard/referral examples clearly identify demo status. No tutor queue, verified teacher, real XP, wallet reward or support delivery is fabricated.
- Profile: stopped incompatible legacy Campus initialization on the canonical profile page; recorded streak source is shared with Progress.
- Answer formatting: explicitly requested common-mistake guidance is preserved, completion budget is configurable within bounds, truncated provider output fails safely. Real answer-depth quality still needs provider evaluation.

UX-copy guidance informed the demo disclosures, recoverable errors and device-only storage explanations. PDF review preserved the original issue IDs and distinguished recommendations from confirmed causes.

## Files created for the audit

- css/audit-repairs.css
- docs/audit-repair-checklist.md
- docs/audit-repair-report.md
- scripts/audit-preview-catalog.py
- tests/audit-repairs-check.js
- tests/audit_backend_smoke.py
- assets/vendor/katex/ — official package JavaScript, CSS, fonts and license; version 0.16.47

## Audit-modified areas

These lists describe audit changes, not ownership of every working-tree difference. Some files already had unrelated local changes.

- Backend: backend/main.py; backend/chatbot/ai/groq.py; backend/chatbot/ai/semantic_router.py; backend/chatbot/material_test.py.
- Chat/rendering/navigation: maths_gpt.html; js/app.js; js/global-layout.js; js/chatbot/markdown-renderer.js; js/chatbot/rich-response-renderer.js; css/chat-layout.css; css/tutorly-foundation.css.
- Curriculum/learning/tests: lessons.html; practice.html; tests.html; js/lessons/lesson-data.js; js/lessons/lesson-module.js; js/practice-curriculum.js; js/exams/exam-system.js; js/exams/material-input.js.
- Study: js/study/plan-engine.js; js/study/plan-store.js; js/study/planner-ui.js; js/study/session-controller.js.
- Live Board: js/live-board/chat-panel.js; js/live-board/app.js; js/live-board/board-engine.js; js/live-board/mock-provider.js.
- Profile/progress/bookmarks/quests: js/campus.js; js/profile-hub.js; js/bookmarks.js; js/quests.js; progress.html.
- Human tools/rewards: more-tools.html; ask-doubt.html; find-tutor.html; leaderboard.html; js/ask-doubt.js; js/find-tutor.js; js/leaderboard.js; shop.html; refer_earn.html.
- Billing/legal/updates: frontend/subscription/billing.js; frontend/subscription/payment-history.js; privacy.html; Terms_Conditions.html; js/release-notes.js.
- Dependency/test/preview wiring: package.json; package-lock.json; scripts/preview-chat.cjs; tests/fixtures/chat-preview-bootstrap.js; tests/chatbot-static-check.js; tests/site-consistency-check.js; tests/test-material-ui-check.js; tests/chat-layout-state-check.js.

Existing auth/contact/curriculum-import work was preserved; not automatically included in an audit commit. Test assertion changes correct obsolete exact-title/premium-Learn assumptions and update harness dependencies; other assertions remain.

## Browser verification

Desktop 1280 × 900 and mobile 390 × 844 were exercised using the actual local frontend. Tablet navigation is covered by static responsive checks, not a complete interactive tablet walkthrough. Local preview disables external requests and uses clearly synthetic account/provider fixtures; these are not real sign-ins or successful AI/billing/tutor transactions.

Verified interactions:

1. Chat failure → Retry → response in the same conversation.
2. Slow response → Stop → subsequent send works.
3. Real existing graph renderer → Next step/Let Me Try → New Chat clears scene.
4. Actual canonical Grade 9 catalog → Science chapter chooser → selected chapter in existing chat.
5. Learn Cell chapter → Create test → Tests shows Science/Exploration/Cell context and notes requirement.
6. Mobile cart → focus on Close; Earn visible; Escape restores trigger; background inert.
7. Mobile doubt demo submission → saved local record with actual ISO timestamp; no horizontal overflow.
8. Profile/Edit/Cancel opens one canonical editor without null-field errors; Progress and Profile use the same recorded streak.
9. Bookmark Science search → total 2/current view 1; mobile decorative artwork removed.
10. Shared mobile menu → Tab/Shift+Tab wrap, Escape closes and returns focus.
11. Study Mark done → 19% → Undo → 0%; task remains scheduled; Start uses the same conversation with short prompt.
12. Guest sidebar Study Bot → real guest planner, no authentication prerequisite.
13. Signed-in account fixture outage → recoverable Study Retry → reconnect → saved plans restored unchanged.
14. Demo tutor Mathematics/Grade 9 filter → one profile → request dialog → honest no-contact/no-queue result.
15. Reader tools open/close; mobile dark header/body/control contrast and page width verified.

Not exercised with real services: OAuth, email delivery, profile PATCH persistence, payment history/transactions, reward credits, human tutors, support email/phone, voice/WebRTC, OCR/image providers, full-length generated lessons/tests. Backup validation/round-trip is automated; browser file-picker import/export was not exercised. No personal files were uploaded or external messages sent.

### Screenshots

Evidence directory: ../tmp/audit-2026-10-02/evidence/

- [Live chat raw math before](../tmp/audit-2026-10-02/evidence/01-live-chat-before.png)
- [Narrow desktop chapter chooser before](../tmp/audit-2026-10-02/evidence/02-practice-desktop-before.png)
- [Mobile cart before](../tmp/audit-2026-10-02/evidence/03-shop-mobile-before.png)
- [Chat Retry after](../tmp/audit-2026-10-02/evidence/04-chat-retry-after.png)
- [Existing graph/playback after](../tmp/audit-2026-10-02/evidence/05-live-board-after.png)
- [Mobile cart after](../tmp/audit-2026-10-02/evidence/06-shop-mobile-after.png)
- [Desktop chapter chooser after](../tmp/audit-2026-10-02/evidence/07-practice-desktop-after.png)
- [Mobile doubt after](../tmp/audit-2026-10-02/evidence/08-doubt-mobile-after.png)
- [Canonical profile after](../tmp/audit-2026-10-02/evidence/09-profile-desktop-after.png)
- [Mobile bookmarks after](../tmp/audit-2026-10-02/evidence/10-bookmarks-mobile-after.png)
- [Study Undo/Review after](../tmp/audit-2026-10-02/evidence/11-study-undo-after.png)
- [Mobile dark chat/table after](../tmp/audit-2026-10-02/evidence/12-chat-mobile-dark-after.png)
- [Safe desktop reader after](../tmp/audit-2026-10-02/evidence/13-reader-after.png)
- [Dark mobile reader after](../tmp/audit-2026-10-02/evidence/14-reader-mobile-dark-after.png)
- [Demo request after](../tmp/audit-2026-10-02/evidence/15-tutor-demo-mobile-after.png)
- [Mobile Study Retry recovery after](../tmp/audit-2026-10-02/evidence/16-study-mobile-retry-after.png)

Saved screenshots were opened and visually inspected. The preview-control badge is development-only, not production UI.

## Automated results

All 22 commands below passed in this repair run. Except the separately described production probes, these are static/unit/integration tests with isolated data or provider mocks, not real financial/provider operations.

| Command | Result / scope |
| --- | --- |
| npm run check:audit | PASS: 10 frontend regression checks and 3 backend tests; Undo/backups/referral ticks/math/context/demo/labels/prompt budget/canonical IDs |
| npm run check:chatbot | PASS: frontend source/rendering and failure/Retry/cancellation checks |
| npm run check:chatbot:backend | PASS: semantic routing, malformed output, context, errors and security |
| npm run check:live-board | PASS: existing scene engines/control contracts |
| npm run check:rich-response | PASS: rich response renderer |
| npm run check:reasoning-status | PASS: status/accessibility/cleanup |
| npm run check:site | PASS: shared design/profile/billing/encoding/static consistency |
| npm run check:responsive | PASS: phone/tablet navigation contracts |
| npm run check:auth | PASS: isolated backend auth; SMTP is mocked despite console wording “real OTP delivery” |
| npm run check:curriculum | PASS: schema/gates/importer/coverage/integration contracts; not manual certification of every extracted chapter title |
| npm run check:study | PASS: 25 engine checks including 168 schedule combinations; 9 UI/storage; entry/guided flows; 8 session and 6 material backend tests |
| npm run check:test-materials | PASS: upload/remove/generation/retry/retake UI and 6 backend tests |
| npm run check:account-billing | PASS: static/mock account/billing; no live balance/history verified |
| npm run check:human-tools | PASS: static/mock demo tools |
| npm run check:payments | PASS: backend/server.js syntax only |
| npm run check:backend-secrets | PASS: secret configuration checks |
| npm run check:voice | PASS: mocked UI and authenticated token endpoint; no actual voice call |
| npm run check:vision | PASS: mocked OCR/failure/fallback; expected provider-unavailable diagnostic |
| npm run check:images | PASS: 11 provider/route mocks, semantic regressions, 16 credit-service and 6 replay checks, image URL validation; no real MongoDB/payment/image generation |
| node tests/chat-layout-state-check.js | PASS: lifecycle, existing/guest/archive/history, transition, reduced motion, suggestions, attachments/voice state |
| node tests/social-auth-ui-check.js | PASS: Google-only UI, unavailable/cancel/retry/profile-resolution fixtures; no OAuth account used |
| node tests/contact-form-check.js | PASS: 6 validation/draft/manual-attachment tests; no support delivery |

Non-fatal Python datetime.utcnow deprecation warning remains in existing model paths. The previously observed npm audit vulnerabilities in older Express/Mongoose/payment transitive dependencies remain a separate security-upgrade task; no broad dependency update was made. KaTeX was a targeted rendering dependency repair.

## Production investigation

Backend inspected: https://tutorly-api.onrender.com

- /openapi.json: 200, does not advertise /api/tests/generate.
- POST /api/tests/generate: 404; request ID req_69b19b01bbcf4ddd84835b28b1e1506b. Local endpoint exists: deployment/release mismatch, not proof of a missing frontend syllabus.
- /api/chatbot/health: 200 and reports configured provider.
- Three synthetic tutoring prompts returned 200: capital of Australia, 2x + 3 = 11, and a three-day Cell/Motion plan. Request IDs: req_3951f7dfac1b4016a208ba97091553ba; req_534ce401c73c460db704cc66e2e12bf1; req_0dc89bba56844888940908a89e27fd1f.
- Specific intermittent H01 and persistent send-lock H08 failures were not reproduced. These probes do not establish outage frequency or model correctness.

## Release gates / information needed

1. **Deployment approval:** release the backend containing the existing material-test route, then verify authenticated live test generation. Do not treat fixture generation as production success.
2. **Billing/service configuration and secure identity linkage:** configure the intended payment service through the existing TUTORLY_PAYMENT_API_BASE integration only after an authenticated server bridge is ready. Current legacy /history/:userId is not adequate authenticated access control; do not simply expose or redirect it publicly. History reads no longer manufacture a new billing identity. Confirm how existing payment records link to canonical accounts before migrating them.
3. **Content review:** approved chapter teaching/assessment material and biological/particle visuals; provider evaluations for Cell accuracy, long answers and common-mistake requests. Canonical curriculum snapshot was not regenerated here; existing chapter-title-quality work remains separate.
4. **Product/legal decisions:** refund/cancellation/auto-renewal terms, monthly-credit reset semantics, provider/retention/deletion disclosures. Do not invent policy dates.
5. **Service confirmation:** support address/phone ownership and realistic response expectations; real human-tutor queue and referral-reward ledger if these are to leave demo mode.
6. **Verification follow-up:** 11 implemented-but-unverified checklist items, interactive tablet matrix and genuine signed-in live-service checks. Existing dependency audit advisories should be assessed in a separately reviewed upgrade.

Before any release, isolate audit hunks from earlier auth/contact/curriculum work, review the mixed working tree, obtain user approval, and perform the listed production checks. No broad staging or push has been performed.
