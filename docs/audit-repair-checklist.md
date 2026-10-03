# Tutorly audit repair checklist

Source: Tutorly-All-Issues-and-Fixes.pdf, 2 October 2026 (61 original IDs).

Deployment: **held for user approval**. No audit repair has been deployed.

Existing unrelated working-tree changes are preserved, including adaptive_teaching_engine.py. Final outcomes use: fixed and verified, implemented but unverified, blocked, or not reproduced. Synthetic test data only; no real payment, tutor/support submission or destructive account action.

## High

| ID | Finding | Outcome | Cause / evidence / verification |
| --- | --- | --- | --- |
| H01 | Ordinary tutoring requests fail intermittently | Not reproduced | Three production tutoring probes returned 200. The reported intermittent failure was not reproduced; request IDs and bounded provider failure handling remain available. This is not proof the intermittent fault is eliminated. |
| H02 | Verified lessons contain generic filler | Blocked | Metadata-only chapters were being expanded into generic filler and unrelated hardcoded examples. Removed that content and visit-based completion; verified browser now shows official source plus honest reviewed-lesson-pending state (13,14). Reviewed teaching content still needs content approval. |
| H03 | Incorrect biological foundation in guided Cell lesson | Implemented but unverified | Added scoped school-level Cell foundation/depth guardrails; deterministic definition was already correct. Backend prompt tests pass. Real provider output and pedagogical review still required; prompt rules do not guarantee accuracy. |
| H04 | Test generation cannot produce a paper | Blocked | Production OpenAPI does not contain /api/tests/generate; production request returned 404. Local route/material tests pass and UI distinguishes unavailable service with retry/settings retention. Backend release is held for deployment approval. |
| H05 | Selected chapter context is lost | Fixed and verified | Practice previously jumped into Tests without a useful chapter flow. Canonical chapter IDs now reach the existing chat or upload-first test pipeline; backend validates IDs against verified catalog. Browser Cell → Practice and Cell → Tests handoffs, plus audit backend tests pass. |
| H06 | Desktop chapter chooser is a narrow nested grid | Fixed and verified | Chapter grid occupied one cell of the outer subject grid. Full-span responsive chooser; desktop actual-catalog Science list has four readable columns (02 before,07 after). |
| H07 | New conversation inherits unrelated Live Board | Fixed and verified | Old lesson/context and late async work survived a new conversation. Reset clears context, pending token, SVG commands and playback. Browser New Chat clears the existing graph; lifecycle tests pass. The audit's corrected-expression variant was not separately reproduced. |
| H08 | One conversation stops accepting sends | Not reproduced | The specific permanent send lock was not reproduced. Hardened synchronous error cleanup and request-version guards so old finally handlers cannot clear a new request. Fixture Stop → send, failure → Retry and lifecycle tests pass. |
| H09 | Science diagrams become generic process boxes | Blocked | Unsupported science prompts fell through to generic flow boxes/default graph. They now return an honest unavailable visual instead; real quadratic graph remains functional. Accurate biological/particle visual templates still require implementation/content review. |
| H10 | Mobile cart blocked and panel offscreen | Fixed and verified | A completed body transform created a fixed-position containing block, plus desktop sticky top rules leaked into mobile cart. Reset final transform, mount mobile overlay at body, correct placement/z-index and focus trap. Mobile close/Earn/Escape verified (03 before,06 after). |
| H11 | Referral codes rotate despite 12-hour timer | Fixed and verified | Legacy and current storage keys were identical; migration deleted the newly saved code each tick. Both implementations now remove only different legacy keys. Dynamic tests exercise 50 ticks and expiry without premature rotation. |
| H12 | Authenticated payment history unavailable | Blocked | Static frontend origin and legacy browser billing identity do not safely resolve canonical authenticated payment history. No guessed service URL or insecure account mapping was added. Friendly escaped error/Retry UI implemented; secure service routing/identity bridge/configuration required. |
| H13 | Human support entry does not prominently disclose local demo | Fixed and verified | More Tools and human-support pages now disclose local/demo behavior before action. Mobile request result explicitly says no tutor contacted or future queue (08,15); static demo-disclosure tests pass. |

