# Tutorly Smart Knowledge Router

The Smart Knowledge Router decides whether a chatbot question should use stable Tutorly tutor knowledge or live web search.

## Default Behavior

Tutorly does **not** search the web for normal academic questions.

Examples that stay inside the AI tutor:

- `Solve x^2 - 5x + 6 = 0`
- `Explain photosynthesis`
- `What is a noun?`
- `Explain World War I`
- `Where is India located?`

Examples that trigger search:

- `Latest NASA mission this week`
- `Who won today's IPL match?`
- `Today's weather in Hyderabad`
- `Current stock price of Apple`
- `Recent AI developments`

## Search Providers

The router supports provider swapping through environment variables.

```env
TUTORLY_SEARCH_PROVIDER=google
GOOGLE_SEARCH_API_KEY=your_google_custom_search_key
GOOGLE_SEARCH_ENGINE_ID=your_google_programmable_search_engine_id
TAVILY_API_KEY=your_tavily_key
BRAVE_SEARCH_API_KEY=your_brave_key
BING_SEARCH_API_KEY=your_bing_key
TUTORLY_SEARCH_CACHE_SECONDS=900
```

Provider priority:

1. Google Search when `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` exist
2. `TUTORLY_SEARCH_PROVIDER` if configured and its key exists
3. Tavily
4. Brave Search
5. Bing Search
6. Disabled provider

If no Google/search key exists, current-information questions are still classified correctly, but Tutorly will not answer from memory. It returns a setup message instead of letting the model guess.

## Backend Flow

```text
Student message
↓
QuestionClassifier
↓
requiresSearch false → normal Tutorly academic prompt
requiresSearch true  → SearchProvider → summary → Tutorly teaching prompt
↓
Groq model
↓
Frontend renders answer
```

The frontend still uses the same `/chat` endpoint and reads the same `answer` field. Extra response metadata is returned under `routing` and `search` for future analytics/debugging.
