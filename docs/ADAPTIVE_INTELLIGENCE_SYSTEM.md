# Tutorly Adaptive Intelligence System

Tutorly now routes academic chatbot requests through an adaptive teaching pipeline before the final answer is displayed.

## Request Flow

1. The student sends a message from `maths_gpt.html`.
2. `js/gpt.js` builds an adaptive frontend context from `js/chatbot/adaptive-intelligence.js`.
3. `js/app.js` sends the message, selected model, and adaptive metadata to `POST /chat`.
4. `backend/main.py` classifies whether live search is required.
5. `QuestionAnalyzer` detects subject, topic, sub-topic, grade band, difficulty, question type, confidence, and keywords.
6. `PatternMatchingEngine` searches persistent pattern memory for similar solved concepts.
7. `KnowledgeConfidenceEngine` decides whether internal knowledge is enough.
8. `KnowledgeMergeEngine` merges internal notes, successful patterns, learner memory, and search summaries when search is required.
9. `AdaptiveTeachingEngine` builds the final teaching prompt and validates the response.
10. Successful answers are stored back into pattern memory for future strategy reuse.
11. Student feedback updates teaching strategy success scores through `/chat-feedback` or `/api/chatbot/feedback`.

## Pattern Memory

Pattern memory is stored in:

`backend/chatbot_data/pattern_memory.json`

Each pattern stores:

- Subject
- Topic
- Vector-like hashed embedding
- Solution pattern
- Teaching pattern
- Difficulty
- Success score
- Example questions
- Keywords

The system never copies old answers directly. It only reuses the successful method and teaching strategy.

## Search Policy

Tutorly does not search for stable academic questions such as algebra, photosynthesis, grammar, history concepts, or geography basics.

Search is reserved for:

- Current events
- Live sports/weather/prices
- Recent discoveries
- Recently changed policies or rankings

When search is unavailable for a current-information question, Tutorly refuses to guess and asks for search configuration.

## Feedback Loop

Assistant replies expose feedback controls:

- Understood
- Simpler
- More examples
- Still confused

Feedback changes the score of related teaching patterns. Over time, strategies that students understand are ranked higher, and weak strategies lose priority.

## Quality Gate

The backend validates every generated answer for:

- Empty or too-short output
- Placeholder text
- `undefined` / `null`
- Missing final answer
- Missing practice question

If validation fails, Tutorly attempts one regeneration. If it still fails, it returns a safe structured tutor answer instead of broken output.
