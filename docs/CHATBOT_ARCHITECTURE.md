# Tutorly Semantic Chat Architecture

Tutorly's browser is a renderer and conversation client. Academic understanding and answer generation happen only on the backend.

## Request Flow

1. `js/app.js` sends the complete student message, conversation ID, recent turns, attachments, and learner profile to `POST /api/chat`.
2. `backend/chatbot/orchestrator.py` loads bounded recent conversation context.
3. `backend/chatbot/ai/semantic_router.py` makes one structured LLM call through the provider-neutral `AIProvider` interface.
4. `GroqProvider` calls Groq's `openai/gpt-oss-120b` model with a strict JSON Schema.
5. The validated response contains subject, topic, intent, difficulty, answer format, response length, visual decision, tool decision, and the polished answer.
6. The orchestrator runs only the tools selected by that semantic decision, saves recent context, and returns the response.
7. The browser renders the answer as Markdown, places any selected visual, and shows a small set of contextual actions.

There is no active browser-side subject, topic, intent, or diagram classifier. Legacy local response scripts are not loaded by `maths_gpt.html`, and the old local router in `js/app.js` is explicitly disabled.

## Backend Modules

- `backend/chatbot/ai/provider.py`: provider interface and safe provider errors.
- `backend/chatbot/ai/groq.py`: backend-only Groq adapter.
- `backend/chatbot/ai/semantic_router.py`: strict schema, semantic prompt, validation, and graceful fallback.
- `backend/chatbot/conversation_context.py`: bounded recent-turn context.
- `backend/chatbot/rate_limit.py`: per-user/conversation sliding-window limits.
- `backend/chatbot/orchestrator.py`: provider-neutral chat pipeline.
- `backend/chatbot/routes.py`: `/api/chat`, compatibility, feedback, SSE, and WebSocket routes.

## API

- `POST /api/chat`: primary browser endpoint.
- `POST /api/chatbot/respond`: compatibility alias using the same semantic pipeline.
- `GET /api/chatbot/health`: provider/model configuration status without secrets.
- `POST /api/chatbot/stream`: server-sent semantic response stream.
- `WS /api/chatbot/ws`: WebSocket semantic response stream.

## Security

`GROQ_API_KEY` is read only by the backend provider from a server environment file. Frontend JavaScript never calls Groq and never receives the key.
