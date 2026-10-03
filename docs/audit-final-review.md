# Tutorly — final pre-approval review

3 October 2026. Repository: C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly. **No commit, push, merge or deployment performed.**

This reviews the original audit's 11 implemented-but-unverified, 10 blocked and 2 not-reproduced findings. Those original classifications are retained below, with new regression evidence distinguished from complete verification. The full 61-ID checklist is [docs/audit-repair-checklist.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-repair-checklist.md>); earlier evidence is in [docs/audit-repair-report.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-repair-report.md>).

## 1. The 11 implemented-but-unverified findings, one by one

### 1. H03 — Incorrect biological foundation in guided Cell lesson

- Files: [backend/chatbot/ai/semantic_router.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/ai/semantic_router.py>), [tests/audit_backend_smoke.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/audit_backend_smoke.py>).
- Implemented: Added school-level Cell foundation/depth rules: the cell is the basic structural and functional unit; a membrane is a component. Avoid advanced transport mechanisms unless requested or curriculum-appropriate. The deterministic definition was already correct.
- Why not fully verified: Prompt tests cannot certify what the real language-model provider teaches. No fresh provider-backed Cell lesson or educator review was completed.
- Exact remaining manual test: With a signed-in Grade 9 student, start Cell in Study; ask what the basic unit is, compare a cell with its membrane, then request a simpler explanation and answer a mini-quiz. An educator must check definitions, explanations and corrections. Repeat through normal chat.

### 2. M07 — Live Board dark-mode contrast

- Files: [css/audit-repairs.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/audit-repairs.css>).
- Implemented: Scoped readable dark-mode styles for Board headings, explanations and buttons, retaining the existing Board.
- Why not fully verified: Engine/static checks and the light desktop graph passed. Standalone/split-view dark Board across phone, tablet and desktop has not been fully exercised.
- Exact remaining manual test: In dark mode, open a quadratic graph in chat and the standalone Board at 390, 768 and 1280px. Exercise Next, Previous, Play, Let Me Try and Close; inspect label/control contrast and focus states.

### 3. M16 — Demo leaderboard implies the student's personal achievements

- Files: [leaderboard.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/leaderboard.html>), [js/leaderboard.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/leaderboard.js>), [tests/audit-repairs-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/audit-repairs-check.js>).
- Implemented: Replaced signed-in identity/You claims with Sample learner, sample XP and illustrative-position disclosure.
- Why not fully verified: Source checks passed; the complete leaderboard browser/filter walkthrough was not repeated.
- Exact remaining manual test: As a guest and signed-in student, open the leaderboard on desktop/mobile. Switch Weekly, Monthly and All Time; verify all positions/XP remain labeled illustrative, no real profile name or personal rank is implied, and return to More Tools.

### 4. L01 — Requested answer depth and common-mistake guidance omitted

- Files: [backend/chatbot/ai/semantic_router.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/ai/semantic_router.py>), [backend/chatbot/ai/groq.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/ai/groq.py>), [tests/audit_backend_smoke.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/audit_backend_smoke.py>).
- Implemented: Preserved explicitly requested Common Mistakes sections; scoped removal of unsolicited headings; raised default completion allowance to 2400 with a 6000 cap and explicit truncation failure handling.
- Why not fully verified: Offline postprocessor/provider mocks passed, but no real long-answer fulfillment check was run against the changed local backend.
- Exact remaining manual test: On a staging backend with these changes and a configured provider, request approximately 700 words on photosynthesis including common mistakes. Check actual depth, completeness and requested section. Then request one sentence; verify concise mode. Exercise truncation failure and Retry.

### 5. L05 — Empty Progress lacks a useful next action

- Files: [progress.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/progress.html>).
- Implemented: Added existing chat/notes destinations and an explanation of browser-local learning records, without fake completion.
- Why not fully verified: Site checks passed; both empty-state links were not clicked through as a genuinely empty authenticated account.
- Exact remaining manual test: Use a fresh test student on desktop/mobile. Open empty Progress, follow each offered chat/notes action, confirm the correct destination and usable back navigation. Opening pages alone must not award curriculum completion.

### 6. L09 — Support identity and response expectations unclear

