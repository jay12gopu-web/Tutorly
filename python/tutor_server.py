from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from openai import OpenAI
import os

app = FastAPI()

# -----------------------
# CORS (for frontend)
# -----------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# OpenAI setup
# -----------------------
openai_api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=openai_api_key) if openai_api_key else None

# -----------------------
# Fake DB (in-memory)
# -----------------------
users_db = {}

LIMIT = 30
COOLDOWN_DAYS = 2

# -----------------------
# Request model
# -----------------------
class ChatRequest(BaseModel):
    userId: str
    message: str

# -----------------------
# Get user
# -----------------------
def get_user(user_id):
    if user_id not in users_db:
        users_db[user_id] = {
            "question_count": 0,
            "limit_reached_at": None,
            "last_question": None,
            "last_answer": None,
        }
    return users_db[user_id]

# -----------------------
# Limit system
# -----------------------
def check_usage_limit(user):
    now = datetime.now()

    if user["question_count"] >= LIMIT:
        if user["limit_reached_at"] is None:
            user["limit_reached_at"] = now
            return {"blocked": True, "message": "Limit reached. Try again later."}

        time_passed = now - user["limit_reached_at"]

        if time_passed > timedelta(days=COOLDOWN_DAYS):
            user["question_count"] = 0
            user["limit_reached_at"] = None
            return {"blocked": False}

        remaining = timedelta(days=COOLDOWN_DAYS) - time_passed

        return {
            "blocked": True,
            "message": "You’ve reached your limit. Try later.",
            "retry_after": int(remaining.total_seconds()),
        }

    return {"blocked": False}

# -----------------------
# Follow-up detection
# -----------------------
def is_followup(text):
    t = text.lower()
    return any(x in t for x in [
        "explain again",
        "explain better",
        "simplify",
        "huh",
        "what"
    ])

# -----------------------
# Prompt builder
# -----------------------
def build_prompt(message, user):
    if is_followup(message) and user["last_question"]:
        return f"""
The student didn't understand.

Question:
{user['last_question']}

Previous answer:
{user['last_answer']}

Explain again in a simpler way with examples.
"""

    return f"""
You are a helpful AI tutor.

Question:
{message}

Instructions:
- Explain clearly
- Use step-by-step reasoning if needed
- Keep it simple
"""

# -----------------------
# OpenAI call
# -----------------------
def get_ai_response(prompt):
    try:
        if client is None:
            return "Tutorly AI is not configured. Set OPENAI_API_KEY on the server."

        print("🔥 Calling OpenAI...")

        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful tutor."},
                {"role": "user", "content": prompt}
            ]
        )

        print("✅ OpenAI success")
        return res.choices[0].message.content

    except Exception as e:
        print("🔥 REAL ERROR:", repr(e))
        return str(e)

# -----------------------
# API endpoint
# -----------------------
@app.post("/chat")
def chat(req: ChatRequest):
    user = get_user(req.userId)

    # limit check
    limit = check_usage_limit(user)
    if limit["blocked"]:
        return {"error": True, "message": limit["message"]}

    # build prompt
    prompt = build_prompt(req.message, user)

    # AI response
    answer = get_ai_response(prompt)

    # memory update
    if not is_followup(req.message):
        user["last_question"] = req.message

    user["last_answer"] = answer
    user["question_count"] += 1

    return {
        "error": False,
        "answer": answer,
        "questions_left": LIMIT - user["question_count"]
    }

# -----------------------
# Health check
# -----------------------
@app.get("/")
def root():
    return {"status": "FastAPI running 🚀"}