## Medium

| ID | Finding | Outcome | Cause / evidence / verification |
| --- | --- | --- | --- |
| M01 | Chat failure has no Retry | Fixed and verified | Friendly chat failure includes horizontal Retry; failure turns excluded from model history/feedback. Browser 503 → Retry → normal response in same chat verified (04). |
| M02 | LaTeX rendering inconsistent | Fixed and verified | Recognizable bare display-equation brackets were left as raw text; math now normalized without converting prose/links. Local official KaTeX assets, pinned 0.16.47, replace fragile external loading. Renderer/math regression tests pass; live provider equation variety is not exhaustive. |
| M03 | Dark chat headings/model contrast | Fixed and verified | Competing mobile light-theme styles overrode dark canvas and model text. Scoped dark overrides restore contrast; mobile screenshot and computed colors verified (12). |
| M04 | Mobile Upgrade button contrast | Fixed and verified | Upgrade control inherited low-contrast mobile colors. Explicit indigo/white styling retained; signed-in mobile control checked with Study and chat (12,16). |
| M05 | Mobile tables lose column labels | Fixed and verified | Mobile table transforms suppressed column headers. Scoped table wrapper restores table/head/cell display and internal scrolling. Browser Idea/Example headers remain visible, page has no horizontal overflow (12). |
| M06 | Drawing toolbar overlaps teaching/playback | Fixed and verified | Drawing controls overlaid playback/teaching. Existing tool strip placed in layout flow; actual graph, Next step and Let Me Try checked without overlap (05). |
| M07 | Live Board dark contrast | Implemented but unverified | Dark Board headings, explanations and buttons have scoped contrast styles. Live Board engine checks pass, but a complete dark-mode Board/browser interaction matrix has not been rerun. |
| M08 | Standalone board has meaningless default lesson | Fixed and verified | Standalone mock provider fabricated a default plot without an equation. No default plot is produced; unsupported empty visual has an explicit state. Supported graph generation and regression tests pass. |
| M09 | Ask a Doubt form clipped on mobile | Fixed and verified | Doubt layout/grid children lacked min-width/box sizing constraints. Responsive single-column controls fit mobile; submit/local-save flow checked without overflow (08). |
| M10 | Profile initialization error | Fixed and verified | campus.js also initialized on the canonical profile-hub page and accessed incompatible fields. Skip legacy initialization there; synthetic signed-in profile/Edit/Cancel opens without null-field errors (09). |
| M11 | Incompatible duplicate profile editors | Fixed and verified | Same duplicate initializer competed with the canonical profile editor. One existing profile editor now handles that page; browser and static checks pass. Real profile save persistence was not exercised. |
| M12 | Profile/Progress streak disagreement | Fixed and verified | Profile recalculated a calendar streak while Progress used recorded tutorly_streak. Both now display the recorded value. Synthetic profile/Progress 0-day comparison verified; no fabricated visits-based streak. |
| M13 | Completed Study task has no undo/review | Fixed and verified | Added Review and Undo to completed Study tasks. Undo restores pending state, removes completion date and rebalances without mutating prior state. Browser complete → 19% → Undo → 0% and engine tests pass (11). |
| M14 | Browser-only records lack recovery | Fixed and verified | Added explicit private JSON backup/restore for browser-local Study plans and bookmarks. Bounded validation, duplicate rejection, account isolation, no overwrite and unsafe-URL rejection tested. This is local recovery, not cross-device sync; browser file-picker round-trip not exercised. |
| M15 | Quest CTAs cannot fulfil objectives | Blocked | Some quests linked to unrelated pages or required unavailable verified chapter/mastery evidence. Practice quests now use the existing practice/test results; unsupported mastery/lesson/weak-area objectives are clearly disabled rather than awarding fake progress. Reviewed assessment/completion rules still needed. |
| M16 | Leaderboard demo achievements imply personal progress | Implemented but unverified | Removed logged-in identity/You claims from demo leaderboard; uses Sample learner/sample XP and illustrative-position copy. Source checks pass; leaderboard filter/browser walkthrough not repeated in this repair run. |
| M17 | Local doubts imply tutor work/incorrect timestamps | Fixed and verified | New local doubts previously implied queue work and unreliable relative timestamps. Save actual ISO time, label samples separately, show Demo saved—not sent, handle storage failure. Mobile synthetic submission/history verified (08). |
| M18 | Tutor request promises nonexistent future queue | Fixed and verified | Request modal previously promised a future queue. Before action and after result it now clearly states local preview/no tutor/no queue; CTA is Try demo request. Mathematics/Grade 9 → Profile → Request verified on mobile (15). |
| M19 | Billing sync/freshness unavailable | Blocked | Billing freshness cannot be asserted without working authenticated billing service resolution. Sync status/error and retry copy implemented; financial data freshness remains unverified until configuration/bridge is completed. |
| M20 | Learn access copy contradicts entitlement | Fixed and verified | Learn crown/premium copy contradicted free curriculum browsing. Removed misleading crown and aligned availability wording; chatbot/site consistency assertions verify the corrected rule. Reviewed lesson availability is a separate content dependency. |
| M21 | Monthly credit reset unclear | Blocked | Backend reset date can be null and approved reset policy is not recorded. UI now says unknown instead of inventing a date. Monthly free-credit/reset semantics require a product decision and backend implementation. |
| M22 | Bookmark filtered count ignores search | Fixed and verified | Bookmark count applied category but not search. Total and current-view counts now use the same filter. Mobile Science search shows total 2/view 1 (10). |
| M23 | Controls lack explicit labels | Fixed and verified | Added explicit labels to chapter/reader searches and test-history search/sort/filter; existing dialog/form labels retained. Source/AX checks and focused mobile navigation tests pass. Not a claim of a full WCAG audit. |
| M24 | Mobile menu focus escapes behind overlay | Fixed and verified | Shared mobile menu left background and hidden drawer focusable. Added inert background/closed drawer, trapped focus, Escape and focus return. Browser Shift+Tab/Tab wrap and Escape on Bookmarks verified. |
| M25 | Reader/shared header theme mismatch | Fixed and verified | Reader theme set local classes but shared/mobile theme rules retained light background and dark summary text. Sync dataset and scoped dark body/header/controls. Computed mobile header #111c34, body #08111f, light summary, no overflow (13,14). |
| M26 | Privacy/data scope and retention insufficient | Blocked | Privacy copy now distinguishes browser-only data, account data and AI processing. Actual provider agreements, retention/deletion periods and legal approval are not evidenced; policy completeness requires service inventory/legal review. |