- Files: [contact.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/contact.html>), [css/contact.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/contact.css>), [js/contact.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/contact.js>), [tests/contact-form-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/contact-form-check.js>).
- Implemented: Retained the user-approved support@tutorly.co.in and +91 73307 66674. Existing contact work describes an email draft, manual attachment and non-guaranteed response. This contact implementation was pre-existing work, not newly authored by the audit.
- Why not fully verified: Six validation/draft tests passed; mailbox ownership/delivery, telephone availability and actual response expectations were not verified. No external support message or call was made.
- Exact remaining manual test: Owner confirms mailbox and phone ownership. With approval, send a harmless synthetic support request from a real mail client and confirm receipt/reply; call the published number. Verify invalid email, optional phone, attachment limits and that opening a draft is not reported as successful delivery.

### 7. P01 — Navigation patterns inconsistent

- Files: [js/global-layout.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/global-layout.js>), [maths_gpt.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/maths_gpt.html>).
- Implemented: Reused the existing shared drawer, corrected Practice/Tests destinations and retained Progress/More Tools. Responsive tests passed; mobile chat opens by keyboard.
- Why not fully verified: A full cross-page guest/signed-in navigation comparison is incomplete. The QA badge overlays the top-right control in the local fixture only; keyboard activation was used for the chat drawer.
- Exact remaining manual test: Walk chat, Study, Tests, Progress, More Tools, Profile, Bookmarks and legal pages at 390/768/1280px, guest and signed in. Check destinations, active states, back navigation, drawer Tab/Shift+Tab containment, Escape and focus return.

### 8. P06 — Live Board content too small

- Files: [js/live-board/board-engine.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/live-board/board-engine.js>).
- Implemented: Fit the current step focus using the existing camera and bounded dimensions/scale; no duplicate renderer.
- Why not fully verified: Actual quadratic graph/playback was tested; diverse supported scenes and all viewport bounds were not visually checked.
- Exact remaining manual test: At phone/tablet/desktop sizes, exercise each step of supported graph, geometry, forces, circuit and ray scenes. Check labels, focus region, clipping, zoom/reset and drawing controls. Unsupported scenes must stay unavailable rather than fabricate a diagram.

### 9. P09 — Coins, tokens and credits terminology inconsistent

- Files: [shop.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/shop.html>), [refer_earn.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/refer_earn.html>), [frontend/subscription/billing.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/frontend/subscription/billing.js>).
- Implemented: Shop uses learning coins, subscriptions use credits, and demo referrals explicitly issue no rewards. No conversion economy was invented.
- Why not fully verified: Copy/static checks passed; a whole-product currency inventory and any intended conversion rule need owner review.
- Exact remaining manual test: Inspect Shop, wallet, referral, plans, billing, credit usage and image-price copy on desktop/mobile. Verify the two units are clearly distinct, no demo issues real value and no unsupported conversion is promised. Approve any intended conversion rule separately.

### 10. P11 — Button shape and spacing inconsistent

- Files: [css/audit-repairs.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/audit-repairs.css>), [css/chat-layout.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/chat-layout.css>).
- Implemented: Aligned affected shared actions to 12px radii, 44px minimums and visible focus styles.
- Why not fully verified: Touched screens were inspected, not every button/dialog in the product. This is not a full accessibility certification.
- Exact remaining manual test: Compare desktop/mobile light/dark buttons across all changed pages. Keyboard-tab through dialogs/actions; check clear focus, usable touch targets, text wrapping and no overlap. Record remaining exceptions rather than claiming universal 44px compliance.

### 11. P12 — Legal and release-note pages inconsistent

- Files: [Terms_Conditions.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/Terms_Conditions.html>), [privacy.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/privacy.html>), [js/release-notes.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/release-notes.js>), [js/global-layout.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/global-layout.js>).
- Implemented: Used real Privacy/Terms routes and Back to Chat; aligned section heading hierarchy with release notes.
- Why not fully verified: Static checks passed; complete mobile visual/link testing is outstanding. Legal completeness remains separately blocked by M26/L08.
- Exact remaining manual test: Open Terms, Privacy and release notes at 390/768/1280px in both themes. Follow every internal legal/back link; check headings, overflow and reading order. Obtain separate legal approval for policies; visual verification is not legal approval.

