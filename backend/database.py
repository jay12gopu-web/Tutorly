import sqlite3

def init_db():
    conn = sqlite3.connect("tutor.db")
    cursor = conn.cursor()

    # 👤 Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT,
        question_count INTEGER DEFAULT 0,
        limit_reached_at TEXT
    )
    """)

    # 💬 Chat history
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        question TEXT,
        answer TEXT,
        subject TEXT,
        created_at TEXT
    )
    """)

    # 📚 Subjects
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
    )
    """)

    # 🧠 Knowledge
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER,
        topic TEXT,
        content TEXT,
        difficulty TEXT,
        created_at TEXT
    )
    """)

    conn.commit()
    conn.close()