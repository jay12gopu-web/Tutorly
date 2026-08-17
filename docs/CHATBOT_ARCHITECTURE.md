# Tutorly Chatbot Architecture

This document tracks the chatbot-only growth path. The goal is to keep `js/app.js` as the page controller while moving the AI tutor system into dedicated chatbot files.

## Current Split

- `js/app.js` handles DOM events, composer state, camera/upload UI, rendering, and page interactions.
- `js/gpt.js` is the chatbot brain facade used by the UI.
- `js/chatbot/chatbot-core.js` provides safe storage, events, IDs, text helpers, and module registration.
- `js/chatbot/mode-registry.js` owns Spark, Prime, Lens, Deep Think, Research, Creative, Coding, and Study modes.
- `js/chatbot/chat-history-store.js` stores conversations, messages, pinned chats, archived chats, folders, search, ratings, and share metadata.
- `js/chatbot/chat-memory.js` stores learner memory, recent summaries, subject counts, and profile-like learning hints.
- `js/chatbot/learning-tools.js` creates flashcards, practice questions, knowledge checks, and learning paths from replies.
- `js/chatbot/geography-visuals.js` detects geography prompts, resolves places, builds geographic hierarchy/facts, and renders provider-based map panels for chatbot replies.
- `js/response-engine.js` still formats and varies local tutor replies.
- `backend/chatbot/*` contains the Python FastAPI-ready tutor service: schemas, mode strategies, subject classification, memory ranking, reasoning, knowledge retrieval, tool routing, tutoring, analytics, orchestration, and streaming routes.

## Backend API

- `GET /api/chatbot/health` reports chatbot service status and available modes.
- `POST /api/chatbot/respond` returns a full `ChatbotResponse`.
- `POST /api/chatbot/stream` streams server-sent progress events.
- `WS /api/chatbot/ws` streams WebSocket progress events.

## Development Rule

New chatbot intelligence should go into `js/gpt.js` or `js/chatbot/*`. Keep `app.js` as thin as possible: it can render UI, but it should call the GPT facade for AI decisions, memory, history, and learning features.

## Next Chatbot Phases

1. Add a real backend API adapter without breaking local fallback replies.
2. Add full message editing and branch/regenerate history.
3. Add PDF/document analysis and citation extraction.
4. Add voice output and spoken tutoring mode.
5. Add chatbot accessibility tests and interaction tests.
6. Connect `js/gpt.js` to `/api/chatbot/stream` when the FastAPI server is running, while preserving local fallback mode.
7. Expand map providers from the current OpenStreetMap embed and educational SVG fallback to MapLibre/vector atlas data when the assets are available.