## 2. The 10 blocked findings, one by one

None of these was diagnosed merely by assuming credentials are missing. The actual blockers differ:

### 1. H02 — Reviewed lessons are missing after generic filler removal

- Blocked / why: Metadata was incorrectly expanded into generic/hardcoded teaching text. The unsafe filler and visit-based completion were removed; the reader now truthfully shows official source and reviewed-content-pending.
- Category: Missing content; educator/content review.
- Launch requirement: Must before offering Learn as complete/reviewed lessons. Can wait in an explicitly metadata-only beta.
- To unblock: Supply/review original lessons; verify accuracy and chapter mapping before changing pending states.

### 2. H04 — Production cannot generate uploaded-material tests

- Blocked / why: Local /api/tests/generate exists and its tests pass. Prior production POST returned 404; today's production OpenAPI still has no such route.
- Category: Deployment/version mismatch and release approval; not a demonstrated missing-credentials problem.
- Launch requirement: Must before launching Tests as working.
- To unblock: After approval, deploy the matching backend; generate from synthetic notes with a real signed-in account, save, retake and test failure recovery.

### 3. H09 — Accurate supported science visuals missing

- Blocked / why: Unsupported Board requests fell through to generic boxes/default graph. Fallback is now honest unavailability, but accurate biological/particle templates are not implemented/reviewed.
- Category: Missing renderer/content templates; educator review.
- Launch requirement: Can wait only if unsupported visuals are unavailable and not promised. Must before promising these diagrams.
- To unblock: Implement/review the missing visuals in the existing engine; verify every supported scene. Study must continue without Live Board.

### 4. H12 — Secure authenticated payment history

- Blocked / why: Browser static origin/legacy billing ID does not map safely to the canonical authenticated account. Legacy Node history-by-user-ID routing is not an adequate authenticated bridge.
- Category: Billing service configuration; backend authentication/identity integration; security.
- Launch requirement: Must before paid launch.
- To unblock: Design and verify authenticated service routing/account ownership. Test two separate accounts for isolation, empty/history/error/Retry. Do not simply point the browser at a public legacy history endpoint.

### 5. M15 — Some quests cannot fulfill their objectives

- Blocked / why: Mastery/lesson/weak-area objectives lack reviewed evidence and completion rules. Unsupported objectives are disabled rather than awarding fake progress; existing practice routes remain useful.
- Category: Missing assessment/content; product completion rules.
- Launch requirement: Can wait while disabled and not advertised as earnable.
- To unblock: Approve completion evidence and rewards; implement/review assessments, then verify objective progress and anti-fake-completion behavior.

### 6. M19 — Billing synchronization/freshness

- Blocked / why: A freshness message cannot establish synchronization without a working authenticated billing service/identity bridge. Error/Retry/status copy is implemented.
- Category: Billing configuration and backend integration; depends on H12.
- Launch requirement: Must before paid launch.
- To unblock: Configure the secure service; test actual subscription/history/balance refresh, failure retention and identity isolation.

### 7. M21 — Monthly-credit reset policy

- Blocked / why: Reset date can be null and the product has no approved reset semantics; UI now displays unknown rather than inventing a date.
- Category: Product decision; backend billing policy implementation.
- Launch requirement: Must before selling/promising a monthly resetting allowance. Can wait only with an explicitly approved no-reset beta offer.
- To unblock: Approve cadence, timezone, allowance/carryover and subscription consequences; implement then test boundary dates and account balances.

### 8. M26 — Privacy retention/deletion/provider disclosures

- Blocked / why: Copy now distinguishes browser-local, account and AI data, but actual processor inventory, retention/deletion practice and approved commitments are not evidenced.
- Category: Service inventory/configuration; legal and product decisions.
- Launch requirement: Must before public launch, especially with minors or private documents.
- To unblock: Inventory real providers/storage, document retention/deletion/access, reconcile implementation and obtain legal approval. Test promised deletion/access behavior.

### 9. L08 — Refund/cancellation/auto-renewal terms

