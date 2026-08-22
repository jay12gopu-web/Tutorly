from __future__ import annotations

import re
from typing import List, Optional

from .practice_generator import PracticeGenerator
from .schemas import DifficultyLevel, GradeBand, MergedKnowledge, QuestionAnalysis, SubjectArea


class AdaptiveTeachingEngine:
    """Final formatting authority for server-side tutor responses."""

    def __init__(self) -> None:
        self.practice = PracticeGenerator()

    def system_prompt(self, analysis: QuestionAnalysis, merged: MergedKnowledge, *, search_required: bool = False) -> str:
        subject_rules = self._subject_rules(analysis.subject)
        grade_rules = self._grade_rules(analysis.grade_level)
        search_rule = (
            "Use the verified search knowledge below, but never dump raw search results. Cite sources briefly."
            if search_required
            else "Do not use web search for this stable academic question."
        )
        return f"""
You are Tutorly AI, a world-class private tutor.

Question analysis:
- Subject: {analysis.subject.value}
- Topic: {analysis.topic}
- Sub-topic: {analysis.sub_topic}
- Question type: {analysis.question_type.value}
- Difficulty: {analysis.difficulty.value}
- Grade adaptation: {analysis.grade_level.value}
- Confidence: {analysis.confidence:.2f}

Teaching strategy:
{merged.recommended_teaching_strategy}

Knowledge context:
{merged.merged_knowledge or "Use reliable internal educational knowledge."}

Rules:
- {search_rule}
- Never output placeholder text, raw JSON, null, undefined, or empty sections.
- Every academic answer must include real content in every section.
- Teach patiently and clearly. The goal is understanding, not just answering.
- {grade_rules}

Subject format:
{subject_rules}

After the final answer, include:
### Common Mistakes
### Practice Question
Use this practice question if suitable: {self.practice.generate(analysis, "")}
""".strip()

    def validate_answer(
        self,
        answer: str,
        message: str = "",
        analysis: Optional[QuestionAnalysis] = None,
        response_plan: Optional[dict] = None,
    ) -> List[str]:
        issues: List[str] = []
        text = answer or ""
        plan = response_plan or {}
        kind = str(plan.get("response_kind") or "")
        minimum_length = 1 if kind in {"answer_only", "simple_math"} else 35
        if len(text.strip()) < minimum_length:
            issues.append("answer_too_short")
        forbidden = [
            "undefined",
            "null",
            "placeholder",
            "template filler",
            "apply the correct method",
            "apply the correct rule",
            "right method",
            "main concept, then apply it carefully",
            "identify the exact topic",
            "answer follows the topic",
            "correct method and verify",
            "correct rule and checks",
            "generic study",
            "core concept method",
            "continuing from previous idea",
            "we were in the math lane",
            "math lane",
            "next useful move",
            "one-minute recap",
            "one minute recap",
            "previous explanation",
            "previous answer",
            "previous idea",
            "picking up from where we left off",
        ]
        for word in forbidden:
            if re.search(rf"\b{re.escape(word)}\b", text, re.I):
                issues.append(f"forbidden_{word.replace(' ', '_').replace('-', '_')}")
        if re.search(r"\bcontinu(?:e|es|ed|ing)\b", text, re.I):
            issues.append("forbidden_continuation_language")
        if re.search(r"\bwe were in\b", text, re.I):
            issues.append("forbidden_previous_subject_reference")
        required = []
        if kind in {"math_standard", "math_complex", "math_word_problem", "mistake_feedback"}:
            required.append("Final Answer")
        if kind == "math_proof":
            required.extend(["Proof", "Hence Proved"])
        if kind == "teach_progression":
            required.extend(["Concept", "Your turn"])
        for heading in required:
            if heading.lower() not in text.lower():
                issues.append(f"missing_{heading.lower().replace(' ', '_')}")
        if kind in {"answer_only", "simple_math"} and len(text.split()) > 40:
            issues.append("concise_request_ignored")
        issues.extend(self._question_relevance_issues(text, message, analysis, response_plan=plan))
        return issues

    def fallback_teaching_answer(self, message: str, analysis: QuestionAnalysis, merged: MergedKnowledge) -> str:
        if self._is_orbital_weightlessness_question(message):
            return self._orbital_weightlessness_answer()

        practice = self.practice.generate(analysis, message)
        mistake = self._common_mistake(analysis)
        return "\n\n".join([
            f"# {analysis.subject.value.replace('_', ' ').title()} Tutor Note",
            "### 1. Understand the Question\n" + self._understanding(message, analysis),
            "### 2. Identify Given Information\nThe important information is the topic, the task asked, and any numbers, terms, or relationships inside the question.",
            "### 3. Concept or Rule\n" + (merged.recommended_teaching_strategy or "Start from the main concept, then apply it carefully."),
            "### 4. Step-by-Step Solution\n1. Identify the exact topic.\n2. Apply the correct rule or method.\n3. Check that the answer matches the question.",
            "### 5. Final Answer\n**Final answer:** " + self._final_sentence(analysis),
            "### 6. Why This Works\nThis works because the answer follows the topic, method, and checking step instead of jumping directly to a result.",
            f"### 7. Common Mistakes\n{mistake}",
            f"### 8. Practice Question\n{practice}",
        ])

    def repair_prompt(self, original_prompt: str, bad_answer: str, issues: List[str]) -> str:
        return f"""
The previous answer failed quality validation.

Validation issues: {', '.join(issues)}

Bad answer:
{bad_answer}

Regenerate the answer. Every section must contain relevant content.
Do not refer to an earlier explanation, another subject lane, recap text, or generic transition phrases.
Answer only the student's exact question.

Original instructions:
{original_prompt}
""".strip()

    def _question_relevance_issues(
        self,
        answer: str,
        message: str,
        analysis: Optional[QuestionAnalysis],
        response_plan: Optional[dict] = None,
    ) -> List[str]:
        issues: List[str] = []
        kind = str((response_plan or {}).get("response_kind") or "")
        if self._is_orbital_weightlessness_question(message) and not self._answers_orbital_weightlessness(answer):
            issues.append("off_topic_orbital_weightlessness")

        if analysis and analysis.subject in {SubjectArea.physics, SubjectArea.chemistry, SubjectArea.biology}:
            if re.search(r"\b(coding help|product thinking|business direction|ui/ux direction)\b", answer, re.I):
                issues.append("wrong_subject_template_for_science")
            if re.search(r"\b(use|apply|start from)\s+the\s+(main\s+)?(concept|rule|method)\b", answer, re.I):
                issues.append("generic_science_non_answer")
            if re.search(r"\bimportant information is the topic\b", answer, re.I):
                issues.append("generic_missing_science_facts")

        if analysis and analysis.subject == SubjectArea.mathematics:
            asks_for_calculation = bool(
                re.search(r"\d", message)
                and re.search(r"\b(solve|find|calculate|add|plus|minus|subtract|multiply|divide|percent|ratio|area|volume|perimeter|mean|median|speed|work|interest)\b|[+\-*/=^]", message, re.I)
            )
            has_working = bool(re.search(r"\d+\s*[+\-*/=^x]\s*\d+|x\s*=|=", answer, re.I))
            if asks_for_calculation and not has_working and kind not in {"answer_only", "simple_math"}:
                issues.append("missing_calculation_for_math")
            if re.search(r"\bapply the correct (rule|method)\b|\bcore concept method\b", answer, re.I):
                issues.append("generic_math_non_answer")

        if re.search(r"\bthe important information is the topic\b|\bidentify the exact topic\b|\bcheck that the answer matches the question\b", answer, re.I):
            issues.append("generic_tutoring_shell")
        return issues

    def _is_orbital_weightlessness_question(self, message: str) -> bool:
        text = (message or "").lower()
        return bool(
            re.search(r"\b(astronaut|astronauts|spacecraft|spaceship|orbit|orbiting|weightless|weightlessness|microgravity|zero gravity|free fall)\b", text)
            and re.search(r"\b(gravity|earth|spacecraft|orbit|weightless|weightlessness)\b", text)
        )

    def _answers_orbital_weightlessness(self, answer: str) -> bool:
        text = (answer or "").lower()
        signals = [
            "free fall",
            "falling around earth",
            "orbit",
            "centripetal",
            "normal force",
            "support force",
            "microgravity",
            "apparent weightlessness",
            "weightlessness",
        ]
        return sum(1 for signal in signals if signal in text) >= 2

    def _orbital_weightlessness_answer(self) -> str:
        return "\n\n".join([
            "# Apparent Weightlessness in Orbit",
            "### 1. Understand the Question\nThe question asks why astronauts seem weightless inside an orbiting spacecraft even though Earth's gravity is still acting on them.",
            "### 2. Identify Given Information\n- The spacecraft is orbiting Earth.\n- Earth's gravity still pulls on both the spacecraft and astronauts.\n- The astronauts float relative to the spacecraft.",
            "### 3. Concept or Rule\n**Felt weight comes from a support force, also called the normal force.** In orbit, astronauts and the spacecraft are both in free fall around Earth, so the floor does not push up on them in the usual way.",
            "### 4. Step-by-Step Solution\n1. Gravity pulls the spacecraft and astronauts toward Earth.\n2. Their sideways speed makes their path curve around Earth, forming an orbit.\n3. The spacecraft and astronauts fall together under gravity.\n4. Because they fall together, there is almost no normal/support force between the astronaut and the floor.\n5. With almost no support force, the astronaut feels weightless.",
            "### 5. Final Answer\n**Astronauts appear weightless because they and the spacecraft are in free fall around Earth together. Gravity is still present; it provides the centripetal acceleration that keeps them in orbit. They feel weightless because there is almost no normal/support force pushing on their bodies.**",
            "### 6. Why This Works\nOn Earth, you feel your weight because the ground pushes up on you. In orbit, the spacecraft and everything inside it accelerate together under gravity, so objects float relative to each other. This condition is called microgravity.",
            "### 7. Common Mistakes\n- Thinking there is no gravity in space.\n- Thinking weightlessness means astronauts have no mass.\n- Forgetting that orbit is a form of free fall around Earth.",
            "### 8. Practice Question\nWhy does a person in a freely falling elevator feel lighter for a short time?",
        ])

    def _subject_rules(self, subject: SubjectArea) -> str:
        if subject == SubjectArea.mathematics:
            return "Mathematics: Understand the Question, Given Information, Formula or Concept, Step-by-Step Solution, Final Answer, Why This Works, Common Mistakes, Practice Question. Show formulas, substitutions, calculations, and verification."
        if subject in {SubjectArea.physics, SubjectArea.chemistry, SubjectArea.biology}:
            return "Science: Understand the Question, Important Concepts, Explanation, Real-Life Example, Final Answer, Common Misconceptions, Practice Question. Teach concepts before calculations."
        if subject == SubjectArea.english:
            return "English: For grammar, show Rule, Explanation, Examples, Common Mistakes, Practice Question. For literature, show Summary, Theme, Character or Text Analysis, Exam Style Answer, Key Takeaways."
        if subject in {SubjectArea.history, SubjectArea.geography, SubjectArea.civics, SubjectArea.economics}:
            return "Social Studies: Context, Timeline or hierarchy when relevant, Explanation, Cause and Effect, Exam Tips, Final Answer, Practice Question."
        if subject == SubjectArea.computer_science:
            return "Computer Science: Problem Understanding, Solution Strategy, Algorithm, Code only when required, Explanation, Complexity if useful, Practice Challenge."
        return "General Education: Understand, explain, answer, verify, common mistake, and practice."

    def _grade_rules(self, grade: GradeBand) -> str:
        if grade == GradeBand.grade_1_5:
            return "Use very simple words, short sentences, and one easy example."
        if grade == GradeBand.grade_6_8:
            return "Use moderate detail and beginner-friendly wording."
        if grade == GradeBand.grade_9_12:
            return "Use full academic explanations and exam-friendly phrasing."
        if grade == GradeBand.college:
            return "Use precise terms, deeper reasoning, and clear justification."
        return "Use student-friendly language."

    def _common_mistake(self, analysis: QuestionAnalysis) -> str:
        if analysis.subject == SubjectArea.mathematics:
            return "Students often skip defining the unknown, use the wrong formula, or forget to verify the result."
        if analysis.subject in {SubjectArea.physics, SubjectArea.chemistry}:
            return "Students often use formulas without checking units or the meaning of each value."
        if analysis.subject == SubjectArea.biology:
            return "Students often memorize keywords without explaining the process in order."
        if analysis.subject == SubjectArea.english:
            return "Students often choose what sounds right instead of connecting the answer to the rule or text evidence."
        return "Students often memorize facts without connecting the reason, context, and result."

    def _understanding(self, message: str, analysis: QuestionAnalysis) -> str:
        return f"The question is asking about **{analysis.topic}** in **{analysis.subject.value.replace('_', ' ')}**. We need to identify the main idea and answer it clearly."

    def _final_sentence(self, analysis: QuestionAnalysis) -> str:
        return f"the key idea is to use the correct {analysis.topic.lower()} method and verify the result."
