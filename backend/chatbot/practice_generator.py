from __future__ import annotations

from .schemas import QuestionAnalysis, SubjectArea


class PracticeGenerator:
    def generate(self, analysis: QuestionAnalysis, prompt: str) -> str:
        topic = (analysis.topic or "").lower()
        if analysis.subject == SubjectArea.mathematics and "geometry" in topic:
            return "A rectangle has a width of 6 m and a length 4 m longer than its width. Find its area."
        if analysis.subject == SubjectArea.mathematics and "rate" in topic:
            return "A bus travels 180 km in 3 hours. What is its average speed?"
        if analysis.subject == SubjectArea.mathematics and "algebra" in topic:
            return "Riya has twice as many stickers as Aman. Together they have 45 stickers. How many does each have?"
        if analysis.subject == SubjectArea.mathematics:
            return "Create one similar problem by changing the numbers, then solve it using the same method."
        if analysis.subject == SubjectArea.physics:
            return "A force of 10 N moves an object 4 m. How much work is done?"
        if analysis.subject == SubjectArea.chemistry:
            return "Explain the difference between an acid and a base with one example each."
        if analysis.subject == SubjectArea.biology:
            return "Explain why chlorophyll is important for photosynthesis."
        if analysis.subject == SubjectArea.english and analysis.question_type.value == "grammar":
            return "Identify the tense: She has finished her homework."
        if analysis.subject == SubjectArea.english:
            return "Write a short paragraph explaining the theme of honesty in a story."
        if analysis.subject == SubjectArea.history:
            return "Name one cause and one effect of the French Revolution."
        if analysis.subject == SubjectArea.geography:
            return "Where is Pune located? Write the city, state, country, and continent."
        if analysis.subject == SubjectArea.civics:
            return "Why are fundamental rights important in a democracy?"
        if analysis.subject == SubjectArea.economics:
            return "Give one example of how demand can affect price."
        return "Ask one similar question about this topic and answer it in your own words."

    def challenge(self, analysis: QuestionAnalysis) -> str:
        if analysis.difficulty.value in {"advanced", "exam"}:
            return "Try explaining the same idea without looking at the answer, then compare your logic."
        return ""