- Blocked / why: No approved refund window, cancellation effects or renewal rules were supplied; no consequential policy was invented.
- Category: Legal; product; payments.
- Launch requirement: Must before paid launch.
- To unblock: Approve policy and legal wording, align checkout/customer communications, and test cancellation/refund/support operations.

### 10. L10 — Real referral attribution/reward ledger

- Blocked / why: Hardcoded metrics were not backed by attribution or wallet provenance. They now disclose demo status without automatic reward promises.
- Category: Missing backend ledger; product reward/abuse rules.
- Launch requirement: Can wait if visibly demo/disabled and not marketed as real rewards.
- To unblock: Approve attribution/reward rules; implement secure auditable ledger/idempotency/abuse prevention and test qualifying/nonqualifying referrals.

## 3. The 2 not-reproduced findings

### H01 — Ordinary tutoring requests fail intermittently

Original report: ordinary tutoring questions intermittently fail rather than return an answer.

Steps tried in the audit: three synthetic requests to the configured production chatbot: capital of Australia; solve 2x + 3 = 11; and a three-day Cell/Motion exam plan. All returned HTTP 200. Request references: req_3951f7dfac1b4016a208ba97091553ba; req_534ce401c73c460db704cc66e2e12bf1; req_0dc89bba56844888940908a89e27fd1f. In this final pass, the actual local chat was exercised with a normal reply and an intentional 503 followed by Retry. Today's production chatbot health returned status ok and provider_configured true.

Current behavior: those production probes succeeded, and a deliberate local transport failure recovers through Retry in the same conversation. The original intermittent frequency/cause is **not established or declared fixed**. Still needed: request IDs/timestamps from a real failure and correlated provider/service logs; avoid an unbounded stress run or pretending fixtures prove production reliability.

### H08 — One conversation stops accepting sends

Original report: one ongoing conversation becomes permanently unable to accept subsequent messages.

Steps tried: send normally; deliberately fail a reply and retry; begin a delayed reply, Stop it, then send again; open stored history, start a new conversation and restore existing messages. Automated lifecycle/failure tests cover cleanup, abort/version guards and restoration. This final browser pass repeated failure → Retry and slow response → Stop → graph request → actual Board opening in the same conversation.

Current behavior: subsequent sends work in those cases; a permanent lock was not reproduced. Defensive cleanup was implemented earlier, but it does not prove the particular original fault is eliminated. Still needed: failing conversation reproduction and console/request logs (without disclosing private conversation text).

## 4. Exact file inventory for this repair pass

This is **audit authorship**, not a claim that every dirty file in the mixed working tree belongs to the audit. Earlier auth/contact/curriculum work remains separate. Overlapping files received scoped audit changes without discarding their pre-existing hunks.

### Modified (55 files)