## Low

| ID | Finding | Outcome | Cause / evidence / verification |
| --- | --- | --- | --- |
| L01 | Requested answer depth/common-mistake guidance omitted | Implemented but unverified | Postprocessor removed explicitly requested Common Mistakes and default completion budget was only 900 tokens. Preserve requested sections, scope unsolicited headings, default 2400/cap 6000 and reject provider truncation safely. Offline tests pass; real long-answer fulfillment not retested. |
| L02 | Generation has no Stop | Fixed and verified | Added Stop using existing AbortController, version-guarded cleanup and honest stopped state. Slow fixture → Stop → next send succeeds; cancellation tests pass. |
| L03 | Study mode overwrites normal preference | Fixed and verified | Study changed the saved normal model preference. Temporary Study selection uses persist:false; New Chat restores stored Prime. Browser and lifecycle tests pass. |
| L04 | Empty-wallet shop lacks Earn route | Fixed and verified | Empty cart/wallet now has an Earn route. Mobile cart CTA visible and unobstructed; no real coins purchase/reward performed (06). |
| L05 | Empty progress lacks next action | Implemented but unverified | Empty Progress includes useful existing chat/notes actions and local-data explanation. Site checks pass; these empty-state CTAs were not fully clicked through in this run. |
| L06 | Page titles not feature-specific | Fixed and verified | Feature-specific titles use Tutorly branding via existing layout and static HTML where needed. Browser Chat/Tests/Learn/Profile/Find Tutor titles and site tests checked. |
| L07 | Heading hierarchy inconsistent | Fixed and verified | Corrected targeted reader/subject headings, response heading levels and legal/update section levels. Reader has h1 chapter and h2 pending-content section; navigation Contents is a label, not an out-of-order heading. Source/AX tests pass. |
| L08 | Refund/cancellation terms vague | Blocked | No approved refund window, cancellation consequences or auto-renewal policy supplied. Did not invent legally consequential terms. Product/payment/legal decisions required. |
| L09 | Support identity/response expectations unclear | Implemented but unverified | Retained user-approved support@tutorly.co.in and +91 73307 66674; form describes email draft/manual attachment and non-guaranteed response expectations. Six contact validation/draft tests pass. Delivery, phone availability and response SLA not verified. |
| L10 | Referral metrics/wallet provenance unclear | Blocked | Hardcoded referral statistics/rewards were not backed by a service or wallet ledger. Clearly labeled demo metrics and removed automatic coin promises. Real referral attribution/rewards backend and product rules still required. |

