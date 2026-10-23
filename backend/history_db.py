
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "interview_history.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


# Create the interview history table
def create_history_table():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS interview_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                category TEXT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                score INTEGER NOT NULL,
                summary TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


# Save an evaluated interview answer
def save_history(role, category, question, answer, score, summary):
    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO interview_history
            (role, category, question, answer, score, summary)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            role,
            category,
            question,
            answer,
            score,
            summary,
        ))
        return cursor.lastrowid


# Get all interview history
def get_all_history():
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT id, role, category, question, answer,
                   score, summary, created_at
            FROM interview_history
            ORDER BY id DESC
        """).fetchall()

        return [dict(row) for row in rows]


# Create the table that tracks questions already served
def create_served_questions_table():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS served_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                question TEXT NOT NULL,
                served_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(role, question)
            )
        """)


# Save questions that have been shown to the user
# Accepts either question dictionaries or plain text strings
def save_served_questions(role, questions):
    with get_connection() as connection:
        for item in questions:
            if isinstance(item, dict):
                question_text = item.get("question")
            else:
                question_text = item

            if not isinstance(question_text, str):
                raise ValueError(
                    "Each question must contain a valid question string."
                )

            connection.execute("""
                INSERT OR IGNORE INTO served_questions (role, question)
                VALUES (?, ?)
            """, (role, question_text))


# Get questions already served for a role
def get_served_questions(role):
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT question
            FROM served_questions
            WHERE role = ?
        """, (role,)).fetchall()

        return [row["question"] for row in rows]


# Create both tables when the module loads
create_history_table()
create_served_questions_table()