- [backend/main.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/main.py>)
- [backend/chatbot/ai/groq.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/ai/groq.py>)
- [backend/chatbot/ai/semantic_router.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/ai/semantic_router.py>)
- [backend/chatbot/material_test.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/material_test.py>)
- [maths_gpt.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/maths_gpt.html>)
- [js/app.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/app.js>)
- [js/global-layout.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/global-layout.js>)
- [js/chatbot/markdown-renderer.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/chatbot/markdown-renderer.js>)
- [js/chatbot/rich-response-renderer.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/chatbot/rich-response-renderer.js>)
- [css/chat-layout.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/chat-layout.css>)
- [css/tutorly-foundation.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/tutorly-foundation.css>)
- [lessons.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/lessons.html>)
- [practice.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/practice.html>)
- [tests.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests.html>)
- [js/lessons/lesson-data.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/lessons/lesson-data.js>)
- [js/lessons/lesson-module.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/lessons/lesson-module.js>)
- [js/practice-curriculum.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/practice-curriculum.js>)
- [js/exams/exam-system.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/exams/exam-system.js>)
- [js/exams/material-input.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/exams/material-input.js>)
- [js/study/plan-engine.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/study/plan-engine.js>)
- [js/study/plan-store.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/study/plan-store.js>)
- [js/study/planner-ui.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/study/planner-ui.js>)
- [js/study/session-controller.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/study/session-controller.js>)
- [js/live-board/chat-panel.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/live-board/chat-panel.js>)
- [js/live-board/app.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/live-board/app.js>)
- [js/live-board/board-engine.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/live-board/board-engine.js>)
- [js/live-board/mock-provider.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/live-board/mock-provider.js>)
- [js/campus.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/campus.js>)
- [js/profile-hub.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/profile-hub.js>)
- [js/bookmarks.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/bookmarks.js>)
- [js/quests.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/quests.js>)
- [progress.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/progress.html>)
- [more-tools.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/more-tools.html>)
- [ask-doubt.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/ask-doubt.html>)
- [find-tutor.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/find-tutor.html>)
- [leaderboard.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/leaderboard.html>)
- [js/ask-doubt.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/ask-doubt.js>)
- [js/find-tutor.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/find-tutor.js>)
- [js/leaderboard.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/leaderboard.js>)
- [shop.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/shop.html>)
- [refer_earn.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/refer_earn.html>)
- [frontend/subscription/billing.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/frontend/subscription/billing.js>)
- [frontend/subscription/payment-history.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/frontend/subscription/payment-history.js>)
- [privacy.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/privacy.html>)
- [Terms_Conditions.html](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/Terms_Conditions.html>)
- [js/release-notes.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/js/release-notes.js>)
- [package.json](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/package.json>)
- [package-lock.json](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/package-lock.json>)
- [scripts/preview-chat.cjs](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/scripts/preview-chat.cjs>)
- [tests/fixtures/chat-preview-bootstrap.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/fixtures/chat-preview-bootstrap.js>)
- [tests/chatbot-static-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/chatbot-static-check.js>)
- [tests/site-consistency-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/site-consistency-check.js>)
- [tests/test-material-ui-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/test-material-ui-check.js>)
- [tests/chat-layout-state-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/chat-layout-state-check.js>)
- [tests/adaptive-teaching-ui-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/adaptive-teaching-ui-check.js>)

### Created (30 files, including each vendored file)

- [css/audit-repairs.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/css/audit-repairs.css>)
- [docs/audit-repair-checklist.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-repair-checklist.md>)
- [docs/audit-repair-report.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-repair-report.md>)
- [docs/audit-final-review.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-final-review.md>)
- [scripts/audit-preview-catalog.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/scripts/audit-preview-catalog.py>)
- [tests/audit-repairs-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/audit-repairs-check.js>)
- [tests/audit_backend_smoke.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/audit_backend_smoke.py>)
- [assets/vendor/katex/LICENSE](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/LICENSE>)
- [assets/vendor/katex/katex.min.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/katex.min.js>)
- [assets/vendor/katex/katex.min.css](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/katex.min.css>)
- [assets/vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Size4-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Size4-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Size3-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Size3-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Size2-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Size2-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Size1-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Size1-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Script-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Script-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2>)
- [assets/vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Math-Italic.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Math-Italic.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Main-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Main-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Main-Italic.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Main-Italic.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Main-Bold.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Main-Bold.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2>)
- [assets/vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2>)
- [assets/vendor/katex/fonts/KaTeX_AMS-Regular.woff2](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/assets/vendor/katex/fonts/KaTeX_AMS-Regular.woff2>)

Vendored KaTeX is the official 0.16.47 package, with its license. It is a targeted rendering repair, not a broad dependency upgrade.

### Changes made during this final verification turn only

- [tests/adaptive-teaching-ui-check.js](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tests/adaptive-teaching-ui-check.js>): updated its mocked DOM/context with querySelector, window and an inactive Study session. The real app now references those dependencies. No assertions were weakened; no browser launcher was run.
- [docs/audit-final-review.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-final-review.md>): this review artifact.
- Seven local screenshots listed below. No production/application code was changed in this final turn.

### Pre-existing work specifically not authored or overwritten by the audit

The pre-audit dirty inventory included adaptive_teaching_engine.py, contact.html, css/auth-entry.css, js/auth-entry.js, js/social-auth-ui.js, login.html, js/chatbot/chat-suggestions.js, docs/curriculum-import.md, docs/social-auth-setup.md, scripts/import_curriculum.py, scripts/review_curriculum_snapshot.py, tests/social-auth-ui-check.js, contact assets/styles/script/tests, integration draft files and title-quality importer/tests. These were not silently claimed as audit changes or reverted. Some shared chat/layout/test files were already dirty and are correctly listed as overlapping audit-modified files above. Generated tmp evidence is QA output, not a deployment asset.