## Polish

| ID | Finding | Outcome | Cause / evidence / verification |
| --- | --- | --- | --- |
| P01 | Navigation patterns inconsistent | Implemented but unverified | Reused shared mobile drawer and corrected Practice/Tests destinations; added Progress/More Tools links. Responsive checks pass. Complete cross-page navigation consistency review remains; no duplicate navigation system created. |
| P02 | Heavy body/metadata typography | Fixed and verified | Reduced body/metadata weights in affected history/bookmark/reader surfaces while retaining headings. Desktop reader and mobile bookmarks reviewed (10,13,14). |
| P03 | Bookmark mobile decorative cards overlap | Fixed and verified | Mobile Bookmark decorative artwork now hidden; readable one-column layout without overlap/overflow verified (10). |
| P04 | Reader utilities delay content | Fixed and verified | Reader utilities are collapsed by default under a keyboard-operable disclosure; reader content appears immediately. Desktop/mobile open/close checked (13,14). |
| P05 | Empty-chat suggestions overly spaced | Fixed and verified | New-chat suggestions use compact 44px tappable rows with reduced gap. Guest new-chat and lifecycle/rotation tests checked; no permanent integration dashboard added. |
| P06 | Live Board content too small | Implemented but unverified | Existing Board camera fits the current step's focus with bounded scale. Graph browser rendering/engine tests pass; diverse supported scenes and all viewport focus bounds need additional visual checks. |
| P07 | Study instructions exposed as user bubble | Fixed and verified | Long Study control instructions moved out of the visible user bubble into bounded session context. New task start shows a short prompt in the same chat; old stored messages are preserved. Browser and Study tests pass. |
| P08 | Analyzing label visually duplicated | Fixed and verified | Duplicate visible reasoning label hidden while retaining screen-reader status; reasoning status regression tests pass. No internal reasoning exposed. |
| P09 | Coins/tokens/credits terminology inconsistent | Implemented but unverified | Shop uses learning coins; subscriptions retain credits and demo referrals explicitly issue none. Copy/static checks pass. Final whole-product terminology/product conversion review still needed; no fake economy added. |
| P10 | Short-page backgrounds end early | Fixed and verified | Shared minimum viewport height and final-transform reset prevent short-page canvas/overlay issues. Desktop reader dark background covers viewport; mobile cart/reader tested (06,13,14). |
| P11 | Button shapes/spacing inconsistent | Implemented but unverified | Affected shared action buttons use consistent 12px radii and 44px minimums; keyboard focus visible. Full visual comparison of all buttons/pages has not been completed. |
| P12 | Legal/update pages inconsistent | Implemented but unverified | Legal navigation uses real Privacy/Terms routes and Back to Chat; section headings aligned with release notes. Static site checks pass. Legal approval and full mobile visual walkthrough still pending. |

## Evidence and test log

Completed review: 3 October 2026. 2 not reproduced; 10 blocked; 11 implemented but unverified; 38 fixed and verified. All 61 IDs retained. 'Fixed and verified' specifies its browser/unit/static test scope; it does not certify every provider or viewport.

Evidence is captured in tmp/audit-2026-10-02/evidence. Production verification is distinct from loopback fixtures; no fixture is proof of provider/service availability. See the repair report for files, test commands, screenshots and release gates.
