
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from questions import QUESTION_BANK
from evaluator import evaluate_answer
from history_db import (
    DATABASE_PATH,
    save_history,
    get_all_history,
    save_served_questions,
    get_served_questions,
)

app = FastAPI(title="Fearless Interview")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fearless-interview.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



class EvaluationRequest(BaseModel):
    role: str
    category: str
    question: str
    expected_points: list[str] = Field(default_factory=list)
    answer: str


@app.get("/")
def home():
    return {
        "message": "Welcome to Fearless Interview!",
        "status": "Backend is working",
    }


@app.get("/roles")
def get_roles():
    return {"roles": list(QUESTION_BANK.keys())}


@app.get("/questions/{role}")
def get_questions(role: str):
    requested_role = role.strip().casefold()

    matched_role = next(
        (
            name
            for name in QUESTION_BANK
            if name.casefold() == requested_role
        ),
        None,
    )

    if matched_role is None:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Role not found",
                "available_roles": list(QUESTION_BANK.keys()),
            },
        )

    try:
        all_questions = QUESTION_BANK[matched_role]

        served_questions = set(
            get_served_questions(matched_role)
        )

        fresh_questions = [
            question
            for question in all_questions
            if question["question"] not in served_questions
        ]

        # Start a new cycle when every question has been used.
        if not fresh_questions:
            with sqlite3.connect(DATABASE_PATH) as connection:
                connection.execute(
                    """
                    DELETE FROM served_questions
                    WHERE role = ?
                    """,
                    (matched_role,),
                )

            fresh_questions = all_questions

        # Return up to 30 unused questions.
        selected_questions = fresh_questions[:30]

        save_served_questions(
            matched_role,
            selected_questions,
        )

        return {
            "role": matched_role,
            "total_questions": len(selected_questions),
            "questions": selected_questions,
        }

    except Exception as error:
        print("Error loading questions:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Could not load questions. Check the backend terminal.",
        )


@app.post("/evaluate")
def evaluate(request: EvaluationRequest):
    if not request.answer.strip():
        raise HTTPException(
            status_code=400,
            detail="Please provide an answer to evaluate.",
        )

    try:
        result = evaluate_answer(
            role=request.role,
            category=request.category,
            question=request.question,
            expected_points=request.expected_points,
            answer=request.answer.strip(),
        )

        save_history(
            role=request.role,
            category=request.category,
            question=request.question,
            answer=request.answer.strip(),
            score=result.get("score", 0),
            summary=result.get("summary", ""),
        )

        return result

    except RuntimeError as error:
        raise HTTPException(
            status_code=503,
            detail=str(error),
        )

    except Exception as error:
        print("Evaluation or history error:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Evaluation or history saving failed.",
        )


@app.get("/history")
def read_history():
    try:
        return {"history": get_all_history()}

    except Exception as error:
        print("History error:", repr(error))
        raise HTTPException(
            status_code=500,
            detail="Could not retrieve interview history.",
        )