## 5. Protected unrelated local work

**Confirmed: the audit did not modify or discard unrelated work in [backend/chatbot/adaptive_teaching_engine.py](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/backend/chatbot/adaptive_teaching_engine.py>).** It was already dirty before the audit, with 2 insertions and 2 deletions. It is not identical to HEAD, and it must not be included as an audit-authored repair.

The SHA-256 at the start of this final review and on the final read-only check is identical:

`00CA377269E428D177B661AC20717B0F3F15ED35A2EAE74A85E900F5E2DA46E8`

HEAD remains `2e65d38c4684054b551e1d603d3cc4ce3a11f2f5`. No staging, commit, merge, push or deployment action was taken.

## 6. Final regression results

### Automated — 26 distinct commands pass after the fixture-only repair

The first run had 18/19 passing and a TypeError from the older adaptive UI fixture's missing DOM method. After the fixture repair, its unchanged behavior/security assertions pass. Seven additional commands pass. That means **26/26 regression commands pass on final runs**, not that every real service or manual finding is verified.

| Command | Final result / evidence scope |
| --- | --- |
| npm run check:audit | PASS; 10 frontend regression checks and 3 backend tests, including Undo, backups, render math, demos, canonical handoffs and answer rules |
| npm run check:chatbot | PASS; static chat plus failure/Retry/Stop contracts |
| npm run check:chatbot:backend | PASS; routing, malformed provider output, context, failure/security mocks |
| npm run check:study | PASS; 25 planner checks including 168 schedule combinations; 9 storage/UI checks; entry/guided flow; 8 session and 6 material backend tests |
| npm run check:test-materials | PASS; upload/remove, generation, failure retention, retake and 6 backend tests |
| npm run check:live-board | PASS; existing engine/control contracts |
| npm run check:auth | PASS; isolated password/OTP/session backend. SMTP is mocked despite test console's wording “real OTP delivery” |
| npm run check:site | PASS; design/profile/copy/static consistency |
| npm run check:responsive | PASS; phone/tablet navigation source contracts |
| node tests/chat-layout-state-check.js | PASS; same composer lifecycle, reduced motion, guest/history/archive, rotation, editable prefills, attachment/voice state |
| node tests/social-auth-ui-check.js | PASS; Google-only view, cancel/unavailable/Retry/profile-resolution/expired-session mocks |
| python tests/auth_onboarding_backend_smoke.py | PASS; 56 student/teacher, private-degree, ownership/validation/migration cases |
| node tests/education-registry-check.js | PASS; 17 checks; 31 boards/programmes and 29 subject preferences; aliases, sources, search and retry |
| node tests/profile-hub-check.js | PASS; canonical hub/editor/preferences and responsive structure |
| python tests/profile_personalization_smoke.py | PASS; isolated persistence/validation |
| python tests/social_auth_backend_smoke.py | PASS; provider verification/state/linking/conflict/session mocks, not actual Google/Microsoft/Apple sign-in |
| node tests/chat-suggestions-check.js | PASS; six native prefills, eight excluded external integrations, rotation/storage/accessibility/secret isolation |
| python tests/adaptive_teaching_smoke.py | PASS; progression, repair, isolation/preferences and mastery/reward boundaries with provider mocks |
| node tests/adaptive-teaching-ui-check.js | PASS after the documented fixture-only change; teaching followups, context/voice/historical actions. No --browser option used |
| npm run check:curriculum | PASS; schema/verification gates, importer/coverage and integration contracts, not manual certification of each chapter title |
| npm run check:account-billing | PASS; static/mock account/billing, not live transactions/history |
| npm run check:rich-response | PASS; rich renderer |
| npm run check:reasoning-status | PASS; accessibility/status/cleanup |
| npm run check:human-tools | PASS; demo tool contracts, not real tutor delivery |
| node tests/contact-form-check.js | PASS; 6 draft/validation/manual-attachment checks, not support delivery |
| npm run check:backend-secrets | PASS; configuration/secret isolation checks |

