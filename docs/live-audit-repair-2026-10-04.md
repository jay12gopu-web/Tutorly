# Tutorly live-audit repairs — 4 October 2026

## Scope and release status

Baseline: frontend/main commit `9ed2d22fa83ad0e370ac4d0a9bdf2cffb7a82a3d`.
Scope: standalone Live Board entry, authenticated Profile presentation, and mobile navigation contrast. No backend, authentication model, curriculum data, Study Bot implementation or integrated chat-board engine was changed.

The user subsequently approved pushing these repairs to main. Implementation commit `120d7d6a5cfa04524d2a832376fee12d8c16e68c` was pushed and confirmed on the remote main branch. Initial production checks still showed the old page; a later fresh browser load picked up the repaired frontend. Pre-push checks and the narrower post-push verification are distinguished below.

### Post-push production verification

- Standalone Live Board displayed the new labelled composer and “Ready for a topic”. Entering `Graph y = x^2` generated three steps. Play changed to Pause, advanced to Step 3, stopped, and left the real parabola visible (one graph path, no horizontal overflow).
- Signed-out Profile at 390×844 displayed only the honest signed-out state, with account content hidden. Sign in opened the existing Google-only auth entry. The page referenced `profile-hub.css?v=session-20261004`.
- Mobile chat loaded `chat-layout.css?v=contrast-20261004`. Its light drawer had dark `#172033` branding on white, opened/closed correctly and had no horizontal overflow. Dark-mode contrast was verified locally, not in an authenticated production session.
- A new real guest prompt after deployment received a two-sentence explanation of blue light / Rayleigh scattering. This was not a fixture response.
- Actual Google authentication, new-user onboarding and authenticated production Profile remain unverified pending human participation. No deployment or hosting configuration was manually changed.

## Repairs

### Live Board entry — fixed and locally verified

The production empty page had no input even though its help text said to enter an equation below. Its controller was looking for obsolete `liveBoardInput` / `liveBoardSend` elements, and the initial status never left “Getting board ready…”.

- Added a labelled Topic or equation form and Draw button to the existing page, using the existing lesson provider and board renderer.
- Empty entry now says “Ready for a topic”; playback and drawing controls remain disabled until there is a supported visual.
- Keyboard Enter submits; generation has a busy state and prevents duplicate submissions.
- New standalone topics do not borrow another conversation's stored route. Explicit matching conversation handoffs retain their context and Back to Chat destination.
- Play advances the graph steps, stops at the end, and can restart playback. Unsupported topics do not produce a misleading visual.

Browser: `Graph y = x^2` produced a parabola, three steps and working playback on desktop. The phone composer submitted using Enter and Next revealed the actual graph. Existing chat Open/View Live Board still opened the same integrated board, including desktop split view and mobile overlay. These local interactions used the preview's explicitly labelled response fixtures; the equation renderer and page controllers were real.

### Profile session presentation — fixed and locally verified

The old controller immediately built a profile from device caches, defaulted identity to Student, defaulted subscription to Standard/100 credits, and rendered device activity before checking authentication. The static Security fallback also asserted that an email login was active without account evidence.

- Account content is hidden from the initial HTML until `/api/auth/me` confirms an authenticated identity.
- Guest, expired-session, unavailable-backend, onboarding-required and loading states are distinct. Guests/expired users have a working Sign in link; network errors have Retry.
- A 401 clears the existing session using the existing auth client, without clearing unrelated learning history or study plans.
- A network failure hides cached account details instead of presenting them as authenticated data.
- Account information uses the authenticated response. Late responses after logout are ignored; returning to Profile revalidates the session.
- No connected-login method is claimed from static fallback text.
- The current auth response does not include a verified subscription/balance. Profile therefore shows “Plan unavailable” / “Credits unavailable”, not an invented allowance or an untrusted device-cache balance. Future authenticated subscription data is accepted only with a known plan and valid numeric balance, including zero.
- Device activity is labelled as activity on this device and is only rendered after session confirmation.

Browser: guest and expired states hid identity, credits, settings and activity. Sign in reached the existing auth entry. An unavailable account fixture showed Retry; reconnecting and retrying restored the synthetic Grade 9 / CBSE profile. Its untrusted cached Pro/1,000-credit values were not displayed as verified Profile balances.

### Mobile navigation contrast — fixed and locally verified

The chat mobile-polish sheet forced a white drawer even in dark mode, while the dark brand remained near-white. Shared mobile Profile navigation also used light-only surfaces with dark-mode text.

