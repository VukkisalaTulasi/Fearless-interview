
def evaluate_answer(role, category, question, expected_points, answer):
    answer = answer.strip()

    if not answer:
        return {
            "score": 0,
            "strengths": [],
            "improvements": ["Please write an answer before evaluating."],
            "missing_concepts": expected_points,
            "sample_answer": "Please provide an answer to receive feedback.",
            "summary": "No answer provided."
        }

    # Convert the answer into lowercase words
    answer_lower = answer.lower()

    # Find expected concepts mentioned in the answer
    matched = []
    missing = []

    for point in expected_points:
        keywords = point.lower().split()

        if any(word in answer_lower for word in keywords):
            matched.append(point)
        else:
            missing.append(point)

    # Calculate a basic score
    if expected_points:
        score = int((len(matched) / len(expected_points)) * 100)
    else:
        score = 50 if len(answer.split()) >= 10 else 25

    # Give feedback
    strengths = []
    improvements = []

    if len(answer.split()) >= 10:
        strengths.append("You provided a detailed answer.")
    else:
        improvements.append("Try explaining your answer in more detail.")

    if matched:
        strengths.append("You included some important concepts.")

    if missing:
        improvements.append("Try including the missing concepts.")

    if score >= 75:
        summary = "Good answer! Review the suggestions to improve further."
    elif score >= 40:
        summary = "Good start. Add more important concepts to improve."
    else:
        summary = "Keep practising. Review the question and try again."

    return {
        "score": score,
        "strengths": strengths,
        "improvements": improvements,
        "missing_concepts": missing,
        "sample_answer": (
            "A strong answer should cover: "
            + ", ".join(expected_points)
            if expected_points
            else "Explain the main idea clearly and include a relevant example."
        ),
        "summary": summary
    }