Additional read-only checks: the normally configured git diff --check passed (line-ending warnings only). A separate diagnostic with autocrlf normalization disabled flagged raw CRLF characters throughout existing Windows files; it is not a passing raw-line-ending check. No broad line-ending rewrite was made. Existing non-fatal Python datetime.utcnow deprecation warnings are not runtime failures.

**Separate security check is not green:** npm audit reports 11 dependency advisories (6 high, 5 moderate); with development dependencies excluded, 7 remain (2 high: axios and form-data; 5 moderate). This does not establish exploitability of every advisory, but shipped dependency reachability and patches must be assessed before public/paid launch. No automatic upgrade or force fix was performed.

### Requested flows — what is actually established

| Flow | Result / limits |
| --- | --- |
| Normal chat | Local actual UI send/first-message transition PASS; provider mocked. Earlier three production probes 200; today's production health ok |
| Retry | Browser intentional 503 → Retry → reply in same chat PASS; failed request stays an honest failure |
| Stop generation | Browser delayed reply → Stop → “Stopped. You can send another message.” → subsequent graph reply PASS |
| Study Bot | Sidebar opens planner; Start resumes the same chat/task; no Study Live Board panel. Local/automated PASS; real lesson quality not certified |
| Undo | Browser done → 19% → Undo → 0%, task pending/rebalanced PASS |
| Review | Review in Tutorly link restores the saved task conversation PASS; preserves old stored messages rather than rewriting history |
| Study-plan generation | Automated tomorrow/3/7/30-day and capacity/date/missed-work/performance scenarios PASS; actual planner loaded persisted plans and recalculated today. No real AI quality claim |
| Chapter handoffs | Canonical-ID backend/frontend tests rerun PASS; earlier browser actual-catalog Science Cell → existing chat and Cell → Tests verified. Exact browser click path was not repeated this final turn |
| Live Board | Browser real quadratic scene + Next + split view PASS; New Chat clears scene. Complete diverse-scene/dark matrix still M07/P06 |
| Login/auth pages | Actual settled Google-only Welcome Back screen checked at 390 × 844 and 1280 × 900: single column/split, no page overflow. Unavailable/Retry state checked. Returning synthetic identity resolves directly into its workspace, not role selection |
| Student onboarding | 56-case backend suite includes Grade 1/12, age, optional school, normalized board/grade and preservation/migration; registry/profile UI tests pass. Real new Google student's complete browser walkthrough remains unverified |
| Teacher onboarding | Backend suite includes required owned private degree, pending—not verified, profile/preferences/grade/availability validation and returning role. Real authenticated four-page browser flow/private upload preview/removal/retry is still unverified |
| Profile | Actual synthetic profile restores Grade 9/CBSE, Edit opens one labeled canonical editor, Cancel restores read-only data PASS; real profile save/refresh still needs a test account |
| Mobile chat | Actual Study conversation at 390px: page scrollWidth 390, usable bottom composer and no Live Board panel; screenshot inspected. Earlier dark/mobile table evidence retained; real on-device keyboard/voice not tested |
| Responsive navigation | Static phone/tablet checks PASS, chat drawer keyboard activation checked. Earlier shared drawer focus/Tab/Shift+Tab/Escape checks retained; complete page/device matrix outstanding P01 |
| Slash command palette | **Not implemented in current UI.** Typing / leaves literal input; no menu/dialog appears. No palette handler found in current entry/app source. Cannot call this feature verified or fixed |
| Plugin/app UI | Six native prompt prefills/rotation pass. Eight external provider suggestions remain unavailable/excluded. Composer + is image upload, not an app picker. No functioning external app-picker/connected-integration UI was found; no external action claimed successful |

The absent palette/app picker are additional scope gaps, not fabricated new original audit IDs. Their inclusion in launch is a product/scope decision; no code was added because this turn authorizes verification, not additional feature implementation.

### Production recheck (read-only, 3 October 2026, approximately 15:14 UTC)

- https://tutorly-api.onrender.com/api/chatbot/health: status ok; provider_configured true.
- https://tutorly-api.onrender.com/openapi.json: /api/tests/generate still absent. Prior production POST was 404 (req_69b19b01bbcf4ddd84835b28b1e1506b); no deployment undertaken here.
- https://tutorly-api.onrender.com/api/auth/providers: Google enabled; Microsoft and Apple disabled. This is **configuration evidence, not end-to-end OAuth success**. The local preview intentionally blocks external OAuth/network, explaining its unavailable message; do not confuse that fixture with a diagnosed live Google outage.

