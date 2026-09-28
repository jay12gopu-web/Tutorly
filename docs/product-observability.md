# Product observability

The shared PostgreSQL request log records fixed service names, route templates,
HTTP methods/statuses, elapsed milliseconds, anonymous request IDs and safe error
codes. No new environment variables or database tables are required. Both the
FastAPI backend and Java Admin Console must use the existing shared database.

| Service | Observed requests | What the count means |
| --- | --- | --- |
| `study_bot` | POST `/api/chat`, `/api/chatbot/respond`, `/api/chatbot/stream`, legacy `/chat` with validated Study mode | Study-mode HTTP requests; not saved plans, tasks, or completed lessons |
| `chat` | Other chat requests | AI Tutor HTTP requests; not unique learners or conversations |
| `human_tutor` | Teacher-role POST `/api/auth/onboarding`; PUT `/api/auth/teacher-profile`; PUT/GET/DELETE `/api/auth/teacher-degree` | Teacher onboarding/profile/document operations; not approved teachers, bookings or lessons |
| `vision` | `/api/vision/*`, legacy `/upload-image` | Image/OCR operations; no image content |
| `voice` | `/api/voice/*`, `/api/transcribe` | Voice configuration/session/transcription operations; no audio or transcripts |
| `images` | POST `/api/images/generate` | Illustration requests, including cached/retried requests; not provider calls or credit charges |
| `curriculum` | `/api/curriculum/*` | Catalog/coverage/source requests |
| `quests` | `/api/quests`, `/api/quests/events`, `/api/quests/events/batch` | Quest HTTP requests; one batch can contain several events, so these are not quest completions |
| `auth` | Remaining `/api/auth/*` | Account/session HTTP requests; no user records or tokens |

Study Bot's planner is browser-local. Its active sessions use the existing chat
request with `mode: "study"`. Only that validated enum selects `study_bot`;
`client_context.study_session` and its private contents are never read by telemetry.
Old request records cannot retrospectively distinguish Study from general chat.

Human Tutor discovery, booking/request previews, doubts and the leaderboard are
currently frontend demo/local features. They have no production backend endpoints
to count. Tests and local progress likewise must not be presented as server-verified
completions. The separate Express payment service is outside this middleware;
its webhooks must not be inferred from FastAPI request counts.

`GET /api/chatbot/health` reports `observability.version: 2`, supported services,
`collection: "http_requests"`, a storage-configured boolean and WebSocket coverage.
This describes deployed instrumentation, not database connectivity, frontend
publication, provider availability or a guarantee that writes succeeded.

Matched FastAPI route templates replace URLs containing dynamic identifiers;
unknown requests use `/unmatched`. Query strings and bodies are never logged.
Product tags come from a fixed enum. Per-request attributes share a bounded object
across async handlers and synchronous threadpool routes, preserving the safe error
code and product category without crossing request boundaries.

HTTP status/latency for streaming routes describes establishment of the response,
not stream completion, token counts or provider success. WebSocket exchanges are
not counted in this V1 transport. Groq/Sarvam/ElevenLabs provider events continue to
use existing provider instrumentation; OpenAI image HTTP request counts do not
claim actual provider call counts.

Offline regression: `python tests/product_observability_smoke.py` exercises real
handlers with mocked providers and an isolated auth database, including concurrent
request separation, Study attribution, teacher authorization, malformed modes,
route-template privacy and safe error propagation.