- Chat drawer, brand, navigation, account controls and secondary labels now use the existing chat theme tokens with sufficient selector priority.
- Dark Profile header, drawer and bottom navigation now use dark Profile surfaces. Existing drawer behavior, active states and breakpoints are preserved.
- Changes are scoped to chat and Profile; shared navigation on unrelated pages was not redesigned.

Measured branding/navigation pairs:

| Surface | Text | Background | Contrast |
| --- | --- | --- | --- |
| Dark chat drawer | `#ecf0fb` | `#192132` | 14.12:1 |
| Light chat drawer | `#172033` | `#ffffff` | 16.27:1 |
| Dark Profile navigation | `#f5f7ff` | `#11182b` | 16.51:1 |

The accessibility review guided scoped contrast, labelled composer, visible focus and keyboard checks. This is not a claim of a full WCAG certification.

## Browser verification matrix

“Fixture” means isolated local preview data, not a real Google identity, real AI answer, upload, billing balance or external integration.

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Homepage / main chat | Passed, production | Existing home route reached main chat; public guest chat loaded. |
| Real chat response | Passed, production | Asked why the sky looks blue; received a real two-sentence Rayleigh-scattering explanation. |
| Retry after response failure | Passed, local fixture | Deliberate 503 response showed Retry; retrying with the restored response fixture produced an answer. |
| Stop generation | Passed, local fixture | Stopped a delayed response; “Stopped” state appeared and composer recovered without delivering the pending answer. Production Stop was visible but was not clicked. |
| Study setup | Passed, local fixture | Date/calendar → subject → target/worry → materials → chapters → plan. Created a seven-day Science plan ending before exam day. |
| Completed-task Undo | Passed, local fixture | Marking today complete changed progress; Undo returned it to incomplete and rebalanced remaining work. |
| Review after actual Study session | Passed, local fixture | Started Cell task in Tutorly, finished and saved it, then Review reopened that same conversation and chapter context. |
| Review after manually marking an unstudied task complete | **Failed, existing out-of-scope edge case** | With no session conversation ID, Review links to plain `maths_gpt.html` and can restore an unrelated previous chat. No Study code was changed in this repair. |
| Chapter handoff with saved Board/Grade | Passed, local fixture with real catalog | Saved CBSE / Grade 9 selected verified “Cell: The Building Block of Life” and “Describing Motion Around Us” from the repository catalog. Start retained the stable chapter ID and plan/task context. Lesson answer itself was a fixture. |
| Standalone Live Board / graph / playback | Passed, local browser | Empty composer → `Graph y = x^2` → rendered graph → playback, Next, replay. |
| Live Board from chat | Passed, local fixture | Existing response action opened integrated board; desktop split view and mobile overlay remained functional. |
| Profile guest / expired / backend error / Retry | Passed, local browser and controller tests | No fabricated identity/balance/activity; Sign in and account Retry exercised. |
| Production Google entry | Partially verified | Enabled Continue with Google button present at desktop and phone sizes. Actual provider sign-in and consent require the user. |
| Student onboarding | Backend checks passed; full provider/browser flow unverified | Isolated onboarding/migration tests passed. A fresh Google student must still complete the browser flow. |
| Teacher onboarding | Backend checks passed; full provider/browser flow unverified | Isolated required private degree upload, preferences, pending verification and completion checks passed. A fresh Google teacher must still complete the four browser pages. |
| Contact | Passed, production rendering/validation | Desktop/phone fields and support details loaded. Empty email-draft attempt showed validation; no message or personal file was sent. |
| Help Center | Passed, production rendering | Phone help topics and Contact navigation loaded. |
| Mobile navigation | Passed, local browser | Chat drawers tested in both themes; dark Profile header/drawer/bottom navigation readable. Keyboard Enter and Escape behavior preserved. |
| Assets | Passed for inspected pages | No broken DOM images found on Contact / Help. Local board/star/navigation assets rendered in screenshots. Not an exhaustive asset crawl. |
| Responsive overflow | Passed for inspected flows | Phone 390×844, tablet 768×1024 and desktop 1280/1440×900 checks showed no horizontal document overflow. Not every page was tested at every size. |

## Automated tests

All the following completed successfully in this working tree:

- `node tests/live-audit-regressions-check.js` — 10 Profile guest/expiry/network/Retry/identity/balance/onboarding/race scenarios; actual Live Board provider/controller checks for graph, playback, replay, unsupported topics and explicit chat handoff.
- `node tests/profile-hub-check.js`
- `npm run check:live-board`
- `npm run check:site`
- `npm run check:responsive`
- `node tests/chat-layout-state-check.js` — includes reduced-motion/state checks.
- `npm run check:chatbot`
- `npm run check:chatbot:backend`
- `npm run check:study` — planner, storage/UI, ordered setup, micro-learning, calendar/target controls and isolated backend/material checks; includes 168 generated schedule cases.
- `python tests/auth_onboarding_backend_smoke.py` — 56 isolated cases.
- `node tests/social-auth-ui-check.js`
- `npm run check:auth`
- `npm run check:curriculum`
- `npm run check:audit`
- `node tests/contact-form-check.js` — six checks.
- `npm run check:account-billing`
- `npm run check:rich-response`
- JavaScript syntax checks for the changed controllers and new regression test; `git diff --check`.

Backend/provider smoke tests use isolated test data/mocks. They are not evidence of a real Google login, live mailbox delivery, real private upload or paid-provider transaction. An obsolete auth browser check expecting three providers was not run; the current entry is Google-only. No production credentials were extracted or modified.

## Exact files in this repair

1. `live-board.html`
2. `css/live-board.css`
3. `js/live-board/app.js`
4. `profile.html`
5. `css/profile-hub.css`
6. `js/profile-hub.js`
7. `css/chat-layout.css`
8. `maths_gpt.html` — stylesheet cache version only.
9. `tests/fixtures/chat-preview-bootstrap.js` — loopback-only expired/unavailable account controls, no fake production auth.
10. `tests/live-audit-regressions-check.js` — new isolated regression suite.
11. `docs/live-audit-repair-2026-10-04.md` — this report.

No database/schema changes or new dependencies. Existing curriculum importer work, integrations and other uncommitted files are excluded from this repair.

## Screenshots

Local screenshot artifacts are under `tmp/live-audit-20261004/`; this directory is not committed because it also contains unrelated local artifacts.

- [Production Board before](../tmp/live-audit-20261004/board-before.jpg)
- [Production Profile before](../tmp/live-audit-20261004/profile-before.jpg)
- [Desktop Board after](../tmp/live-audit-20261004/board-desktop-after.jpg)
- [Phone Board after](../tmp/live-audit-20261004/board-phone-after.jpg)
- [Expired Profile after](../tmp/live-audit-20261004/profile-expired-after.jpg)
- [Signed-out Profile / dark navigation after](../tmp/live-audit-20261004/profile-signed-out-phone-after.jpg)
- [Dark chat drawer after](../tmp/live-audit-20261004/chat-dark-drawer-after.jpg)
- [Light chat drawer after](../tmp/live-audit-20261004/chat-light-drawer-after.jpg)
- [Existing desktop chat-board split view](../tmp/live-audit-20261004/chat-board-desktop-after.jpg)

All “after” screenshots in this section are local preview evidence, not deployment evidence.

Fresh post-push production evidence:

- [Deployed Live Board graph and completed playback](../tmp/live-audit-20261004/board-production-after.jpg)
- [Deployed signed-out Profile](../tmp/live-audit-20261004/profile-production-after.jpg)
- [Deployed mobile chat drawer](../tmp/live-audit-20261004/chat-production-mobile-after.jpg)
- [Real chatbot response after deployment](../tmp/live-audit-20261004/chat-production-response-after.jpg)

## Remaining verification / follow-ups

1. **Human Google account participation:** open the existing auth entry, click Continue with Google yourself and complete provider/terms consent. Test a returning student reaching chat/Profile without onboarding. For a fresh student, complete name/age/grade/board/optional school and confirm the values in Profile. For a fresh teacher, complete four pages with a test degree document, preferences and availability; confirm pending (not verified) status and the teacher destination. Only use non-sensitive test documents. Real signed-in production Profile and role redirects remain unverified until these checks.
2. **Billing source:** authenticated balance/plan is absent from the current auth response. This patch deliberately displays unavailable; confirmed values need the existing billing service to provide account-bound data. No credentials or billing settings were changed.
3. **Study Review edge case:** a task marked complete before starting a session needs a context-aware fallback instead of opening the last unrelated chat. This is a separate functional repair, not included in the three requested fixes.
4. **Authenticated production verification:** the fresh public checks above confirm the repaired frontend is being served. Signed-in balances, connected-login methods and teacher/student destinations still need the human Google checks; they are not established by public guest checks or a successful Git push.

## Protected local work

`backend/chatbot/adaptive_teaching_engine.py` was not edited, staged or included in this repair. Its pre-existing local changes remain intact. SHA-256 before/after verification:

`00CA377269E428D177B661AC20717B0F3F15ED35A2EAE74A85E900F5E2DA46E8`