No real accounts were created, private documents uploaded, payments made, support messages sent or provider permissions accepted. Student/teacher persistence/security tests use isolated synthetic databases. Real login, role/profile resolution, new student/teacher completion and private-document lifecycle remain release smoke-test requirements.

### Screenshot evidence (saved and visually inspected)

All these are actual local frontend screenshots with synthetic QA fixtures, not real service transactions. The Local fixture preview badge is development-only. Initial auth captures taken during settling were replaced with settled captures and then inspected; no blank/transient frame is offered as passing evidence.

- [tmp/audit-final-review-2026-10-03/01-chat-live-board.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/01-chat-live-board.png>) — Desktop existing Live Board graph/playback.
- [tmp/audit-final-review-2026-10-03/02-study-completed.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/02-study-completed.png>) — Study completed task, 19%, Review and Undo.
- [tmp/audit-final-review-2026-10-03/03-study-undo.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/03-study-undo.png>) — Undo returns to 0%, preserves task.
- [tmp/audit-final-review-2026-10-03/04-mobile-study-session.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/04-mobile-study-session.png>) — Mobile same-session Study, no Live Board panel.
- [tmp/audit-final-review-2026-10-03/05-mobile-auth.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/05-mobile-auth.png>) — Settled single-column Google-only auth with recoverable local unavailable state.
- [tmp/audit-final-review-2026-10-03/06-desktop-auth.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/06-desktop-auth.png>) — Settled split-screen Google-only auth.
- [tmp/audit-final-review-2026-10-03/07-profile.png](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/tmp/audit-final-review-2026-10-03/07-profile.png>) — Canonical synthetic profile after Edit/Cancel.

Earlier screenshots 01–16 remain listed in [docs/audit-repair-report.md](<C:/Users/JAYVARDHAN REDDY/OneDrive/Desktop/Tutorly/docs/audit-repair-report.md>) for chapter handoffs, dark chat/reader, guest Study, shared menu focus, cart, doubt and tutor demo flows.

## 7. Release judgment

### Must fix before launch

- H04: matching production test-generation backend and a real uploaded-notes test/retake smoke test before presenting Tests as operational.
- M26: accurate approved privacy/processor/retention/deletion commitments for public launch.
- H12/M19/M21/L08: secure billing identity/history/sync, approved allowance reset and refund/renewal terms before accepting payments.
- H03: real provider-backed Cell lesson accuracy review; complete real Google → returning role/profile and new student/teacher onboarding/private-degree smoke tests.
- Triage/patch the shipped high-severity dependency advisories through a separately reviewed change, or document why a specific advisory is unreachable. Do not blindly force-upgrade dependencies.

### Should fix before launch

- L01 actual requested long-answer behavior; M07/P06 dark/diverse-scene Board matrix; L05/P01/P11/P12 remaining CTA/navigation/mobile/legal visual checks.
- M16/P09 ensure demo/currency claims remain honest throughout; L09 confirm support mailbox/telephone availability.
- Explicitly decide whether slash palette/app picker are included in launch. If required, they are not done; native prefills are not substitutes for real integrations.

### Can safely wait until after launch

- H02 reviewed Learn content only while presented as metadata/pending, not as completed reviewed lessons.
- H09 missing science visuals only while unsupported and not promised; M15 unsupported quests only while disabled.
- L10 real referrals only while demo/disabled; external integrations/app picker/palette only if explicitly deferred with no success claims. Cosmetic consistency expansion and cross-device sync can wait while limitations are clear.

### Ready to push? No

Regression commands pass after a fixture-only repair, but production Tests remains missing, live OAuth/onboarding/degree and pedagogical checks are outstanding, legal/billing gates are unresolved, and shipped dependency advisories need security review. The mixed dirty tree must be reviewed selectively so unrelated adaptive/auth/contact/import work is not bundled automatically. User approval is still required. Nothing was committed, pushed, merged or deployed.
