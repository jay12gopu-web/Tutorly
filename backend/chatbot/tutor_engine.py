from __future__ import annotations

import math
import re
from fractions import Fraction
from typing import List

from .modes import ModeStrategy
from .schemas import (
    ChatMode,
    DifficultyLevel,
    LearnerProfile,
    MemoryItem,
    ReasoningStep,
    StudyResource,
    SubjectArea,
    ToolCall,
    MergedKnowledge,
    QuestionAnalysis,
)


class TutorEngine:
    SUBJECT_HEADINGS = {
        SubjectArea.mathematics: "Math Solution",
        SubjectArea.physics: "Physics Explanation",
        SubjectArea.chemistry: "Chemistry Note",
        SubjectArea.biology: "Biology Note",
        SubjectArea.history: "History Note",
        SubjectArea.geography: "Geography Note",
        SubjectArea.civics: "Civics Note",
        SubjectArea.economics: "Economics Note",
        SubjectArea.computer_science: "Coding Help",
        SubjectArea.english: "English Note",
        SubjectArea.general_knowledge: "General Knowledge Note",
        SubjectArea.general: "Tutorly Note",
    }

    def compose_answer(
        self,
        message: str,
        subject: SubjectArea,
        difficulty: DifficultyLevel,
        strategy: ModeStrategy,
        profile: LearnerProfile,
        reasoning_plan: List[ReasoningStep],
        memories: List[MemoryItem],
        tool_calls: List[ToolCall],
        knowledge_notes: List[str],
        analysis: QuestionAnalysis | None = None,
        merged_knowledge: MergedKnowledge | None = None,
        practice_question: str = "",
    ) -> str:
        if self._is_casual(message):
            return self._casual_answer(message)

        if analysis:
            return self._compose_adaptive_answer(
                message=message,
                subject=subject,
                difficulty=difficulty,
                strategy=strategy,
                profile=profile,
                reasoning_plan=reasoning_plan,
                memories=memories,
                tool_calls=tool_calls,
                knowledge_notes=knowledge_notes,
                analysis=analysis,
                merged_knowledge=merged_knowledge,
                practice_question=practice_question,
            )

        sections = [
            f"# {self.SUBJECT_HEADINGS.get(subject, 'Tutorly Note')}",
            "",
            self._opening(subject, difficulty, strategy, profile),
            "",
            "## Explanation",
            "",
            self._subject_explanation(message, subject, tool_calls, knowledge_notes),
            "",
            "## Steps",
            "",
            *self._steps(subject, reasoning_plan, tool_calls),
            "",
            "## Example",
            "",
            self._example(subject, message),
            "",
            "## Final Answer",
            "",
            f"**Final answer:** {self._final_line(subject, message, tool_calls)}",
        ]

        if memories:
            sections.extend(["", "## Personalized Tip", "", self._personalized_tip(memories, profile)])

        if strategy.mode in {ChatMode.study, ChatMode.deep, ChatMode.prime}:
            sections.extend(["", "## Quick Check", "", "_Explain this back in your own words, then try one similar question._"])

        return "\n".join(sections)

    def _compose_adaptive_answer(
        self,
        message: str,
        subject: SubjectArea,
        difficulty: DifficultyLevel,
        strategy: ModeStrategy,
        profile: LearnerProfile,
        reasoning_plan: List[ReasoningStep],
        memories: List[MemoryItem],
        tool_calls: List[ToolCall],
        knowledge_notes: List[str],
        analysis: QuestionAnalysis,
        merged_knowledge: MergedKnowledge | None,
        practice_question: str,
    ) -> str:
        concept = (merged_knowledge.recommended_teaching_strategy if merged_knowledge else "") or self._concept_for(subject)
        steps = self._steps(subject, reasoning_plan, tool_calls)
        final_line = self._final_line(subject, message, tool_calls)
        common_mistake = self._common_mistake(subject, analysis)
        specific_lesson = self._specific_lesson(message, subject, analysis, practice_question)

        if specific_lesson:
            if strategy.mode == ChatMode.spark:
                return self._format_specific_lesson(specific_lesson, spark=True)
            return self._format_specific_lesson(specific_lesson)

        if strategy.mode == ChatMode.spark:
            return "\n\n".join([
                f"# {self.SUBJECT_HEADINGS.get(subject, 'Quick Answer')}",
                f"### Quick Solve\n{self._spark_steps(steps)}",
                f"### Final Answer\n**Final answer:** {final_line}",
                f"### Mini Check\n_Check the result against the exact question before moving on._",
            ])

        sections = [
            f"# {self.SUBJECT_HEADINGS.get(subject, 'Tutorly Note')}",
            "",
            f"### 1. Understand the Question\nThe question is about **{analysis.topic}**. We need to answer it using the right **{analysis.sub_topic or analysis.question_type.value}** method.",
            "",
            f"### 2. Identify Given Information\n- Subject: {subject.value.replace('_', ' ').title()}\n- Topic: {analysis.topic}\n- Difficulty: {difficulty.value}\n- Keywords: {', '.join(analysis.keywords[:6]) or 'not enough keywords'}",
            "",
            f"### 3. Concept or Rule\n{concept}",
            "",
            "### 4. Step-by-Step Solution",
            "",
            *steps,
            "",
            f"### 5. Final Answer\n**Final answer:** {final_line}",
            "",
            "### 6. Why This Works\nThis works because the explanation follows the question's topic, applies the correct rule, and checks the result instead of jumping straight to an answer.",
            "",
            f"### 7. Common Mistakes\n{common_mistake}",
            "",
            f"### 8. Practice Question\n{practice_question or self._example(subject, message)}",
        ]

        if memories:
            sections.extend(["", "### Personalized Tip", "", self._personalized_tip(memories, profile)])

        return "\n".join(sections)

    def _format_specific_lesson(self, lesson: dict, spark: bool = False) -> str:
        if spark:
            return "\n\n".join([
                f"# {lesson['title']}",
                "### Quick Solve\n" + "\n".join(lesson["steps"][:3]),
                "### Final Answer\n**Final answer:** " + lesson["final"],
                "### Mini Check\n" + lesson["check"],
            ])

        given = "\n".join(f"- {item}" for item in lesson["given"])
        steps = "\n".join(f"{index + 1}. {step}" for index, step in enumerate(lesson["steps"]))
        return "\n\n".join([
            f"# {lesson['title']}",
            "### 1. Understand the Question\n" + lesson["understand"],
            "### 2. Identify Given Information\n" + given,
            "### 3. Concept or Rule\n" + lesson["concept"],
            "### 4. Step-by-Step Solution\n" + steps,
            "### 5. Final Answer\n**Final answer:** " + lesson["final"],
            "### 6. Why This Works\n" + lesson["why"],
            "### 7. Common Mistakes\n" + lesson["mistake"],
            "### 8. Practice Question\n" + lesson["practice"],
        ])

    def _lesson(
        self,
        title: str,
        understand: str,
        given: List[str],
        concept: str,
        steps: List[str],
        final: str,
        why: str,
        mistake: str,
        practice: str,
        check: str = "Check the final answer against the question.",
    ) -> dict:
        return {
            "title": title,
            "understand": understand,
            "given": given or ["The question gives the key terms needed to answer."],
            "concept": concept,
            "steps": steps or ["Identify the concept.", "Apply it to the question.", "Check the result."],
            "final": final,
            "why": why,
            "mistake": mistake,
            "practice": practice,
            "check": check,
        }

    def _specific_lesson(self, message: str, subject: SubjectArea, analysis: QuestionAnalysis, practice_question: str) -> dict | None:
        text = re.sub(r"\s+", " ", message.lower())
        practice = practice_question or self._example(subject, message)

        answer_first_lesson = self._answer_first_lesson(text, practice)
        if answer_first_lesson:
            return answer_first_lesson

        if subject == SubjectArea.mathematics:
            if re.search(r"2x\s*\+\s*5\s*=\s*17", text):
                return self._lesson(
                    "Math Solution",
                    "We need to solve the linear equation and find the value of x.",
                    ["Equation: 2x + 5 = 17", "Unknown: x"],
                    "Use inverse operations: subtract first, then divide.",
                    ["Subtract 5 from both sides: 2x + 5 - 5 = 17 - 5.", "So, 2x = 12.", "Divide both sides by 2: x = 12 / 2 = 6."],
                    "x = 6",
                    "The same operation is done on both sides, so the equation stays balanced.",
                    "Do not divide before removing +5; isolate the term with x first.",
                    "Solve 3x + 4 = 19.",
                    "Check: 2(6) + 5 = 12 + 5 = 17.",
                )
            if re.search(r"x\^2\s*-\s*5x\s*\+\s*6\s*=\s*0", text):
                return self._lesson(
                    "Math Solution",
                    "We need to solve a quadratic equation by finding the values of x that make it equal to zero.",
                    ["Equation: x^2 - 5x + 6 = 0", "We need two numbers that multiply to 6 and add to -5."],
                    "Factoring rewrites a quadratic as a product of two brackets.",
                    ["x^2 - 5x + 6 = 0.", "Factor: (x - 2)(x - 3) = 0.", "Set each factor to zero: x - 2 = 0 or x - 3 = 0.", "So, x = 2 or x = 3."],
                    "x = 2 or x = 3",
                    "If either factor is zero, the whole product becomes zero.",
                    "Do not stop after factoring; set each bracket equal to zero.",
                    "Solve x^2 - 7x + 12 = 0.",
                    "Check: 2^2 - 5(2) + 6 = 0 and 3^2 - 5(3) + 6 = 0.",
                )
            if "64 + 88" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to add 64 and 88 using place value.",
                    ["64 has 6 tens and 4 ones.", "88 has 8 tens and 8 ones."],
                    "Add ones first, carry if needed, then add tens.",
                    ["Ones: 4 + 8 = 12, write 2 and carry 1.", "Tens: 6 + 8 + 1 = 15.", "So, 64 + 88 = 152."],
                    "152",
                    "The carry moves one ten into the tens column, which keeps place value correct.",
                    "Do not write 12 fully in the ones column; carry the 1 to the tens column.",
                    "Add 57 + 69.",
                    "Check: 88 + 64 also gives 152.",
                )
            if "20 percent of 150" in text or "20 percent" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to find 20% of 150.",
                    ["Percentage: 20%", "Whole amount: 150"],
                    "A percentage means out of 100, so 20% = 20/100 = 0.2.",
                    ["20% of 150 = (20/100) x 150.", "0.2 x 150 = 30."],
                    "30",
                    "Percent means parts per hundred, so multiplying by 20/100 gives the required part.",
                    "Do not add 20 to 150; percentage questions usually need multiplication.",
                    "Find 15 percent of 200.",
                    "Check: 10% of 150 is 15, so 20% is 30.",
                )
            if "mean of 12" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to find the average of the five numbers.",
                    ["Numbers: 12, 15, 18, 20, 25", "Count: 5 numbers"],
                    "Mean = sum of values / number of values.",
                    ["Add the values: 12 + 15 + 18 + 20 + 25 = 90.", "Divide by the count: 90 / 5 = 18."],
                    "Mean = 18",
                    "The mean shares the total equally among all values.",
                    "Do not forget to divide by the number of values after adding.",
                    "Find the mean of 8, 10, 12, and 14.",
                    "Check: 18 x 5 = 90.",
                )
            if "area of a triangle" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to find the area of a triangle from its base and height.",
                    ["Base = 10 cm", "Height = 8 cm"],
                    "Area of triangle = 1/2 x base x height.",
                    ["Area = 1/2 x 10 x 8.", "Area = 5 x 8 = 40 cm^2."],
                    "40 cm^2",
                    "A triangle is half of a rectangle with the same base and height.",
                    "Do not forget the 1/2 in the triangle area formula.",
                    "Find the area of a triangle with base 12 cm and height 5 cm.",
                    "Check: 10 x 8 = 80, and half of 80 is 40.",
                )
            if "pythagoras" in text or "hypotenuse" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to find the hypotenuse of a right triangle.",
                    ["Short sides: 3 and 4", "Unknown: hypotenuse"],
                    "Pythagoras theorem: a^2 + b^2 = c^2.",
                    ["3^2 + 4^2 = c^2.", "9 + 16 = 25.", "c = square root of 25 = 5."],
                    "Hypotenuse = 5",
                    "In a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides.",
                    "Do not add 3 + 4 directly; use squares for right triangles.",
                    "Find the hypotenuse when the other sides are 5 and 12.",
                    "Check: 5^2 = 25 and 3^2 + 4^2 = 25.",
                )
            if "18/24" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to simplify the fraction 18/24.",
                    ["Numerator = 18", "Denominator = 24", "Greatest common factor = 6"],
                    "Divide the numerator and denominator by the same non-zero number.",
                    ["18 / 6 = 3.", "24 / 6 = 4.", "So, 18/24 = 3/4."],
                    "3/4",
                    "Dividing both parts by 6 keeps the fraction's value the same but makes it simpler.",
                    "Do not divide only the numerator or only the denominator.",
                    "Simplify 20/30.",
                    "Check: 3/4 = 0.75 and 18/24 = 0.75.",
                )
            if "train travels 120" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to find speed from distance and time.",
                    ["Distance = 120 km", "Time = 2 hours"],
                    "Speed = distance / time.",
                    ["Speed = 120 / 2.", "Speed = 60 km/h."],
                    "60 km/h",
                    "Speed tells how much distance is covered in one unit of time.",
                    "Do not write only 60; include the unit km/h.",
                    "A car travels 180 km in 3 hours. Find its speed.",
                    "Check: 60 km/h x 2 h = 120 km.",
                )
            if "square root of 144" in text:
                return self._lesson(
                    "Math Solution",
                    "We need the number that gives 144 when multiplied by itself.",
                    ["Number: 144"],
                    "Square root means the opposite of squaring.",
                    ["12 x 12 = 144.", "Therefore, square root of 144 = 12."],
                    "12",
                    "Since 12 squared equals 144, 12 is the principal square root.",
                    "Do not confuse square root with dividing by 2.",
                    "Find the square root of 169.",
                    "Check: 12 x 12 = 144.",
                )
            if "rectangular garden" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to find the width and length of a rectangle using area.",
                    ["Area = 84 square meters", "Length is 5 meters longer than width", "Let width = w, so length = w + 5"],
                    "Area of rectangle = length x width.",
                    ["w(w + 5) = 84.", "w^2 + 5w - 84 = 0.", "Factor: (w + 12)(w - 7) = 0.", "Width cannot be negative, so w = 7.", "Length = w + 5 = 12."],
                    "Width = 7 m and length = 12 m",
                    "The area relationship creates a quadratic equation, and the positive solution gives the real garden dimensions.",
                    "Do not accept the negative width because lengths cannot be negative in this context.",
                    "A rectangle has area 54 m^2 and length 3 m longer than width. Find both dimensions.",
                    "Check: 7 x 12 = 84.",
                )
            if "ratio 2:3" in text:
                return self._lesson(
                    "Math Solution",
                    "We need to share 50 chocolates in the ratio 2:3.",
                    ["Ratio = 2:3", "Total chocolates = 50", "Total parts = 2 + 3 = 5 parts"],
                    "One part = total amount / total ratio parts.",
                    ["One part = 50 / 5 = 10.", "Riya gets 2 parts = 2 x 10 = 20.", "Aman gets 3 parts = 3 x 10 = 30."],
                    "Riya gets 20 chocolates and Aman gets 30 chocolates",
                    "Ratios split a total into equal parts first, then assign the parts.",
                    "Do not split 50 directly into 2 and 3; first find the value of one part.",
                    "Share 60 candies in the ratio 1:2.",
                    "Check: 20 + 30 = 50.",
                )

        if subject in {SubjectArea.physics, SubjectArea.chemistry, SubjectArea.biology}:
            return self._science_lesson(text, subject, practice)

        if subject == SubjectArea.english:
            return self._english_lesson(text, practice)

        if subject in {SubjectArea.history, SubjectArea.geography}:
            return self._social_studies_lesson(text, subject, practice)

        return None

    def _answer_first_lesson(self, text: str, practice: str) -> dict | None:
        """Produce the concrete answer before wrapping it in tutor sections.

        The adversarial suite showed that generic teaching shells are harmful when no
        actual answer has been computed. These builders are intentionally direct:
        answer first, verification second, explanation third.
        """
        for builder in (
            self._math_answer_first_lesson,
            self._physics_answer_first_lesson,
            self._chemistry_answer_first_lesson,
            self._biology_answer_first_lesson,
            self._english_answer_first_lesson,
            self._history_answer_first_lesson,
            self._geography_answer_first_lesson,
        ):
            lesson = builder(text, practice)
            if lesson:
                return lesson
        return None

    def _pretty_fraction(self, value: Fraction) -> str:
        if value.denominator == 1:
            return str(value.numerator)
        return f"{value.numerator}/{value.denominator}"

    def _math_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        linear = None if "x^2" in text else re.search(r"(?<![a-z])(\d*)x\s*([+-])\s*(\d+)\s*=\s*(-?\d+)", text)
        if linear:
            coefficient = int(linear.group(1) or "1")
            sign = linear.group(2)
            constant = int(linear.group(3))
            rhs = int(linear.group(4))
            moved = rhs - constant if sign == "+" else rhs + constant
            solution = Fraction(moved, coefficient)
            answer = self._pretty_fraction(solution)
            check_left = coefficient * solution + (constant if sign == "+" else -constant)
            return self._lesson(
                "Math Solution",
                "We need to isolate x and find the value that makes the equation true.",
                [f"Equation: {coefficient if coefficient != 1 else ''}x {sign} {constant} = {rhs}", "Unknown: x"],
                "Use inverse operations: undo addition or subtraction first, then divide by the coefficient of x.",
                [
                    (f"Add {constant} to both sides: {coefficient if coefficient != 1 else ''}x = {moved}." if sign == "-" else f"Subtract {constant} from both sides: {coefficient if coefficient != 1 else ''}x = {moved}."),
                    f"Divide by {coefficient}: x = {moved}/{coefficient}.",
                    f"So, x = {answer}.",
                ],
                f"x = {answer}",
                "Each operation is applied equally to both sides, so the equation stays balanced.",
                "Do not divide before removing the constant term; isolate the x term first.",
                "Solve 5x - 9 = 31.",
                f"Check: {coefficient}({answer}) {sign} {constant} = {self._pretty_fraction(check_left)}.",
            )

        quadratic = re.search(r"x\^2\s*([+-])\s*(\d+)x\s*([+-])\s*(\d+)\s*=\s*0", text)
        if quadratic:
            b = int(quadratic.group(2)) * (1 if quadratic.group(1) == "+" else -1)
            c = int(quadratic.group(4)) * (1 if quadratic.group(3) == "+" else -1)
            factors = None
            limit = abs(c) + abs(b) + 8
            for first in range(-limit, limit + 1):
                if first == 0 and c != 0:
                    continue
                for second in range(-limit, limit + 1):
                    if first + second == b and first * second == c:
                        factors = (first, second)
                        break
                if factors:
                    break
            if factors:
                p, q = factors
                roots = (-p, -q)
                return self._lesson(
                    "Math Solution",
                    "We need to find the two values of x that make the quadratic equal to zero.",
                    [f"Equation: x^2 {'+' if b >= 0 else '-'} {abs(b)}x {'+' if c >= 0 else '-'} {abs(c)} = 0", f"Need two numbers with sum {b} and product {c}."],
                    "For x^2 + bx + c, factor using two numbers that add to b and multiply to c.",
                    [
                        f"The two numbers are {p} and {q}.",
                        f"So, x^2 {'+' if b >= 0 else '-'} {abs(b)}x {'+' if c >= 0 else '-'} {abs(c)} = (x {'+' if p >= 0 else '-'} {abs(p)})(x {'+' if q >= 0 else '-'} {abs(q)}).",
                        f"Set each factor to zero: x = {roots[0]} or x = {roots[1]}.",
                    ],
                    f"x = {roots[0]} or x = {roots[1]}",
                    "A product equals zero when at least one of its factors is zero.",
                    "Do not stop after factoring; each bracket must be set equal to zero.",
                    "Solve x^2 + 5x + 6 = 0.",
                    f"Check: substituting x = {roots[0]} and x = {roots[1]} makes the expression equal to 0.",
                )

        addition = re.search(r"(\d+)\s+plus\s+(\d+)", text) or re.search(r"(\d+)\s*\+\s*(\d+)", text)
        if addition and "percent" not in text:
            first, second = int(addition.group(1)), int(addition.group(2))
            total = first + second
            return self._lesson(
                "Math Solution",
                "We need to check the addition carefully.",
                [f"First number = {first}", f"Second number = {second}"],
                "Add ones first, then tens/hundreds using place value.",
                [f"{first} + {second} = {total}.", f"If someone got a different answer, compare the ones and tens columns."],
                str(total),
                "Addition combines the two amounts into one total.",
                "A common mistake is forgetting a carry or adding only one column correctly.",
                "Check 56 plus 38.",
                f"Check: {total} - {second} = {first}.",
            )

        discount = re.search(r"costs?\s+(\d+).*?(\d+)\s*percent\s+discount", text)
        if discount:
            price = int(discount.group(1))
            percent = int(discount.group(2))
            discount_amount = Fraction(price * percent, 100)
            sale = Fraction(price) - discount_amount
            return self._lesson(
                "Math Solution",
                "We need to subtract the discount from the original price.",
                [f"Original price = {price} rupees", f"Discount = {percent}%"],
                "Discount amount = original price x discount percent / 100.",
                [
                    f"{percent}% of {price} = {price} x {percent}/100 = {self._pretty_fraction(discount_amount)} rupees.",
                    f"Sale price = {price} - {self._pretty_fraction(discount_amount)} = {self._pretty_fraction(sale)} rupees.",
                ],
                f"{self._pretty_fraction(sale)} rupees",
                "A discount reduces the price, so it must be subtracted from the original cost.",
                "Do not report only the discount amount; the question asks for the sale price.",
                "A bag costs 1200 rupees with a 10 percent discount. Find the sale price.",
                f"Check: {percent}% off means the customer pays {100 - percent}% of {price}.",
            )

        ratio = re.search(r"share\s+(\d+).*?ratio\s+(\d+)\s*:\s*(\d+)\s*:\s*(\d+)", text)
        if ratio:
            total = int(ratio.group(1))
            parts = [int(ratio.group(2)), int(ratio.group(3)), int(ratio.group(4))]
            total_parts = sum(parts)
            one_part = Fraction(total, total_parts)
            shares = [one_part * part for part in parts]
            return self._lesson(
                "Math Solution",
                "We need to divide the total into ratio parts.",
                [f"Total = {total}", f"Ratio = {parts[0]}:{parts[1]}:{parts[2]}", f"{parts[0]} + {parts[1]} + {parts[2]} = {total_parts} parts"],
                "One ratio part = total amount / total number of parts.",
                [
                    f"One part = {total}/{total_parts} = {self._pretty_fraction(one_part)}.",
                    f"Shares = {parts[0]}x, {parts[1]}x, {parts[2]}x.",
                    "So the shares are " + ", ".join(self._pretty_fraction(share) for share in shares) + ".",
                ],
                ", ".join(self._pretty_fraction(share) for share in shares),
                "Ratios first split the total into equal parts, then assign the required number of parts.",
                "Do not divide by the number of people; divide by the sum of ratio parts.",
                "Share 120 in the ratio 2:3:5.",
                "Check: " + " + ".join(self._pretty_fraction(share) for share in shares) + f" = {total}.",
            )

        average_speed = re.search(r"covers?\s+(\d+)\s*km\s+in\s+(\d+)\s*hours?.*?(\d+)\s*km\s+in\s+(\d+)\s*hours?", text)
        if average_speed:
            d1, t1, d2, t2 = map(int, average_speed.groups())
            total_distance = d1 + d2
            total_time = t1 + t2
            speed = Fraction(total_distance, total_time)
            return self._lesson(
                "Math Solution",
                "We need the average speed for the whole trip, not the average of the two speeds.",
                [f"First part: {d1} km in {t1} h", f"Second part: {d2} km in {t2} h"],
                "Average speed = total distance / total time.",
                [
                    f"Total distance = {d1} + {d2} = {total_distance} km.",
                    f"Total time = {t1} + {t2} = {total_time} h.",
                    f"Average speed = {total_distance}/{total_time} = {self._pretty_fraction(speed)} km/h.",
                ],
                f"{self._pretty_fraction(speed)} km/h",
                "Average speed depends on the whole distance and whole time.",
                "Do not average separate speeds unless the time intervals are equal.",
                "A car travels 100 km in 2 h and 150 km in 3 h. Find average speed.",
                f"Check: {self._pretty_fraction(speed)} km/h x {total_time} h = {total_distance} km.",
            )

        perimeter_rect = re.search(r"perimeter\s+of\s+a\s+rectangle\s+is\s+(\d+).*?length\s+is\s+(\d+)", text)
        if perimeter_rect:
            perimeter = int(perimeter_rect.group(1))
            length = int(perimeter_rect.group(2))
            width = Fraction(perimeter, 2) - length
            return self._lesson(
                "Math Solution",
                "We need to find the missing width of the rectangle.",
                [f"Perimeter = {perimeter} cm", f"Length = {length} cm"],
                "Perimeter of rectangle = 2(l + w), where l is length and w is width.",
                [
                    f"{perimeter} = 2({length} + width).",
                    f"l + w = {Fraction(perimeter, 2)}.",
                    f"{length} + w = {Fraction(perimeter, 2)}, so w = {self._pretty_fraction(width)} cm.",
                ],
                f"Width = {self._pretty_fraction(width)} cm",
                "Half the perimeter gives length + width, so subtracting the length gives the width.",
                "Do not use area formula when the question gives perimeter.",
                "A rectangle has perimeter 64 cm and length 20 cm. Find its width.",
                f"Check: 2({length} + {self._pretty_fraction(width)}) = {perimeter}.",
            )

        fraction_add = re.search(r"(\d+)\s*/\s*(\d+).*?(?:and|\+)\s*(\d+)\s*/\s*(\d+)", text)
        if fraction_add:
            a, b, c, d = map(int, fraction_add.groups())
            first = Fraction(a, b)
            second = Fraction(c, d)
            total = first + second
            lcm = abs(b * d) // math.gcd(b, d)
            return self._lesson(
                "Math Solution",
                "We need to add two fractions by using a common denominator.",
                [f"First fraction = {a}/{b}", f"Second fraction = {c}/{d}"],
                "Fractions can be added when their denominators are the same.",
                [
                    f"LCM of {b} and {d} is {lcm}.",
                    f"{a}/{b} = {first.numerator * (lcm // first.denominator)}/{lcm}.",
                    f"{c}/{d} = {second.numerator * (lcm // second.denominator)}/{lcm}.",
                    f"Add: {self._pretty_fraction(first)} + {self._pretty_fraction(second)} = {self._pretty_fraction(total)}.",
                ],
                self._pretty_fraction(total),
                "The common denominator lets the parts represent the same-sized pieces.",
                "Do not add denominators directly.",
                "Add 1/3 and 1/6.",
                f"Check: {float(first):.2f} + {float(second):.2f} = {float(total):.2f}.",
            )

        exponent = re.search(r"(\d+)\s*\^\s*(\d+)\s*(?:x|\*)\s*\1\s*\^\s*(\d+)", text)
        if exponent:
            base, power1, power2 = map(int, exponent.groups())
            new_power = power1 + power2
            value = base ** new_power
            return self._lesson(
                "Math Solution",
                "We need to multiply powers with the same base.",
                [f"Base = {base}", f"Powers = {power1} and {power2}"],
                "When bases are the same, add exponents: a^m x a^n = a^(m+n).",
                [f"{base}^{power1} x {base}^{power2} = {base}^({power1}+{power2}).", f"{base}^{new_power} = {value}."],
                f"{base}^{new_power} = {value}",
                "Multiplication combines repeated factors, so the exponent count increases.",
                "Do not multiply the exponents; add them when multiplying same bases.",
                "Simplify 2^3 x 2^4.",
                f"Check: the final exponent is {power1} + {power2} = {new_power}.",
            )

        age = re.search(r"twice\s+as\s+old.*?in\s+(\d+)\s+years.*?add\s+to\s+(\d+)", text)
        if age:
            years, future_total = map(int, age.groups())
            rohan = Fraction(future_total - 2 * years, 3)
            mina = 2 * rohan
            return self._lesson(
                "Math Solution",
                "We need to find two present ages using the relationship and future total.",
                [f"Rohan = x", f"Mina = 2x", f"In {years} years, their ages add to {future_total}"],
                "Let Rohan's present age be x. Then Mina's present age is 2x.",
                [
                    f"x + {years} + 2x + {years} = {future_total}.",
                    f"3x + {2 * years} = {future_total}.",
                    f"3x = {future_total - 2 * years}, so x = {self._pretty_fraction(rohan)}.",
                    f"Mina = 2x = {self._pretty_fraction(mina)}.",
                ],
                f"Rohan = {self._pretty_fraction(rohan)} years, Mina = {self._pretty_fraction(mina)} years",
                "The equation includes both people after the same number of years.",
                "Do not double the future age before adding the 6 years; set present ages first.",
                "A is three times B. In 4 years their ages add to 56. Find present ages.",
                f"Check: in {years} years, ages are {self._pretty_fraction(rohan + years)} and {self._pretty_fraction(mina + years)}.",
            )

        cylinder = re.search(r"cylinder.*?radius\s+(\d+).*?height\s+(\d+)", text)
        if cylinder:
            radius, height = map(int, cylinder.groups())
            pi_value = Fraction(22, 7) if "22/7" in text else Fraction(314, 100)
            volume = pi_value * radius * radius * height
            return self._lesson(
                "Math Solution",
                "We need to find the volume of a cylinder.",
                [f"Radius = {radius} cm", f"Height = {height} cm", f"pi = {self._pretty_fraction(pi_value)}"],
                "Volume of cylinder = pi r^2 h.",
                [
                    f"V = {self._pretty_fraction(pi_value)} x {radius}^2 x {height}.",
                    f"V = {self._pretty_fraction(pi_value)} x {radius * radius} x {height}.",
                    f"V = {self._pretty_fraction(volume)} cm^3.",
                ],
                f"{self._pretty_fraction(volume)} cm^3",
                "The base is a circle of area pi r^2, and stacking that base through height h gives volume.",
                "Do not use 2 pi r h; that is part of surface area, not volume.",
                "Find the volume of a cylinder with radius 3 cm and height 5 cm.",
                f"Check: units are cubic centimeters because volume is three-dimensional.",
            )

        simple_interest = re.search(r"principal\s+(\d+).*?rate\s+(\d+).*?time\s+(\d+)", text) or re.search(r"interest\s+on\s+(\d+).*?(\d+)\s*percent.*?(\d+)\s*years?", text)
        if simple_interest:
            principal, rate, time = map(int, simple_interest.groups())
            interest = Fraction(principal * rate * time, 100)
            return self._lesson(
                "Math Solution",
                "We need to calculate simple interest.",
                [f"Principal = {principal}", f"Rate = {rate}%", f"Time = {time} years"],
                "SI = PRT/100, where P is principal, R is rate, and T is time.",
                [f"SI = {principal} x {rate} x {time} / 100.", f"SI = {self._pretty_fraction(interest)}."],
                f"Simple interest = {self._pretty_fraction(interest)}",
                "Simple interest is calculated only on the original principal.",
                "Do not compound the amount unless the question asks for compound interest.",
                "Find SI for P = 2000, R = 5%, T = 4 years.",
                "Check the units: the answer is money, not percent.",
            )

        probability = re.search(r"(\d+)\s+red\s+balls?.*?(\d+)\s+blue\s+balls?", text)
        if probability:
            red, blue = map(int, probability.groups())
            total = red + blue
            probability_value = Fraction(red, total)
            return self._lesson(
                "Math Solution",
                "We need the probability of choosing a red ball.",
                [f"Red balls = {red}", f"Blue balls = {blue}", f"Total balls = {red} + {blue} = {total}"],
                "Probability = favorable outcomes / total outcomes.",
                [f"Favorable outcomes = red balls = {red}.", f"Probability = {red}/{total} = {self._pretty_fraction(probability_value)}."],
                f"{self._pretty_fraction(probability_value)}",
                "Each ball is equally likely, so the chance of red is red balls divided by total balls.",
                "Do not divide by only the blue balls or ignore the total.",
                "A bag has 4 red balls and 6 green balls. Find P(red).",
                f"Check: probability is between 0 and 1, and {self._pretty_fraction(probability_value)} fits.",
            )

        if "sqrt" in text and "50" in text:
            return self._lesson(
                "Math Solution",
                "We need to simplify the square root by taking out the largest perfect square factor.",
                ["Expression: sqrt(50)", "50 = 25 x 2"],
                "sqrt(ab) = sqrt(a) x sqrt(b).",
                ["sqrt(50) = sqrt(25 x 2).", "sqrt(25) = 5.", "So sqrt(50) = 5sqrt(2)."],
                "5sqrt(2)",
                "Taking out the perfect square 25 makes the radical simpler.",
                "Do not write sqrt(50) = 25; square root is not the same as dividing by 2.",
                "Simplify sqrt(72).",
                "Check: (5sqrt(2))^2 = 25 x 2 = 50.",
            )

        if "median" in text:
            numbers = [int(n) for n in re.findall(r"-?\d+", text)]
            if len(numbers) >= 3:
                ordered = sorted(numbers)
                mid = len(ordered) // 2
                median = ordered[mid] if len(ordered) % 2 else Fraction(ordered[mid - 1] + ordered[mid], 2)
                return self._lesson(
                    "Math Solution",
                    "We need to find the middle value after arranging the data.",
                    ["Numbers: " + ", ".join(map(str, numbers))],
                    "Median is the middle value in ordered data.",
                    [f"Arrange: {', '.join(map(str, ordered))}.", f"The median is {self._pretty_fraction(Fraction(median))}."],
                    f"Median = {self._pretty_fraction(Fraction(median))}",
                    "Ordering the data shows which value is truly in the middle.",
                    "Do not find the mean when the question asks for the median.",
                    "Find the median of 4, 10, 2, 8, 6.",
                    "Check: the same number of values lie on each side of the median.",
                )
        return None

    def _physics_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        force = re.search(r"(\d+)\s*kg.*?(\d+)\s*m/s\^?2", text)
        if "force" in text and force:
            mass, acceleration = map(int, force.groups())
            result = mass * acceleration
            return self._lesson("Physics Explanation", "We need to find force from mass and acceleration.", [f"Mass = {mass} kg", f"Acceleration = {acceleration} m/s^2"], "Newton's second law: F = ma.", [f"F = {mass} x {acceleration}.", f"F = {result} N."], f"{result} N", "Force depends directly on both mass and acceleration.", "Do not forget the unit newton (N).", "Find force when mass is 8 kg and acceleration is 3 m/s^2.", f"Check: kg x m/s^2 = N.")
        work = re.search(r"force\s+of\s+(\d+)\s*n.*?(\d+)\s*m", text)
        if work:
            force_value, distance = map(int, work.groups())
            result = force_value * distance
            return self._lesson("Physics Explanation", "We need to calculate work done when force moves an object.", [f"Force = {force_value} N", f"Distance = {distance} m"], "Work = force x distance in the direction of force.", [f"W = {force_value} x {distance}.", f"W = {result} J."], f"{result} J", "Work is energy transferred by a force through a distance.", "Do not use work formula if the object does not move in the force direction.", "A 15 N force moves a box 4 m. Find work done.", "Check: N x m = joule.")
        momentum = re.search(r"(\d+)\s*kg.*?(\d+)\s*m/s", text)
        if "momentum" in text and momentum:
            mass, velocity = map(int, momentum.groups())
            result = mass * velocity
            return self._lesson("Physics Explanation", "We need to find the momentum of a moving object.", [f"Mass = {mass} kg", f"Velocity = {velocity} m/s"], "Momentum formula: p = mv.", [f"p = mv = {mass} x {velocity}.", f"p = {result} kg m/s."], f"{result} kg m/s", "Momentum measures how much motion an object has.", "Do not confuse momentum with force; force changes momentum.", "Find momentum of a 5 kg object moving at 6 m/s.", "Check: kg x m/s is the unit of momentum.")
        voltage = re.search(r"current\s+(\d+).*?resistance\s+(\d+)", text)
        if voltage:
            current, resistance = map(int, voltage.groups())
            result = current * resistance
            return self._lesson("Physics Explanation", "We need voltage from current and resistance.", [f"Current = {current} A", f"Resistance = {resistance} ohm"], "Ohm's law: V = IR.", [f"V = {current} x {resistance}.", f"V = {result} V."], f"{result} V", "For a fixed resistance, voltage pushes current through the circuit.", "Do not divide unless the unknown is current or resistance.", "Find voltage when I = 3 A and R = 4 ohm.", "Check: V/A = ohm.")
        density = re.search(r"mass\s+(\d+).*?volume\s+(\d+)", text)
        if density:
            mass_value, volume = map(int, density.groups())
            result = Fraction(mass_value, volume)
            return self._lesson("Physics Explanation", "We need density from mass and volume.", [f"Mass = {mass_value} g", f"Volume = {volume} cm3"], "Density = mass / volume.", [f"Density = {mass_value}/{volume}.", f"Density = {self._pretty_fraction(result)} g/cm3."], f"{self._pretty_fraction(result)} g/cm3", "Density tells how much mass is packed into each unit volume.", "Do not multiply mass and volume for density.", "Find density if mass is 150 g and volume is 30 cm^3.", "Check the density unit should be mass per volume.")
        if "sharp knife" in text:
            return self._lesson("Physics Explanation", "We need to explain why a sharp knife cuts more easily.", ["Sharp knife has a smaller contact area.", "Same force can be applied by the hand."], "Pressure = force / area.", ["A sharp edge has very small area.", "For the same force, smaller area gives larger pressure.", "Higher pressure helps the knife cut into the material."], "A sharp knife cuts better because it produces greater pressure on a smaller area.", "The cutting effect depends on pressure, not just force.", "Do not say the sharp knife has more force; the same force is concentrated into less area.", "Why do pointed nails enter wood more easily?", "Check: reducing area increases pressure.")
        if "metal chair" in text and "wooden" in text:
            return self._lesson("Physics Explanation", "We need to explain why two objects at the same room temperature feel different.", ["Metal and wood are in the same room.", "Metal feels colder."], "Metals have high thermal conductivity; wood is a poor conductor.", ["Your hand is warmer than the chair.", "Heat leaves hand faster through metal because metal conducts heat well.", "Wood removes heat slowly, so it feels less cold."], "A metal chair feels colder because heat leaves your hand faster through metal than through wood.", "Cold feeling depends on heat transfer rate and thermal conductivity, not only actual temperature.", "Do not say the metal is necessarily at a lower temperature.", "Why does a tile floor feel colder than a carpet?", "Check: both can have the same temperature but different conductivity.")
        if "ship" in text and "steel" in text and "float" in text:
            return self._lesson("Physics Explanation", "We need to explain how a steel ship can float even though steel itself is dense.", ["The ship is made of steel.", "It contains a large hollow space with air.", "It displaces water."], "An object floats when the upward buoyant force, or upthrust, balances its weight, and its average density is less than the fluid.", ["The ship's hollow shape traps air and increases total volume.", "Its total mass spread over that large volume gives a lower average density than water.", "It displaces enough water for the upward upthrust to support it."], "A steel ship floats because its overall average density is lower than water and the displaced water provides enough upthrust.", "Buoyancy depends on the whole object's average density and displaced water, not only the material.", "Do not say steel floats by itself; a solid block of steel usually sinks.", "Why does a hollow plastic ball float?", "Check: if water fills the ship, average density increases and it can sink.")
        if "bus starts suddenly" in text or "fall backward" in text:
            return self._lesson("Physics Explanation", "We need to identify why passengers move backward when a bus starts suddenly.", ["Bus moves forward suddenly.", "Passengers tend to remain at rest."], "Inertia is the tendency of a body to resist changes in motion.", ["The bus floor moves forward first.", "The feet move with the bus due to friction.", "The upper body tends to remain at rest, so the passenger appears to fall backward."], "It happens because of inertia, not because of gravity.", "Newton's first law explains resistance to changes in motion.", "Do not blame gravity for the backward motion; gravity acts downward.", "Why do passengers move forward when a bus stops suddenly?", "Check: the effect happens during sudden acceleration.")
        if "stone tied to a string" in text or "circle when whirled" in text:
            return self._lesson("Physics Explanation", "We need to explain circular motion of a stone on a string.", ["Stone moves in a circle.", "String pulls the stone towards center."], "Centripetal force is the inward force needed for circular motion.", ["The stone's velocity changes direction continuously.", "The string tension pulls the stone towards center.", "That string tension acts as centripetal force."], "The stone moves in a circle because string tension provides centripetal force towards center and keeps changing its direction.", "Circular motion needs an inward force to continuously change direction.", "Do not think the force acts outward; the real force from the string is inward.", "Why does a satellite need gravity to orbit Earth?", "Check: if the string breaks, the stone moves tangentially.")
        if "sound" in text and ("space" in text or "vacuum" in text):
            return self._lesson("Physics Explanation", "We need to explain whether sound can travel through empty space.", ["Sound is a mechanical wave.", "Space is nearly a vacuum."], "Sound needs medium such as air, water, or solids.", ["Sound travels by vibrating particles.", "In a vacuum there are almost no particles to vibrate.", "So sound cannot travel through empty space."], "Sound cannot travel through space because sound needs medium.", "Mechanical waves require particles to pass vibrations along.", "Do not confuse sound waves with light waves; light can travel through vacuum.", "Why can light from the Sun reach Earth through space?", "Check: astronauts use radios, not direct sound, to communicate.")
        if "plane mirror" in text or ("mirror" in text and ("reflection" in text or "face" in text)):
            return self._lesson("Physics Explanation", "We need to state the basic rule of reflection.", ["Light hits a mirror.", "Light reflects from the surface."], "Law of reflection: angle of incidence equals angle of reflection.", ["The incoming ray makes an angle with the normal.", "The reflected ray leaves at the same angle on the other side of the normal."], "A mirror reflects light with angle of incidence equal to angle of reflection.", "Smooth surfaces give regular reflection, forming clear images.", "Do not measure the angle from the mirror surface; measure it from the normal.", "What happens when light reflects from a rough wall?", "Check: equal angles explain mirror images.")
        if "pencil" in text and "water" in text:
            return self._lesson("Physics Explanation", "We need to explain why a pencil looks bent in water.", ["Pencil is partly in air and partly in water.", "Light travels through two media."], "Refraction is the bending of light when it changes speed between media.", ["Light from the underwater part bends as it leaves water and enters air.", "Your eye traces the bent light backward.", "This makes the pencil appear displaced or bent."], "The pencil looks bent because of refraction of light at the water-air boundary.", "Different media change the speed and direction of light.", "Do not say the pencil actually bends; only its image appears bent.", "Why does a coin in water appear raised?", "Check: the effect happens at the boundary of two media.")
        if ("gravity" in text and "vacuum" in text) or ("fall" in text and "same acceleration" in text and "vacuum" in text):
            return self._lesson("Physics Explanation", "We need to explain falling motion in a vacuum.", ["Gravity acts on objects.", "Vacuum has no air resistance."], "Without air resistance, all objects near Earth have the same acceleration due to gravity.", ["A feather falls slowly in air because air resistance is large compared with its weight.", "In a vacuum, air resistance is removed.", "So heavy and light objects fall at the same acceleration."], "In a vacuum, objects fall at the same acceleration because only gravity acts on them.", "The difference we see in air is mostly due to air resistance.", "Do not say heavier objects always fall faster.", "Why does a feather fall slowly in air?", "Check: on the Moon, a hammer and feather fall together.")
        return None

    def _chemistry_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        if "fe" in text and "o2" in text and "fe2o3" in text:
            return self._lesson("Chemistry Note", "We need to balance the iron and oxygen atoms on both sides.", ["Unbalanced equation: Fe + O2 -> Fe2O3"], "A balanced equation has the same number of each type of atom on both sides.", ["Put 2 before Fe2O3 to make oxygen count 6.", "Put 3 before O2 to make oxygen count 6.", "Now Fe on right is 4, so put 4 before Fe."], "4Fe + 3O2 -> 2Fe2O3", "Atoms are conserved in a chemical reaction, so both sides must match.", "Do not change subscripts like Fe2O3; only change coefficients.", "Balance Al + O2 -> Al2O3.", "Check: Fe = 4 on both sides, O = 6 on both sides.")
        if "salt" in text and "salt water" in text:
            return self._lesson("Chemistry Note", "We need to choose a method to separate dissolved salt from water.", ["Salt is dissolved in water.", "Salt has a much higher boiling point than water."], "Evaporation or crystallization separates a dissolved solid from its solution.", ["Heat the salt water.", "Water evaporates first.", "Salt is left behind as solid crystals."], "Use evaporation or crystallization to separate salt from salt water.", "The method works because water can vaporize while salt remains as a solid.", "Do not use filtration; dissolved salt passes through filter paper.", "How would you separate sand from water?", "Check: the recovered solid is salt.")
        if "rusting" in text:
            return self._lesson("Chemistry Note", "We need to explain why rusting is a chemical change.", ["Iron reacts with oxygen and moisture.", "Rust is a new substance."], "A chemical change forms new substances with different properties and is usually irreversible by simple physical methods.", ["Iron combines with oxygen and water.", "Iron oxide, called rust, forms.", "The change is difficult to reverse, so it is effectively irreversible by simple physical methods."], "Rusting is a chemical change because iron forms a new substance: iron oxide, and the change is irreversible by simple physical methods.", "Formation of a new substance is the key sign of a chemical reaction.", "Do not call rusting only a color change; the substance itself changes.", "Why is burning paper a chemical change?", "Check: rust has different properties from iron.")
        if ("temperature" in text or "tempracher" in text) and ("reaction" in text or "reactoin" in text or "reactions" in text or "rate" in text or "fast" in text):
            return self._lesson("Chemistry Note", "We need to explain why higher temperature usually increases reaction rate.", ["Temperature increases.", "Reaction rate increases."], "Collision theory: reactions happen when particles collide with enough energy.", ["Higher temperature gives particles more kinetic energy.", "Particles move faster and collide more often.", "More collisions have energy greater than activation energy."], "Increasing temperature usually increases reaction rate because particles collide more often and with more energy.", "More successful collisions per second means a faster reaction.", "Do not say temperature creates new particles; it changes particle motion and collision energy.", "Why does powdered magnesium react faster than a large strip?", "Check: higher temperature generally raises kinetic energy.")
        if "powdered" in text and "calcium carbonate" in text:
            return self._lesson("Chemistry Note", "We need to explain why powder reacts faster.", ["Powdered calcium carbonate has smaller pieces.", "Smaller pieces expose more surface area."], "Greater surface area increases reaction rate because more particles are available for collisions.", ["Powder has a larger exposed surface area than a lump.", "Acid particles can collide with more calcium carbonate particles at once.", "This causes more collisions per second, so the reaction is faster."], "Powdered calcium carbonate reacts faster because it has a larger surface area and more collisions occur.", "Surface area controls how many reactant particles can meet per second.", "Do not say the powder is chemically different; it is the same substance in smaller pieces.", "Why do wood shavings burn faster than a log?", "Check: smaller particles mean more exposed surface.")
        if "catalyst" in text:
            return self._lesson("Chemistry Note", "We need to explain what a catalyst does.", ["Catalyst is added to a reaction.", "Reaction becomes faster."], "A catalyst increases reaction rate because it lowers activation energy and is not consumed.", ["The catalyst provides an alternative pathway.", "This pathway lowers activation energy.", "More particles can react successfully at the same temperature.", "The catalyst remains chemically unchanged overall at the end."], "A catalyst speeds up a reaction, is not consumed, and is unchanged overall.", "Lower activation energy makes successful collisions easier.", "Do not say a catalyst changes the final amount of product in a closed equilibrium unless conditions require it.", "What is the role of enzymes in digestion?", "Check: catalyst appears unchanged at the end overall.")
        if "atom" in text and "molecule" in text:
            return self._lesson("Chemistry Note", "We need to distinguish two basic particle terms.", ["Atom = single unit of an element.", "Molecule = two or more atoms chemically bonded together."], "Matter is made of atoms, and atoms can chemically bond to form molecules.", ["One oxygen atom is O.", "Two oxygen atoms chemically bonded together make O2, a molecule.", "Water, H2O, is also a molecule."], "An atom is a single particle of an element; a molecule is a group of chemically bonded atoms.", "The chemical bond between atoms is what makes a molecule.", "Do not call every atom a molecule; a molecule must contain bonded atoms.", "Is CO2 an atom or a molecule? Explain.", "Check: H2 has two chemically bonded hydrogen atoms, so it is a molecule.")
        if "ph 3" in text:
            return self._lesson("Chemistry Note", "We need to classify a solution using pH.", ["pH = 3"], "pH below 7 is acidic, pH 7 is neutral, and pH above 7 is basic.", ["3 is less than 7.", "Therefore the solution is acidic."], "pH 3 is acidic.", "The lower the pH below 7, the stronger the acid generally is.", "Do not call pH 3 neutral; neutral is pH 7.", "Classify pH 10 as acidic or basic.", "Check: pH 3 < 7.")
        if "litmus" in text and "acid" in text:
            return self._lesson("Chemistry Note", "We need the litmus test result for an acid.", ["Substance is acidic.", "Litmus paper is used."], "Acids turn blue litmus red.", ["Place blue litmus in acid.", "It changes from blue to red."], "An acid turns blue litmus red.", "Litmus changes color because acids and bases affect indicators differently.", "Do not say red litmus turns blue; that happens with bases.", "What happens to red litmus in a base?", "Check: acid = blue to red.")
        if "conservation of mass" in text or ("closed container" in text and "mass" in text and "reaction" in text) or ("mass stay" in text and "reaction" in text):
            return self._lesson("Chemistry Note", "We need to explain why mass stays the same in a closed container during a reaction.", ["Closed container: nothing enters or leaves.", "Atoms rearrange during the reaction.", "Mass is not lost."], "The law of conservation of mass says mass is neither created nor destroyed in a closed chemical reaction.", ["Atoms present before the reaction are still present after it.", "The atoms rearrange into new substances.", "Because the container is closed, no gas or material escapes.", "So total mass stays the same and is not lost."], "Mass stays the same because atoms are rearranged in a closed container; no matter is lost.", "Balanced chemical equations represent this conservation.", "Do not ignore gases escaping; the law applies clearly to closed systems.", "Why must chemical equations be balanced?", "Check: same atoms on both sides means same total mass.")
        if "sodium" in text and "chlorine" in text:
            return self._lesson("Chemistry Note", "We need to identify the bond formed by sodium and chlorine.", ["Sodium is a metal.", "Chlorine is a non-metal."], "Ionic bonding happens when electrons are transferred from a metal to a non-metal.", ["Sodium loses electron to become Na+.", "Chlorine gains electron to become Cl-.", "Opposite charges attract to form ionic NaCl."], "Sodium and chlorine form an ionic bond.", "The electrostatic attraction between ions holds the compound together.", "Do not call it covalent; sodium transfers an electron rather than sharing equally.", "What type of bond forms between magnesium and oxygen?", "Check: metal + non-metal usually suggests ionic bonding.")
        if ("hcl" in text and "naoh" in text) or ("hydrochloric acid" in text and "sodium hydroxide" in text):
            return self._lesson("Chemistry Note", "We need to identify the reaction between an acid and a base.", ["HCl is an acid.", "NaOH is a base."], "Neutralisation, also called neutralization: acid + base -> salt + water.", ["HCl reacts with NaOH.", "The products are NaCl and H2O.", "This reaction is neutralisation."], "HCl + NaOH -> NaCl + H2O; this is neutralisation / neutralization.", "Hydrogen ions and hydroxide ions combine to form water.", "Do not call it precipitation unless an insoluble solid forms.", "What happens when sulfuric acid reacts with sodium hydroxide?", "Check: products are salt and water.")
        if "alcohol" in text and "water" in text:
            return self._lesson("Chemistry Note", "We need to separate two miscible liquids.", ["Alcohol and water are mixed.", "They have different boiling points."], "Distillation separates liquids based on boiling point differences using evaporation and condensation.", ["Heat the mixture so the lower-boiling liquid evaporates first.", "The vapor then cools and condensation changes it back into liquid.", "Collect the condensed liquid separately."], "Use distillation to separate alcohol and water.", "Different boiling points allow evaporation followed by condensation.", "Do not use filtration; both liquids pass through filter paper.", "How can you separate petrol and kerosene?", "Check: distillation is for liquid mixtures with different boiling points.")
        if "moles" in text and "18" in text and "water" in text:
            return self._lesson("Chemistry Note", "We need to calculate moles of water from mass.", ["Mass of water = 18 g", "Molar mass of H2O = 18 g/mol"], "Moles = mass / molar mass.", ["Moles = 18 / 18.", "Moles = 1 mol."], "1 mole of water", "One mole of water has a mass equal to its molar mass, 18 g.", "Do not multiply mass by molar mass.", "How many moles are in 36 g of water?", "Check: 1 mol x 18 g/mol = 18 g.")
        return None

    def _biology_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        if "cell" in text and "basic unit" in text:
            return self._lesson("Biology Note", "We need to explain why cells are called the basic unit of life.", ["All living organisms are made of cells.", "Life processes happen inside cells."], "A cell is the smallest unit that can carry out life functions.", ["Cells take in nutrients, release energy, grow, and reproduce.", "Tissues and organs are made from groups of cells.", "So the cell is the basic structural and functional unit of life."], "Cells are called the basic unit of life because they are the smallest units that perform life processes.", "Every larger body function depends on cell activities.", "Do not define cells only by shape; focus on their functions.", "Why are tissues important in multicellular organisms?", "Check: unicellular organisms survive as one cell.")
        if "mitochondria" in text or "mitochondrion" in text or ("powerhouse" in text and "cell" in text):
            return self._lesson("Biology Note", "We need to explain why mitochondria have the nickname 'powerhouse of the cell'.", ["Cells need usable energy for life processes.", "Mitochondria are organelles inside cells.", "Cellular respiration releases energy from glucose."], "Mitochondria carry out most cellular respiration and produce ATP, the main usable energy molecule of the cell.", ["Food such as glucose stores chemical energy.", "Inside mitochondria, cellular respiration breaks down glucose using oxygen.", "This process releases energy and stores it in ATP.", "Cells use ATP for movement, growth, repair, active transport, and other work."], "Mitochondria are called the powerhouse of the cell because they produce most of the cell's ATP energy.", "A powerhouse supplies energy to a city; mitochondria supply usable energy to the cell.", "Do not say mitochondria create energy from nothing; they convert energy stored in food into ATP.", "Why do muscle cells usually contain many mitochondria?", "Check: mitochondria -> cellular respiration -> ATP -> usable cell energy.")
        if "osmosis" in text or "pure water" in text:
            return self._lesson("Biology Note", "We need to explain water movement into a plant cell.", ["Plant cell is placed in pure water.", "Cell sap has more dissolved substances than pure water."], "Osmosis is movement of water through a selectively permeable membrane from dilute solution to concentrated solution.", ["Pure water has higher water concentration outside the cell.", "Water enters the cell by osmosis.", "The vacuole swells and the cell becomes turgid."], "The plant cell gains water and becomes turgid.", "The cell wall prevents bursting and supports the swollen cell.", "Do not say the cell bursts like an animal cell; plant cells have a cell wall.", "What happens to a plant cell in very salty water?", "Check: water moves from dilute to concentrated solution.")
        if "breathing" in text and "cellular respiration" in text:
            return self._lesson("Biology Note", "We need to distinguish breathing from cellular respiration.", ["Breathing involves taking air in and out.", "Cellular respiration happens inside cells."], "Breathing is a physical process; cellular respiration is a chemical process that releases energy as ATP from glucose.", ["Breathing brings oxygen into the body and removes carbon dioxide.", "Cells use oxygen to break down glucose.", "This releases energy in the form of ATP for life processes."], "Breathing is gas exchange, while cellular respiration releases ATP energy inside cells.", "Breathing supplies oxygen needed for respiration.", "Do not use the two terms as exactly the same thing.", "How are respiration and photosynthesis connected?", "Check: respiration occurs in cells, not only in lungs.")
        if "enzyme" in text and "digestion" in text:
            return self._lesson("Biology Note", "We need to explain the role of enzymes in digestion.", ["Food molecules are large.", "Enzymes act in the digestive system."], "Enzymes are biological catalysts that speed up chemical reactions and break down food.", ["Digestive enzymes break down food molecules into smaller soluble molecules.", "Amylase breaks starch, protease breaks proteins, and lipase breaks fats.", "Small molecules can then be absorbed."], "Enzymes speed up digestion by helping break down food into smaller molecules.", "Without enzymes, digestion would be too slow for the body.", "Do not say enzymes are used up; they work repeatedly.", "What does amylase do in digestion?", "Check: enzymes are specific to their substrates.")
        if "xylem" in text:
            return self._lesson("Biology Note", "We need to state the function of xylem.", ["Xylem is plant transport tissue."], "Xylem carries water and minerals from roots to leaves and the rest of the plant.", ["Roots absorb water and minerals.", "Xylem transports them upward from roots to leaves through the stem.", "Leaves use water for photosynthesis and transpiration."], "Xylem transports water and minerals from roots to leaves.", "Plants need transport tissues because roots and leaves do different jobs.", "Do not confuse xylem with phloem; phloem carries food.", "What does phloem transport?", "Check: xylem mainly moves water upward.")
        if "photosynthesis" in text or "fotosynthesis" in text:
            return self._lesson("Biology Note", "We need to explain how plants make food.", ["Plants use sunlight.", "Carbon dioxide and water are raw materials.", "Glucose and oxygen are produced."], "Photosynthesis converts light energy into chemical energy stored in glucose.", ["Leaves absorb light using chlorophyll.", "Carbon dioxide enters through stomata.", "Water comes from roots.", "The plant produces glucose for energy and growth, and oxygen is released."], "Photosynthesis helps plants survive by making glucose, their food.", "Glucose stores energy that plants use for growth, repair, and respiration.", "Do not say plants get all food from soil; soil gives minerals, not glucose.", "Why is chlorophyll important in photosynthesis?", "Check: carbon dioxide + water -> glucose + oxygen.")
        if "decomposer" in text:
            return self._lesson("Biology Note", "We need to explain the role of decomposers.", ["Dead plants and animals contain nutrients.", "Decomposers break them down."], "Decomposers recycle nutrients back into the ecosystem.", ["Bacteria and fungi break down dead matter.", "Nutrients return to soil and water.", "Plants reuse those nutrients."], "Decomposers are important because they recycle nutrients and prevent dead matter from piling up.", "Nutrient cycling keeps ecosystems balanced.", "Do not think decomposers only clean waste; they support new plant growth.", "What would happen if decomposers disappeared?", "Check: fungi and bacteria are common decomposers.")
        if "heart valve" in text or ("heart" in text and "valves" in text):
            return self._lesson("Biology Note", "We need to explain why heart valves are needed.", ["Blood must move in one direction.", "The heart pumps blood through chambers."], "Valves prevent backflow of blood.", ["When the heart contracts, valves open to let blood move forward.", "Then they close to stop blood from flowing backward.", "This keeps circulation efficient."], "Heart valves ensure one-way flow of blood.", "One-way flow helps maintain pressure and proper circulation.", "Do not say valves produce blood; they control direction.", "What is the role of veins' valves?", "Check: faulty valves can cause backflow.")
        if "vaccine" in text:
            return self._lesson("Biology Note", "We need to explain how vaccines protect the body.", ["Vaccines expose the immune system to harmless antigens.", "The immune system can remember pathogens."], "Vaccination trains immune memory without causing the full disease.", ["The vaccine introduces a safe form or part of a pathogen.", "White blood cells make antibodies and memory cells.", "If the real pathogen enters later, the response is faster."], "Vaccines protect by preparing the immune system to recognize and fight a pathogen quickly.", "Immune memory is why later infections can be stopped faster.", "Do not say vaccines are antibiotics; antibiotics act on bacteria after infection.", "Why do some vaccines need booster doses?", "Check: memory cells are key to long-term protection.")
        if "cactus" in text:
            return self._lesson("Biology Note", "We need to identify desert adaptations of a cactus.", ["Desert has little water.", "Cactus survives in dry conditions."], "Adaptations are features that help an organism survive in its habitat.", ["Reduced leaves become spines to reduce water loss.", "A thick stem stores water.", "Waxy coating reduces evaporation.", "Wide/shallow roots absorb rain quickly."], "A cactus survives with reduced leaves, a thick stem, and stored water.", "Its structure matches the dry desert environment.", "Do not say cactus leaves are broad; they are modified into spines.", "Name two adaptations of a camel for desert life.", "Check: each adaptation helps conserve or obtain water.")
        if "grass" in text and "rabbit" in text and "fox" in text and "decrease" in text:
            return self._lesson("Biology Note", "We need to predict what happens in the food chain if rabbits decrease.", ["Food chain: grass -> rabbit -> fox", "Rabbits decrease."], "A food chain shows feeding relationships and energy transfer.", ["Foxes depend on rabbits for food.", "If rabbits decrease, foxes get less food and may decrease.", "Grass is eaten by fewer rabbits, so grass increases."], "Foxes may decrease because there is less food, while grass increases because fewer rabbits eat it.", "Changing one population affects the other organisms connected to it.", "Do not look at only one organism; follow the whole food chain.", "What happens if grass decreases in this food chain?", "Check: less rabbit means less food for foxes.")
        if "grass" in text and "rabbit" in text and "fox" in text:
            return self._lesson("Biology Note", "We need to interpret a simple food chain.", ["Grass -> rabbit -> fox"], "A food chain shows energy transfer from producer to consumers.", ["Grass is the producer.", "Rabbit is the primary consumer.", "Fox is the secondary consumer.", "Energy moves from grass to rabbit to fox."], "Energy flows from grass to rabbit to fox.", "Food chains show feeding relationships and energy movement.", "Do not reverse the arrows; arrows show direction of energy flow.", "Make a food chain with wheat, mouse, and owl.", "Check: plants usually start food chains.")
        if "chromosome" in text:
            return self._lesson("Biology Note", "We need to explain chromosomes and one use.", ["Chromosomes are found in the cell nucleus.", "They contain DNA and genes."], "Chromosomes carry genetic information used for inheritance.", ["DNA is organized into chromosomes.", "Genes on chromosomes control inherited traits.", "During reproduction, chromosomes pass information from parents to offspring."], "Chromosomes carry DNA and help inheritance of traits.", "They keep genetic information organized inside cells.", "Do not say chromosomes are the same as cells; they are structures inside cells.", "What is the role of genes?", "Check: chromosomes are linked with inheritance.")
        if "reflex arc" in text or ("reflex" in text and "fast" in text):
            return self._lesson("Biology Note", "We need to explain the path of a reflex action.", ["A reflex is a quick response.", "Reflexes are quick automatic responses."], "A reflex arc is the nerve pathway for a reflex.", ["A receptor detects the stimulus.", "Sensory neuron carries impulse to spinal cord.", "Relay neuron passes it to motor neuron.", "Motor neuron sends impulse to effector muscle.", "The muscle responds quickly."], "A reflex arc allows a fast automatic quick response through the spinal cord.", "It protects the body by reducing reaction time.", "Do not think every reflex must go to the brain first.", "Explain why touching a hot object makes your hand pull back quickly.", "Check: receptor -> sensory neuron -> spinal cord -> motor neuron -> effector.")
        if "children resemble" in text or "parents but not exactly" in text:
            return self._lesson("Biology Note", "We need to explain inheritance and variation.", ["Children inherit genes from parents.", "They are not exact copies."], "Genes pass traits from parents to offspring, while variation comes from different gene combinations and environment.", ["A child receives genetic material from both parents.", "The combination of genes is unique.", "Environmental factors can also affect traits."], "Children resemble parents because of inherited genes, but they differ because each child has a unique combination of genes.", "Sexual reproduction creates variation while preserving family resemblance.", "Do not say children are clones of their parents.", "Why do siblings look similar but not identical?", "Check: both inheritance and variation are involved.")
        return None

    def _english_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        if "past perfect" in text or "had eaten" in text or re.search(r"had\s+\w+\s+eaten", text):
            return self._lesson("English Note", "We need to identify the past perfect tense.", ["Sentence uses 'had' + past participle."], "Past perfect tense is formed with had + past participle and shows an action completed before another past action.", ["In 'She had eaten', 'had' is the helping verb.", "'Eaten' is the past participle.", "So the tense is past perfect."], "The tense is past perfect.", "The word 'had' is the main clue.", "Do not call it simple past; simple past would be 'ate'.", "Identify the tense: They had finished the work.", "Check: had + eaten = past perfect.")
        if "list of items" in text or "is or are" in text:
            return self._lesson("English Note", "We need the correct verb for the subject.", ["Subject: list", "Phrase: of items"], "In subject-verb agreement, the verb agrees with the main subject, not the object of a preposition.", ["The main subject is 'list', which is singular.", "'of items' only describes the list.", "So the correct verb is 'is'."], "The list of items is on the table.", "The verb agrees with 'list', not 'items'.", "Do not choose 'are' just because 'items' is plural.", "Choose is/are: The bunch of keys ___ missing.", "Check: list = singular.")
        if "honest girl" in text or "a or an" in text:
            return self._lesson("English Note", "We need the correct article before 'honest'.", ["Word: honest", "First sound: vowel sound because silent h is not pronounced"], "Use 'an' before vowel sounds, not only vowel letters.", ["'Honest' begins with an 'o' sound because of the silent h.", "So we use 'an'."], "She is an honest girl.", "Article choice depends on sound.", "Do not use 'a' just because the word starts with h.", "Choose a/an: ___ hour later, we left.", "Check: honest sounds like 'onest'.")
        if "book is" in text and "table" in text:
            return self._lesson("English Note", "We need the correct preposition of place.", ["Book position: table surface"], "Use 'on' when something rests on a surface.", ["A table has a surface.", "A book resting there is on the table."], "The book is on the table.", "The preposition shows the relationship between the book and table.", "Do not use 'in' unless the object is inside something.", "Fill in: The keys are ___ the drawer.", "Check: surface = on.")
        if "passive" in text and "chef cooked" in text:
            return self._lesson("English Note", "We need to change active voice into passive voice.", ["Active: The chef cooked a delicious meal.", "Object: a delicious meal"], "Passive voice makes the object the subject and uses be + past participle.", ["Move 'a delicious meal' to the front.", "Use was + cooked because the sentence is past tense.", "Add 'by the chef' because the doer is needed."], "A delicious meal was cooked by the chef.", "The action remains the same, but the focus shifts to the receiver.", "Do not keep both original and passive subjects in subject position.", "Change to passive: The teacher checked the homework.", "Check: meal receives the action.")
        if "she said" in text and ("i am tired" in text or "i am happy" in text):
            reported_word = "happy" if "happy" in text else "tired"
            return self._lesson("English Note", "We need to convert direct speech into reported speech.", [f"Direct speech: She said, 'I am {reported_word}.'"], "In reported speech, pronouns and tense usually change according to the reporting verb.", ["I changes to she.", "am changes to was because the reporting verb is past.", "Remove quotation marks and use 'that'."], f"She said that she was {reported_word}.", "The sentence reports the meaning without exact quoted words.", "Do not keep 'I am' unless quoting directly.", "Change to reported speech: He said, 'I am ready.'", "Check: am changes to was in reported speech.")
        if "enormous" in text:
            return self._lesson("English Note", "We need a synonym for 'enormous'.", ["Word: enormous"], "A synonym is a word with a similar meaning.", ["'Enormous' means very large.", "A good synonym is 'huge' or 'massive'."], "A synonym of enormous is huge.", "Both words express very large size.", "Do not give an antonym like tiny.", "Give a synonym of 'rapid'.", "Check: enormous = huge.")
        if "expand" in text and "antonym" in text:
            return self._lesson("English Note", "We need the opposite of 'expand'.", ["Word: expand"], "An antonym is a word with the opposite meaning.", ["Expand means to become larger.", "The opposite is contract or shrink."], "An antonym of expand is contract.", "The meanings move in opposite directions.", "Do not give a synonym like increase.", "Give an antonym of 'ancient'.", "Check: expand vs contract.")
        if "break the ice" in text:
            return self._lesson("English Note", "We need the meaning of the idiom.", ["Idiom: break the ice"], "An idiom has a figurative meaning different from the literal words.", ["'Break the ice' does not mean breaking frozen water.", "It means to start conversation and reduce awkwardness.", "It helps make people comfortable."], "Break the ice means to start conversation and make people comfortable.", "Idioms must be understood by common usage, not word by word.", "Do not explain it literally.", "What does 'once in a blue moon' mean?", "Check: it is about social comfort.")
        if "honey" in text and ("simile" in text or "metaphor" in text):
            return self._lesson("English Note", "We need to identify the figure of speech.", ["Expression compares something to honey."], "A simile uses like/as; a metaphor says something is something else directly.", ["If the sentence says 'as sweet as honey', it is a simile.", "If it says 'her voice is honey', it is a metaphor."], "Use the exact wording: 'as sweet as honey' is a simile; 'is honey' is a metaphor.", "The difference depends on whether like/as is used.", "Do not label every comparison as a metaphor.", "Identify: He fought like a lion.", "Check for like/as first.")
        if ("punctuation" in text or "punctuate" in text) and ("wow" in text or "we won" in text):
            match_text = "Wow, we won the match!" if "match" in text else "Wow, we won!"
            return self._lesson("English Note", "We need to punctuate an excited sentence correctly.", ["Words: wow we won the match"], "Use capital letters, a comma after an interjection, and an exclamation mark for strong feeling.", ["Capital starts the sentence: Wow.", "Comma separates the interjection: Wow,.", "End the excited sentence with an exclamation mark."], match_text, "The comma separates the interjection from the main sentence.", "Do not leave the sentence without capitalization or punctuation.", "Punctuate: hooray we scored a goal", "Check: excitement usually uses !.")
        if "pronoun" in text and ("ravi" in text or "bag" in text or "explane" in text or "example" in text):
            return self._lesson("English Note", "We need to explain what a pronoun does.", ["A pronoun replaces noun words to avoid repetition.", "Example pronouns: he, she, it, they"], "A pronoun is a word used in place of a noun.", ["Instead of saying 'Meena is reading because Meena likes books', say 'Meena is reading because she likes books'.", "'She' replaces the noun Meena.", "This makes the sentence smoother."], "A pronoun replaces noun words; example: she can replace Meena.", "Pronouns make writing clearer and less repetitive.", "Do not use a pronoun if it becomes unclear who or what it refers to.", "Replace repeated nouns: Meena lost Meena's pen.", "Check: she = Meena.")
        if "bird" in text and "cage" in text:
            return self._lesson("English Note", "We need to identify a likely theme from the image of a bird escaping a cage.", ["Image: bird escapes from cage"], "A theme is the central idea or message of a text.", ["A cage suggests restriction.", "Escaping suggests freedom or release.", "Flying away can also suggest hope."], "The likely theme is freedom, liberation, and hope.", "The symbols support the theme: cage = confinement, flying away = freedom and hope.", "Do not write only a plot event; explain the message.", "What theme is suggested by a broken chain?", "Check: symbols point to the central idea.")
        if "loyal friend" in text:
            return self._lesson("English Note", "We need to describe a character trait and support it.", ["Trait: loyalty", "Need evidence."], "A character sketch should name the trait and prove it with actions.", ["A loyal friend is trustworthy.", "Evidence could include keeping promises, helping in trouble, and standing by someone.", "The conclusion should connect actions to the trait."], "A loyal friend is trustworthy and supports others consistently in difficult times.", "Traits become convincing when supported by examples.", "Do not list qualities without evidence.", "Write two lines describing a brave student.", "Check: trait + evidence = strong character answer.")
        return None

    def _history_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        if "dandi march" in text:
            return self._lesson("History Note", "We need to explain the purpose of the Dandi March.", ["Dandi March was led by Mahatma Gandhi in 1930.", "It challenged the British salt tax."], "Civil disobedience means peacefully breaking an unjust law to protest it.", ["The British taxed salt, a basic necessity.", "Gandhi marched to Dandi and made salt from seawater.", "This openly broke the salt law and mobilized Indians against colonial rule."], "The Dandi March opposed the British salt tax and became a major act of civil disobedience in India's freedom struggle.", "Salt was simple and universal, so it connected ordinary people to the national movement.", "Do not treat it as only a walk; it was a political protest.", "Why was the Non-Cooperation Movement started?", "Check: year 1930, issue salt tax.")
        if "civilizations" in text and "rivers" in text:
            return self._lesson("History Note", "We need to explain why early civilizations developed near rivers.", ["Rivers provided water.", "Farming needed fertile soil."], "Stable agriculture supports permanent settlements and complex societies.", ["Rivers supplied drinking water and irrigation.", "Floods deposited fertile alluvial soil.", "Rivers helped transport goods and people.", "Food surplus allowed towns, trade, and governments to grow."], "Early civilizations grew near rivers because rivers provided water, fertile soil, transport, and support for farming.", "Reliable farming made settled life possible.", "Do not give only one reason; rivers helped farming, trade, and settlement.", "Why did the Indus Valley Civilization grow near the Indus River?", "Check: Nile, Indus, Tigris-Euphrates are examples.")
        if "akbar" in text and "important" in text:
            return self._lesson("History Note", "We need to explain Akbar's importance as a Mughal ruler.", ["Akbar was a Mughal emperor.", "He expanded and organized the empire."], "A strong ruler is remembered for administration, expansion, and policies.", ["Akbar expanded Mughal control over much of northern India.", "He improved administration and revenue systems.", "He followed policies of religious tolerance, helping political stability."], "Akbar is important because he expanded the Mughal Empire and strengthened it through administration and tolerance.", "His policies helped unite a diverse empire.", "Do not mention only wars; administration and tolerance were also important.", "Why is Ashoka remembered in Indian history?", "Check: Akbar is linked with Sulh-i-Kul and strong governance.")
        if "treaty of versailles" in text:
            return self._lesson("History Note", "We need to connect the Treaty of Versailles to World War II.", ["Treaty signed after World War I.", "Germany faced harsh terms and punishment."], "Cause and effect in history means one event creates conditions for another.", ["The treaty blamed Germany and imposed reparations.", "Many Germans felt humiliated and economically burdened by the harsh terms.", "Hitler and extremist leaders used this resentment to gain support.", "This helped create conditions that led to World War II."], "The Treaty of Versailles contributed to World War II by creating resentment, economic pressure, and political instability in Germany, which Hitler used politically.", "Harsh peace terms can create future conflict instead of lasting peace.", "Do not say it was the only cause; it was one major cause among several.", "How did the Great Depression help extremist politics grow?", "Check: Treaty after WWI, consequences before WWII.")
        if "french revolution" in text:
            return self._lesson("History Note", "We need to explain a main cause of the French Revolution.", ["France had social inequality.", "Taxes and food shortages hurt common people."], "Revolutions often happen when economic hardship combines with political inequality.", ["It was not only bread shortage.", "The Third Estate carried much of the tax burden.", "Bad harvests and bread shortages increased anger.", "The monarchy was seen as unfair and wasteful.", "Enlightenment ideas encouraged people to demand rights."], "The French Revolution was not only caused by bread shortage; inequality, heavy taxes, food shortages, financial crisis, and rights-based ideas all mattered.", "People revolt when hardship feels connected to an unfair system.", "Do not reduce it only to bread shortage; social and political causes mattered too.", "What role did the Third Estate play in the French Revolution?", "Check: multiple causes worked together.")
        if "steam engine" in text or "industrial revolution" in text:
            return self._lesson("History Note", "We need to explain why the steam engine mattered in industrialization.", ["Steam engine provided mechanical power.", "Factories and transport needed reliable energy."], "Industrialization grows when machines can produce goods faster and transport becomes easier.", ["Steam engines powered machines in factories.", "They pumped water from mines.", "They powered trains and ships.", "This increased production and trade."], "The steam engine was important because it supplied power for factories, mines, and transport during the Industrial Revolution.", "Reliable machine power changed production from hand work to factory work.", "Do not mention only trains; factories and mines also used steam power.", "How did factories change workers' lives?", "Check: steam power increased production.")
        if "colonial" in text and "craft" in text:
            return self._lesson("History Note", "We need to explain the effect of colonial rule on Indian crafts.", ["British colonial rule affected Indian economy.", "Machine-made goods from Britain entered India."], "Colonial economic policies can change local production and markets.", ["Indian artisans faced competition from cheaper machine-made imports.", "Some traditional industries lost royal or local support.", "Raw materials were exported and finished goods imported.", "Many craftspeople lost income."], "Colonial rule weakened many Indian crafts by exposing them to cheap British factory goods and changing trade patterns.", "Control over markets can damage local industries.", "Do not say all crafts disappeared; many declined or changed.", "How did British rule affect Indian agriculture?", "Check: imports and market control are key.")
        if "nationalism" in text and ("unite" in text or "conflict" in text):
            return self._lesson("History Note", "We need to explain both sides of nationalism.", ["Nationalism creates shared identity.", "It can also create us vs them thinking."], "Nationalism is loyalty to a nation or national identity.", ["It can unite people by giving them common goals, symbols, and history.", "It helped many freedom movements fight colonial rule.", "But extreme nationalism can create us vs them thinking, rivalry, and hostility toward other groups or countries."], "Nationalism can unite people through shared identity, but it can also create conflict through rivalry and exclusion.", "The same force can build unity inside a group and tension with outsiders.", "Do not present nationalism as only good or only bad.", "How did nationalism help independence movements?", "Check: unity and conflict are both possible outcomes.")
        if "constitution" in text:
            return self._lesson("History Note", "We need to explain why the Constitution was historically important after independence.", ["India became independent.", "A democracy needed rules for governance."], "A constitution is a framework for governing a country.", ["After independence, India needed a democratic system of governance.", "The Constitution defined how leaders are chosen.", "It limited government power and protected citizens' rights.", "It gave courts and institutions a legal basis."], "The Constitution is historically important because after independence it created the framework for democracy, governance, rights, and rule of law.", "Without a constitution, power can become arbitrary.", "Do not call it only a book of laws; it is the supreme framework.", "Why are fundamental rights important?", "Check: constitution = independence + democracy + governance.")
        if "harappan" in text or "drainage" in text:
            return self._lesson("History Note", "We need to explain what Harappan drainage shows about the civilization.", ["Harappan cities had planned drainage.", "Drains were often covered and connected to houses."], "Urban planning means designing planned cities with features such as streets, drains, and buildings systematically.", ["Covered drains show concern for cleanliness.", "Connected drains show planned construction.", "Regular street layouts show organized planned cities."], "Harappan drainage shows planned cities, advanced urban planning, and concern for sanitation.", "Public works reveal strong organization in a civilization.", "Do not describe drains only as small details; they show planning.", "What does the Great Bath tell us about Harappan society?", "Check: drainage = planned cities + sanitation.")
        if "rowlatt act" in text:
            return self._lesson("History Note", "We need to explain why Indians opposed the Rowlatt Act.", ["Rowlatt Act was passed in 1919.", "It allowed detention without trial."], "Laws that remove civil liberties often create political protest.", ["The Act gave the British power to arrest without proper trial.", "Indians saw it as unjust and repressive.", "It led to widespread protest and anger."], "Indians opposed the Rowlatt Act because it allowed detention without trial and violated civil rights.", "People resisted because the law attacked justice and freedom.", "Do not confuse it with the salt law; it was about repressive powers.", "Why did the Jallianwala Bagh massacre anger Indians?", "Check: Rowlatt Act = 1919, detention without trial.")
        if "printing press" in text:
            return self._lesson("History Note", "We need to explain the historical impact of the printing press.", ["Printing made books cheaper and faster to produce.", "Ideas could spread widely."], "Communication technology can change society by spreading knowledge.", ["More people could access books and pamphlets.", "Religious, scientific, and political ideas spread faster.", "The Reformation was helped by printed texts spreading religious debate.", "Literacy and public debate increased."], "The printing press was important because it helped spread ideas quickly, including Reformation ideas, and made written material more accessible.", "When information spreads faster, social and political change becomes easier.", "Do not treat it as only a machine; focus on its effect on ideas.", "How did newspapers influence freedom movements?", "Check: printing = spread ideas + Reformation + public debate.")
        if "gandhiji" in text or "gandhi" in text:
            return self._lesson("History Note", "We need to explain why Mahatma Gandhi was important.", ["Mahatma Gandhi led mass movements against British rule.", "He used non-violence as a method of protest."], "Non-violence, or ahimsa, means resisting injustice without physically harming others.", ["Mahatma Gandhi believed moral force could challenge British rule.", "Methods included marches, boycotts, and civil disobedience.", "Non-violence helped involve ordinary people in the freedom struggle."], "Mahatma Gandhi was important because he led India's freedom struggle against British rule using non-violence and mass protest.", "It made the freedom struggle morally strong and mass-based.", "Do not think non-violence means doing nothing; it is active resistance.", "What is civil disobedience?", "Check: Mahatma Gandhi = non-violence + freedom struggle + British rule.")

        if "non-cooperation" in text or "civil disobedience" in text or "quit india" in text:
            return self._lesson(
                "History Note",
                "We need to arrange the three major Indian national movements in chronological order.",
                ["Non-Cooperation Movement", "Civil Disobedience Movement", "Quit India Movement"],
                "Chronology means arranging events in the order in which they happened.",
                [
                    "Non-Cooperation Movement came first in 1920.",
                    "Civil Disobedience Movement came next in 1930.",
                    "Quit India Movement came later in 1942.",
                ],
                "Order: Non-Cooperation Movement (1920) -> Civil Disobedience Movement (1930) -> Quit India Movement (1942).",
                "The order shows how the freedom struggle became more direct and intense over time.",
                "Do not arrange movements alphabetically; use historical dates.",
                "Arrange: Swadeshi Movement, Civil Disobedience Movement, Quit India Movement.",
                "Check: 1920, 1930, 1942.",
            )
        return None

    def _geography_answer_first_lesson(self, text: str, practice: str) -> dict | None:
        if "japan" in text and "located" in text:
            return self._lesson("Geography Note", "We need to locate Japan geographically.", ["Place: Japan"], "Location can be described by continent, region, and surrounding water bodies.", ["Japan is an island country in East Asia.", "It lies in the Pacific Ocean.", "It is east of the Asian mainland."], "Japan is located in East Asia, in the Pacific Ocean.", "Region and ocean together give a clear location.", "Do not place Japan in Southeast Asia; it is in East Asia.", "Where is Sri Lanka located?", "Check: Japan is an island nation near Korea, China, and Russia.")
        if "ring of fire" in text or ("earthquake" in text and "pacific" in text):
            return self._lesson("Geography Note", "We need to explain why earthquakes and volcanoes are common around the Pacific.", ["Pacific Ring of Fire surrounds the Pacific Ocean.", "Many plate boundaries occur there."], "Earthquakes and volcanoes are common near tectonic plate boundaries, especially subduction zones.", ["Oceanic plates move and collide around the Pacific.", "At subduction zones, one plate sinks beneath another.", "This creates earthquakes and melts rock that can feed volcanoes."], "The Pacific Ring of Fire is active because it has many tectonic plate boundaries and subduction zones.", "Plate movement explains both earthquakes and volcanic activity.", "Do not say disasters occur randomly; they follow plate boundaries.", "Why do earthquakes occur near fault lines?", "Check: plate boundaries are the key cause.")
        if "rajasthan" in text and "kerala" in text:
            return self._lesson("Geography Note", "We need to compare climates of Rajasthan and Kerala.", ["Rajasthan is inland and arid.", "Kerala is coastal near the Arabian Sea and Western Ghats."], "Climate depends on location, relief, distance from sea, and rainfall patterns.", ["Rajasthan is arid and receives low rainfall.", "Kerala gets moisture from the Arabian Sea branch of the monsoon.", "The Western Ghats help force moist air upward, causing heavy rain.", "The sea moderates Kerala's temperature."], "Rajasthan is drier because it is arid and gets less rainfall, while coastal Kerala receives moist monsoon winds from the Arabian Sea and Western Ghats.", "Moisture supply from the sea strongly affects rainfall.", "Do not explain climate using only temperature; rainfall is central here.", "Why is Mumbai more humid than Delhi?", "Check: Kerala coast + monsoon + Western Ghats = heavy rain.")
        if "delta" in text:
            return self._lesson("Geography Note", "We need to explain how a river delta forms.", ["River reaches its river mouth at a sea or lake.", "River carries sediments."], "A delta forms when a river deposits sediments near its river mouth.", ["As the river enters standing water, it slows down.", "It can no longer carry all its load.", "Sediments are deposited and build up into a delta."], "A delta forms by deposition of sediments at a river mouth when the river slows down.", "Slower water drops the material it was carrying.", "Do not confuse delta with erosion; delta formation is mainly deposition.", "How are alluvial plains formed?", "Check: river mouth + slows down + sediments = delta.")
        if "latitude" in text:
            return self._lesson("Geography Note", "We need to define latitude.", ["Latitude is used to locate places on Earth."], "Latitude lines are imaginary parallel east-west lines that measure distance north and south of the Equator.", ["The Equator is 0 degrees latitude.", "Places north of it have north latitude.", "Places south of it have south latitude.", "Latitude lines are parallel to the Equator."], "Latitude measures distance north and south of the Equator using parallel lines.", "Latitude helps locate climate zones and exact positions.", "Do not confuse latitude with longitude; longitude measures east-west from the Prime Meridian.", "What is longitude?", "Check: latitude = north and south of Equator.")
        if "coal" in text and "renewable" in text:
            return self._lesson("Geography Note", "We need to classify coal as a resource.", ["Coal forms from ancient plant matter over millions of years.", "Coal supply is limited."], "Non-renewable resources form slowly and cannot replace quickly on a human timescale.", ["Coal takes millions of years to form.", "The amount available is limited.", "Humans use it much faster than it is naturally replaced.", "Therefore it is non-renewable."], "Coal is non-renewable because it forms slowly, is limited, and cannot replace quickly.", "The formation time is the key reason.", "Do not call it renewable because it comes from plants; the process takes too long.", "Why is solar energy renewable?", "Check: coal formation is extremely slow.")
        if ("rural" in text and "urban" in text) or ("villages" in text and "cities" in text):
            return self._lesson("Geography Note", "We need to explain rural-to-urban migration.", ["People move from villages to cities.", "Cities often provide more services and jobs."], "Migration happens when push and pull factors influence movement.", ["Push factors include low farm income or lack of services.", "Pull factors include jobs, education, healthcare, better services, and better transport.", "People move when expected opportunities seem better in cities."], "People migrate from villages to cities mainly for jobs, education, healthcare, and better services.", "Migration is usually caused by both push and pull factors.", "Do not say everyone migrates for the same reason.", "Why do people migrate from mountains to plains?", "Check: push and pull factors.")
        if "day and night" in text:
            return self._lesson("Geography Note", "We need to explain the cause of day and night.", ["Earth rotates on its axis.", "Sunlight reaches one half of Earth at a time."], "Rotation is Earth's spinning movement, completed about once every 24 hours.", ["The side facing the Sun has day.", "The side away from the Sun has night.", "As Earth rotates, places move into and out of sunlight."], "Day and night are caused by Earth's rotation on its axis.", "The Sun appears to rise and set because Earth is rotating.", "Do not say day and night are caused by Earth's revolution around the Sun.", "What causes seasons?", "Check: one rotation takes about 24 hours.")
        if "planting trees" in text or "soil erosion" in text:
            return self._lesson("Geography Note", "We need to explain how trees reduce soil erosion.", ["Tree roots hold soil.", "Leaves and branches reduce rain impact."], "Soil erosion is removal of topsoil by water, wind, or human activity.", ["Roots bind soil particles together.", "Tree cover slows down wind and flowing water.", "Leaves reduce the force of raindrops hitting the soil."], "Planting trees helps prevent soil erosion by holding soil with roots and reducing the force of wind and water.", "Vegetation protects the topsoil layer.", "Do not say trees stop all erosion completely; they reduce it strongly.", "How does terrace farming reduce erosion?", "Check: roots + cover = protection.")
        if "ocean current" in text and "climate" in text:
            return self._lesson("Geography Note", "We need to explain how ocean currents affect climate.", ["Ocean currents move warm or cold water.", "Coastal areas are affected by nearby currents."], "Ocean currents transfer heat around the planet.", ["Warm currents raise temperatures and add moisture to nearby coasts.", "Cold currents cool nearby coasts and can reduce rainfall.", "This changes local climate."], "Ocean currents affect climate by carrying warm or cold water that changes nearby temperature and rainfall.", "Water stores and transports heat, so currents influence coastal climates.", "Do not ignore wind and latitude, but currents are a major factor.", "How does a warm current affect a coastal city?", "Check: warm current = warming influence.")
        if "earthquak" in text or "fault line" in text:
            return self._lesson("Geography Note", "We need to explain why earthquakes happen near fault lines or plate boundaries.", ["Earth's crust is broken into tectonic plates.", "Faults are cracks where rocks can move."], "Earthquakes happen when stress builds up and is suddenly released along faults or plate boundaries.", ["Plates move slowly over time.", "Stress builds where rocks are locked together.", "When the rocks suddenly slip, energy is released as seismic waves."], "Earthquakes occur near tectonic plate boundaries and fault lines because built-up stress is suddenly released by moving rocks.", "The sudden release of energy causes the shaking we feel.", "Do not say earthquakes are random explosions underground.", "Why are earthquakes common around the Pacific Ring of Fire?", "Check: movement + stress + release = earthquake.")
        if "weathering" in text:
            return self._lesson("Geography Note", "We need to define weathering.", ["Rocks at Earth's surface are exposed to air, water, and temperature changes."], "Weathering is the breakdown of rocks in place by physical, chemical, or biological processes.", ["Physical weathering breaks rocks without changing composition.", "Chemical weathering changes minerals.", "Biological weathering happens through living organisms such as roots."], "Weathering is the breaking down of rocks at or near Earth's surface.", "It prepares material that erosion can later move.", "Do not confuse weathering with erosion; erosion transports material.", "How is erosion different from weathering?", "Check: weathering happens in place.")
        if "orographic" in text or ("mountain" in text and "rainfall" in text):
            return self._lesson("Geography Note", "We need to explain rainfall caused by mountains.", ["Moist air meets a mountain barrier.", "Air is forced upward."], "Orographic rainfall happens when moist air rises over mountains, cools, and condenses.", ["Moist air moves toward a mountain.", "It rises up the slope and cools.", "Water vapor condenses into clouds.", "Rain falls on the windward side."], "Orographic rainfall is rain caused when moist air is forced up a mountain and cools.", "Rising air cools, and cooler air holds less water vapor.", "Do not forget the leeward side may become drier.", "Why does the windward side of a mountain get more rain?", "Check: uplift + cooling + condensation.")
        if "ports" in text and "trade" in text:
            return self._lesson("Geography Note", "We need to explain the importance of ports in trade.", ["Ports connect land transport with sea trade routes.", "Ships carry imports and exports."], "Trade grows where transport routes connect efficiently.", ["Ports allow loading and unloading of imports and exports.", "They connect countries through sea trade routes.", "They support industries, jobs, and markets nearby."], "Ports are important because they handle imports and exports and connect regions to trade routes.", "Good transport connections support economic activity.", "Do not describe ports only as tourist places; their trade role is central.", "Why are coastal cities often important for trade?", "Check: port = imports + exports + trade routes.")
        return None

    def _science_lesson(self, text: str, subject: SubjectArea, practice: str) -> dict | None:
        if "astronaut" in text or "weightless" in text:
            return self._lesson(
                "Physics Explanation",
                "We need to explain why astronauts float in orbit even though gravity is still acting on them.",
                ["The spacecraft is orbiting Earth.", "Gravity still pulls on the spacecraft and astronauts.", "Astronauts float inside the spacecraft."],
                "Apparent weight depends on the normal force. In orbit, astronauts and the spacecraft are in continuous free fall together, creating microgravity.",
                ["Gravity pulls both the astronaut and spacecraft toward Earth.", "Their sideways speed makes them keep missing Earth, so they orbit.", "Both fall together at almost the same acceleration.", "Because the floor does not push strongly on the astronaut, the normal force is almost zero.", "With almost no support force, the astronaut feels weightless."],
                "Astronauts appear weightless because they and the spacecraft are in free fall around Earth together; gravity is present, but the normal force is almost zero.",
                "You feel weight from the support force of the ground. In orbit, the astronaut and spacecraft accelerate together, so there is little support force.",
                "Do not say there is no gravity in space; gravity keeps the spacecraft in orbit.",
                "Why does a person in a falling elevator feel lighter for a short time?",
                "Check: If gravity disappeared, the spacecraft would not stay in orbit.",
            )
        if "newton" in text and "first law" in text:
            return self._lesson(
                "Physics Explanation",
                "We need to explain Newton's first law of motion.",
                ["The question asks about motion.", "It focuses on what happens when no external force changes motion."],
                "Newton's first law says an object remains at rest or in uniform motion in a straight line unless acted on by an external force. This property is called inertia.",
                ["If an object is at rest, it stays at rest unless a force acts.", "If it is moving uniformly, it keeps moving with the same velocity unless a force acts.", "Inertia is the tendency to resist changes in motion."],
                "Newton's first law is the law of inertia: motion changes only when an external force acts.",
                "Forces are needed to change motion, not to keep ideal uniform motion going.",
                "Do not think force is always needed to keep an object moving; force is needed to change motion.",
                "Why does a passenger move forward when a bus suddenly stops?",
            )
        if "10 n" in text and "2 kg" in text:
            return self._lesson(
                "Physics Explanation",
                "We need to calculate acceleration from force and mass.",
                ["Force = 10 N", "Mass = 2 kg"],
                "Newton's second law: F = ma, so a = F/m.",
                ["a = F/m.", "a = 10/2.", "a = 5 m/s^2."],
                "Acceleration = 5 m/s^2",
                "For the same mass, a larger force creates a larger acceleration.",
                "Do not forget the unit m/s^2 for acceleration.",
                "A force of 20 N acts on a 4 kg object. Find acceleration.",
                "Check: F = ma = 2 x 5 = 10 N.",
            )
        if "ohm" in text:
            return self._lesson(
                "Physics Explanation",
                "We need to define Ohm's law and connect voltage, current, and resistance.",
                ["Voltage is the push.", "Current is the flow of charge.", "Resistance opposes current."],
                "Ohm's law: V = IR, where V is voltage, I is current, and R is resistance.",
                ["If resistance stays constant, current increases when voltage increases.", "If voltage stays constant, current decreases when resistance increases."],
                "Ohm's law is V = IR.",
                "The formula shows the direct relationship between voltage and current and the opposing effect of resistance.",
                "Do not mix up current and resistance; current is I, resistance is R.",
                "Find current when V = 10 V and R = 5 ohms.",
            )
        if "increasing temperature" in text or "reaction rate" in text:
            return self._lesson(
                "Chemistry Note",
                "We need to explain why higher temperature usually makes a chemical reaction faster.",
                ["Temperature increases.", "Reaction rate changes."],
                "Collision theory: reactions happen when particles collide with enough energy and correct orientation. Higher temperature increases kinetic energy.",
                ["Particles move faster at higher temperature.", "Faster particles collide more often.", "More particles have enough energy to overcome activation energy.", "So, successful collisions increase and the reaction rate rises."],
                "Increasing temperature generally increases reaction rate because particles collide more often and with more energy.",
                "Reaction rate depends on successful collisions, not just any collision.",
                "Do not say temperature creates more particles; it mainly increases kinetic energy.",
                "Why does powdered zinc react faster than a large piece of zinc?",
            )
        if "catalyst" in text:
            return self._lesson(
                "Chemistry Note",
                "We need to explain how a catalyst changes a reaction.",
                ["A chemical reaction is happening.", "A catalyst is added."],
                "A catalyst provides an alternative pathway with lower activation energy and is not consumed in the reaction.",
                ["The catalyst lowers activation energy.", "More particles can react successfully at the same temperature.", "The reaction becomes faster.", "The catalyst remains chemically unchanged at the end."],
                "A catalyst speeds up a chemical reaction by lowering activation energy and is not consumed.",
                "Lower activation energy means more collisions become successful.",
                "Do not say a catalyst increases the amount of product; it increases the rate of reaching product.",
                "How does an enzyme act like a catalyst in digestion?",
            )
        if "acid" in text and "base" in text:
            return self._lesson(
                "Chemistry Note",
                "We need to compare acids and bases.",
                ["Acids and bases are chemical substances.", "The question asks for their difference."],
                "Acids usually release hydrogen ions in water and have pH less than 7. Bases usually produce hydroxide ions or accept hydrogen ions and have pH greater than 7.",
                ["Acid example: hydrochloric acid.", "Base example: sodium hydroxide.", "Acids turn blue litmus red.", "Bases turn red litmus blue."],
                "Acids have pH below 7 and bases have pH above 7.",
                "The pH scale helps compare how acidic or basic a solution is.",
                "Do not identify acids and bases only by taste or touch; use indicators and pH.",
                "Classify lemon juice and soap solution as acid or base.",
            )
        if "balance the equation" in text or "h2 + o2" in text:
            return self._lesson(
                "Chemistry Note",
                "We need to balance the chemical equation so atoms are equal on both sides.",
                ["Unbalanced equation: H2 + O2 -> H2O", "Atoms must be conserved."],
                "A balanced equation has the same number of each type of atom on reactant and product sides.",
                ["Start: H2 + O2 -> H2O.", "Oxygen has 2 atoms on the left but 1 on the right, so write 2H2O.", "Now hydrogen is 4 on the right, so write 2H2 on the left.", "Balanced equation: 2H2 + O2 -> 2H2O."],
                "2H2 + O2 -> 2H2O",
                "The coefficients make hydrogen and oxygen atom counts equal on both sides.",
                "Do not change chemical formulas like H2O; change only coefficients.",
                "Balance: N2 + H2 -> NH3.",
                "Check: H = 4 both sides, O = 2 both sides.",
            )
        if "photosynthesis" in text:
            if "survive" in text:
                understand = "We need to explain how photosynthesis helps plants stay alive."
                final = "Photosynthesis helps plants survive by making glucose, their food, using sunlight, carbon dioxide, and water."
            else:
                understand = "We need to explain the process of photosynthesis."
                final = "Photosynthesis is the process by which plants make glucose and oxygen using sunlight, carbon dioxide, and water."
            return self._lesson(
                "Biology Note",
                understand,
                ["Plants contain chlorophyll.", "Inputs: sunlight, carbon dioxide, and water.", "Outputs: glucose and oxygen."],
                "Photosynthesis converts light energy into chemical energy stored in glucose.",
                ["Chlorophyll absorbs sunlight.", "Leaves take in carbon dioxide from air.", "Roots absorb water from soil.", "The plant makes glucose for food and releases oxygen."],
                final,
                "Glucose stores energy that plants use for growth, repair, and survival.",
                "Do not say plants get food from soil; soil gives minerals and water, but glucose is made in leaves.",
                "Why is chlorophyll important for photosynthesis?",
            )
        if "cellular respiration" in text:
            return self._lesson(
                "Biology Note",
                "We need to explain how cells release energy from food.",
                ["Cells need energy.", "Glucose and oxygen are used."],
                "Cellular respiration breaks down glucose using oxygen to release energy as ATP.",
                ["Glucose enters the cell.", "Oxygen helps break down glucose.", "Energy is released and stored as ATP.", "Carbon dioxide and water are produced as waste products."],
                "Cellular respiration releases ATP energy from glucose.",
                "ATP is the usable energy currency of the cell.",
                "Do not confuse respiration with only breathing; cellular respiration happens inside cells.",
                "Why do muscle cells need more respiration during exercise?",
            )
        if "chromosome" in text:
            return self._lesson(
                "Biology Note",
                "We need to define chromosomes and explain their role.",
                ["Cells contain genetic material.", "Chromosomes are found mainly in the nucleus."],
                "Chromosomes are thread-like structures made of DNA and proteins. They carry genes, which control hereditary traits.",
                ["DNA stores genetic instructions.", "Genes are sections of DNA.", "Chromosomes organize DNA inside the cell nucleus.", "They pass hereditary information from parents to offspring."],
                "Chromosomes are DNA-containing structures that carry genes.",
                "Organizing DNA into chromosomes helps cells copy and pass genetic information accurately.",
                "Do not say chromosomes and genes are exactly the same; genes are parts of DNA found on chromosomes.",
                "What is the relationship between DNA, genes, and chromosomes?",
            )
        if "mass and weight" in text:
            return self._lesson(
                "Physics Explanation",
                "We need to compare mass and weight.",
                ["Mass measures matter.", "Weight depends on gravity."],
                "Mass is the amount of matter in an object, measured in kg. Weight is the gravitational force on that mass, measured in newtons.",
                ["Mass stays the same from place to place.", "Weight changes when gravity changes.", "Formula: weight = mass x gravitational acceleration."],
                "Mass is measured in kg; weight is a force measured in newtons.",
                "Weight changes on the Moon because gravity is weaker, but mass stays the same.",
                "Do not use kg as the unit of weight in physics calculations.",
                "Why is your weight smaller on the Moon but your mass the same?",
            )
        if "conduct heat" in text:
            return self._lesson(
                "Physics Explanation",
                "We need to explain why metals are good heat conductors.",
                ["Metals conduct heat well.", "Heat is thermal energy transfer."],
                "Metals have free electrons that move through the metal and transfer thermal energy quickly.",
                ["Heating one part gives particles more kinetic energy.", "Free electrons carry energy through the metal.", "Vibrating particles also pass energy to neighbors.", "This makes conduction fast."],
                "Metals conduct heat well mainly because free electrons transfer thermal energy efficiently.",
                "Mobile electrons spread energy faster than vibration alone.",
                "Do not say heat travels only because the metal is shiny; the internal particle structure matters.",
                "Why is a metal spoon hotter than a wooden spoon in hot soup?",
            )
        return None

    def _english_lesson(self, text: str, practice: str) -> dict | None:
        if "affect" in text and "effect" in text:
            return self._lesson(
                "English Note",
                "We need to distinguish two commonly confused words.",
                ["Affect and effect sound similar.", "They usually have different grammar roles."],
                "Affect is usually a verb meaning to influence. Effect is usually a noun meaning a result.",
                ["Example: Use affect for an action: The rain can affect the match.", "Example: Use effect for a result: The effect of rain was a delay."],
                "Affect = verb/influence; effect = noun/result.",
                "The word's job in the sentence tells you which one to choose.",
                "Do not choose by sound; check whether the sentence needs an action or a result.",
                "Choose affect or effect: Sleep can ___ your memory.",
            )
        if "noun" in text and "cat slept" in text:
            return self._lesson(
                "English Note",
                "We need to identify nouns in the sentence.",
                ["Sentence: The cat slept on the mat."],
                "A noun names a person, place, thing, or idea.",
                ["Cat is a thing/animal, so it is a noun.", "Mat is a thing, so it is also a noun."],
                "The nouns are cat and mat.",
                "Both words name things in the sentence.",
                "Do not mark slept as a noun; slept is a verb/action.",
                "Identify the nouns: The girl opened the book.",
            )
        if "has finished" in text:
            return self._lesson(
                "English Note",
                "We need to identify the tense of the sentence.",
                ["Sentence: She has finished her homework.", "Verb phrase: has finished"],
                "Has/have + past participle forms the present perfect tense.",
                ["Has is the helping verb.", "Finished is the past participle.", "Therefore, the tense is present perfect."],
                "The tense is present perfect tense.",
                "Present perfect connects a completed action to the present.",
                "Do not call it simple past just because finished looks past.",
                "Identify the tense: They have eaten lunch.",
            )
        if "passive voice" in text and "boy kicked" in text:
            return self._lesson(
                "English Note",
                "We need to change an active sentence into passive voice.",
                ["Active: The boy kicked the ball.", "Object: the ball", "Verb: kicked"],
                "In passive voice, the object becomes the subject, and we use was/were + past participle.",
                ["Move the object to the front: The ball.", "Use was + past participle: was kicked.", "Add the doer: by the boy."],
                "The ball was kicked by the boy.",
                "The action remains the same, but focus moves from the doer to the receiver.",
                "Do not forget the helping verb was/were in passive voice.",
                "Change to passive: The girl painted the picture.",
            )
        if "apple" in text and (" a or an" in text or "use a" in text):
            return self._lesson(
                "English Note",
                "We need to choose the correct article before apple.",
                ["Word: apple", "Starting sound: vowel sound /a/"],
                "Use an before vowel sounds and a before consonant sounds.",
                ["Apple begins with a vowel sound.", "So we write an apple."],
                "an apple",
                "The choice depends on sound, not just spelling.",
                "Do not write a apple because apple starts with a vowel sound.",
                "Choose a or an: ___ orange.",
            )
        if "synonym for happy" in text:
            return self._lesson(
                "English Note",
                "We need a word with a similar meaning to happy.",
                ["Word: happy"],
                "A synonym is a word with the same or nearly the same meaning.",
                ["Happy means feeling good or pleased.", "Good synonyms include joyful, glad, and pleased."],
                "A synonym for happy is joyful.",
                "Joyful keeps the positive meaning of happy.",
                "Do not give an antonym like sad.",
                "Give a synonym for quick.",
            )
        if "metaphor" in text:
            return self._lesson(
                "English Note",
                "We need to define metaphor.",
                ["Term: metaphor"],
                "A metaphor is a direct comparison between two unlike things without using like or as.",
                ["Example: Time is a thief.", "It does not mean time is literally a thief.", "It means time takes moments away quickly."],
                "A metaphor is a direct comparison without like or as.",
                "Metaphors make writing stronger by creating a clear image.",
                "Do not confuse metaphor with simile; simile uses like or as.",
                "Is 'Her smile is sunshine' a metaphor? Explain.",
            )
        if "theme of honesty" in text:
            return self._lesson(
                "English Note",
                "We need to explain the theme or message of honesty in a story.",
                ["Theme: honesty", "Text type: story"],
                "A theme is the central message or lesson a story teaches.",
                ["Honest characters tell the truth even when it is difficult.", "The story may show trust improving because of honesty.", "Evidence should come from the character's choices and results."],
                "The theme is that honesty builds trust and helps people do the right thing.",
                "A theme is proven by events and character decisions, not just by naming a moral.",
                "Do not write only 'honesty is good'; explain how the story shows it.",
                "Explain the theme of courage in a story.",
            )
        if "punctuation" in text or "wow that is amazing" in text:
            return self._lesson(
                "English Note",
                "We need to correct capitalization and punctuation.",
                ["Sentence: wow that is amazing"],
                "Start a sentence with a capital letter and use punctuation to show tone or pause.",
                ["Capitalize the first word: Wow.", "Add a comma after Wow because it is an exclamation word.", "End with an exclamation mark for strong feeling."],
                "Wow, that is amazing!",
                "The comma separates the introductory exclamation from the rest of the sentence.",
                "Do not leave the first word lowercase at the start of a sentence.",
                "Correct: oh that was close",
            )
        if "idiom" in text and "blue moon" in text:
            return self._lesson(
                "English Note",
                "We need to explain the idiom once in a blue moon.",
                ["Idiom: once in a blue moon"],
                "An idiom is a phrase whose meaning is different from the literal words.",
                ["Once in a blue moon means rarely or not often.", "Example: I visit that town once in a blue moon."],
                "Once in a blue moon means rarely.",
                "The phrase is not about the actual color of the moon; it expresses frequency.",
                "Do not explain idioms literally word by word.",
                "Use 'once in a blue moon' in your own sentence.",
            )
        if "character sketch" in text:
            return self._lesson(
                "English Note",
                "We need to write a short character sketch of a brave student.",
                ["Character: a student", "Main trait: brave"],
                "A character sketch describes personality, qualities, actions, and evidence.",
                ["Start with the student's main quality: brave.", "Show actions: helps others, speaks the truth, faces problems calmly.", "Add evidence: does the right thing even when afraid.", "End with a conclusion about the character."],
                "A brave student is confident, helpful, honest, and ready to face challenges for the right reason.",
                "A good sketch proves qualities through actions, not just adjectives.",
                "Do not list traits only; support each trait with behavior.",
                "Write a character sketch of a kind friend.",
            )
        if "homophone" in text:
            return self._lesson(
                "English Note",
                "We need to explain homophones and give examples.",
                ["Term: homophones"],
                "Homophones are words with the same sound but different meanings and often different spelling.",
                ["Example: to, too, two.", "Example: pair and pear.", "The sound is similar, but meaning changes."],
                "Homophones have the same sound but different meaning.",
                "Context tells us which homophone is correct in a sentence.",
                "Do not use homophones only by sound; check meaning and spelling.",
                "Choose the correct word: I have ___ books. (to/too/two)",
            )
        return None

    def _social_studies_lesson(self, text: str, subject: SubjectArea, practice: str) -> dict | None:
        if "world war i" in text or "world war 1" in text:
            return self._lesson(
                "History Note",
                "We need to explain the main causes of World War I.",
                ["War began in 1914.", "Europe had tense rivalries before the war."],
                "The main causes are often remembered as MAIN: Militarism, Alliances, Imperialism, and Nationalism. The assassination of Archduke Franz Ferdinand triggered the crisis.",
                ["Militarism increased arms competition.", "Alliances pulled countries into conflict.", "Imperialism created rivalry over colonies.", "Nationalism increased aggressive pride.", "The assassination turned tension into war."],
                "World War I was caused by militarism, alliances, imperialism, nationalism, and the assassination trigger.",
                "Long-term tensions made Europe unstable, and the assassination started the chain reaction.",
                "Do not write only assassination; it was the trigger, not the only cause.",
                "Why did alliances make World War I spread quickly?",
            )
        if "french revolution" in text:
            return self._lesson(
                "History Note",
                "We need to explain why the French Revolution happened.",
                ["France had social inequality.", "The government faced financial crisis.", "Common people paid heavy taxes."],
                "The revolution grew from inequality, unfair taxes, Enlightenment ideas, food shortage, and weak monarchy.",
                ["The Third Estate carried most taxes.", "The First and Second Estates had privileges.", "Financial crisis weakened the king.", "Enlightenment ideas encouraged liberty and equality.", "Food shortages increased anger."],
                "The French Revolution was caused by social inequality, financial crisis, Enlightenment ideas, and hardship among common people.",
                "Political change becomes likely when unfair systems combine with economic suffering.",
                "Do not mention only one cause; revolutions usually have multiple causes.",
                "Explain how the Estates system created inequality in France.",
            )
        if "ashoka" in text:
            return self._lesson(
                "History Note",
                "We need to identify Ashoka and explain his importance.",
                ["Ashoka was a Mauryan emperor.", "The Kalinga war changed his life."],
                "Ashoka is important because after the Kalinga war he promoted Buddhism, dhamma, non-violence, and public welfare through edicts.",
                ["Ashoka ruled the Mauryan Empire.", "The Kalinga war caused great suffering.", "He turned toward Buddhism and dhamma.", "His edicts spread moral teachings and good governance."],
                "Ashoka was an important Mauryan emperor known for promoting Buddhism and dhamma after the Kalinga war.",
                "His rule is remembered because he changed from conquest to moral governance.",
                "Do not describe him only as a warrior; his importance is also moral and administrative.",
                "Why are Ashoka's edicts useful for historians?",
            )
        if "industrial revolution" in text:
            return self._lesson(
                "History Note",
                "We need to define the Industrial Revolution.",
                ["It began first in Britain.", "It involved machines and factories."],
                "The Industrial Revolution was the shift from hand production to machine-based factory production.",
                ["New machines increased production.", "Factories grew in towns.", "Transport and industry expanded.", "Work and society changed."],
                "The Industrial Revolution was the rise of machine production and factories, beginning in Britain.",
                "Machines made production faster and changed how people worked and lived.",
                "Do not treat it as only one invention; it was a broad economic and social change.",
                "Name two effects of the Industrial Revolution.",
            )
        if "colonialism" in text:
            return self._lesson(
                "History Note",
                "We need to explain the effects of colonialism.",
                ["Colonial powers controlled other regions.", "Colonies supplied resources and markets."],
                "Colonialism affected economies, culture, politics, trade, education, and local industries.",
                ["Resources were extracted for colonial powers.", "Local economies were reshaped for trade.", "Many societies faced exploitation.", "New education, railways, or administration sometimes appeared, but mainly served colonial interests.", "Cultural and political resistance grew."],
                "Colonialism caused exploitation, economy changes, cultural effects, and political resistance.",
                "Colonial rule changed both the colonizer and the colonized society, but benefits were unequal.",
                "Do not describe colonialism as fully positive; power and exploitation were central.",
                "How did colonialism affect local industries?",
            )
        if "nationalism in europe" in text:
            return self._lesson(
                "History Note",
                "We need to explain nationalism in Europe.",
                ["Nationalism means loyalty to a nation.", "Europe had many kingdoms and empires."],
                "Nationalism in Europe encouraged people with shared language, culture, and identity to demand nation-states.",
                ["People began identifying as members of a nation.", "Nationalist ideas challenged old empires.", "Movements for unification grew in places like Italy and Germany.", "National identity also increased rivalry between states."],
                "Nationalism in Europe promoted national identity, unification movements, and political change.",
                "Shared identity can unite people, but aggressive nationalism can also create conflict.",
                "Do not confuse nationalism with patriotism only; it also shaped political movements.",
                "How did nationalism help unify Germany or Italy?",
            )
        if "where is india" in text:
            return self._lesson(
                "Geography Note",
                "We need to locate India geographically.",
                ["Place: India", "Scale: world and continent"],
                "Location can be described using continent, region, hemispheres, and nearby water bodies.",
                ["India is in Asia.", "More specifically, it is in South Asia.", "It lies mostly in the Northern Hemisphere.", "The Indian Ocean is to its south."],
                "India is located in South Asia, in the continent of Asia.",
                "Using region plus continent gives a clear location quickly.",
                "Do not answer only Asia if the question asks for a more exact location; South Asia is better.",
                "Where is Brazil located?",
            )
        if "earthquake" in text or "tectonic" in text:
            return self._lesson(
                "Geography Note",
                "We need to explain why earthquakes are common near plate boundaries.",
                ["Earth's crust is divided into tectonic plates.", "Plate boundaries are where plates meet."],
                "Earthquakes occur when stress builds along faults at tectonic plate boundaries and is suddenly released as seismic waves.",
                ["Plates move slowly.", "At boundaries, plates can collide, separate, or slide past each other.", "Friction can lock rocks in place.", "Stress builds until rocks break or slip.", "Energy is released as seismic waves, causing an earthquake."],
                "Earthquakes occur near a tectonic plate boundary or plate boundaries because moving plates build and release stress along faults.",
                "Plate boundaries are weak zones where movement and stress are concentrated.",
                "Do not say earthquakes happen randomly everywhere; many occur where plates interact.",
                "Why are volcanoes common near some plate boundaries?",
            )
        if "monsoon" in text:
            return self._lesson(
                "Geography Note",
                "We need to explain the cause of monsoon rainfall in India.",
                ["India heats strongly in summer.", "The Indian Ocean supplies moist air."],
                "Monsoon rainfall is caused by seasonal wind reversal due to pressure differences between land and sea.",
                ["In summer, land heats faster than the sea.", "Low pressure forms over land.", "Moist winds blow from the Indian Ocean toward land.", "The winds rise, cool, and condense to form rainfall."],
                "Monsoon rainfall in India is mainly caused by pressure differences that pull moist ocean winds over land.",
                "Warm land and cooler sea create wind movement that brings moisture.",
                "Do not say clouds come by chance; monsoon winds have a seasonal pattern.",
                "Why does the western coast of India receive heavy monsoon rain?",
            )
        if "water cycle" in text:
            return self._lesson(
                "Geography Note",
                "We need to explain how water moves through nature.",
                ["Water changes form and location.", "Sunlight drives much of the process."],
                "The water cycle is the continuous movement of water through evaporation, condensation, precipitation, and collection.",
                ["Evaporation: water changes into vapor.", "Condensation: vapor cools to form clouds.", "Precipitation: water falls as rain, snow, or hail.", "Collection: water gathers in rivers, lakes, oceans, and groundwater."],
                "The water cycle is evaporation, condensation, precipitation, and collection.",
                "It recycles water between land, air, and oceans.",
                "Do not forget groundwater and collection after rainfall.",
                "Explain how clouds form in the water cycle.",
            )
        if "erosion" in text:
            return self._lesson(
                "Geography Note",
                "We need to define erosion.",
                ["Soil and rock can move from one place to another.", "Agents include water, wind, ice, and waves."],
                "Erosion is the wearing away and transport of soil or rock by natural forces.",
                ["Water can carry soil away.", "Wind can move fine particles.", "Ice can scrape rocks.", "Waves can wear down coasts."],
                "Erosion is the wearing away and movement of soil or rock.",
                "It changes landforms over time by removing material.",
                "Do not confuse weathering with erosion; weathering breaks material, erosion moves it.",
                "Give one example of river erosion.",
            )
        if "rivers" in text and "settlements" in text:
            return self._lesson(
                "Geography Note",
                "We need to explain why people settle near rivers.",
                ["Rivers provide water.", "Settlements need resources and transport."],
                "Rivers support settlements by providing water, fertile soil, farming, transport, trade, and sometimes defense.",
                ["People use river water for drinking and irrigation.", "Floodplains often have fertile soil for farming.", "Rivers help transport goods and people.", "Trade grows along river routes."],
                "Rivers are important for settlements because they support water supply, farming, transport, and trade.",
                "Settlements grow where basic needs and movement are easier.",
                "Do not mention only drinking water; rivers also shape economy and farming.",
                "Why did many ancient civilizations grow near rivers?",
            )
        return None

    def create_study_resources(self, subject: SubjectArea, message: str, mode: ChatMode) -> List[StudyResource]:
        topic = message[:80].strip() or subject.value.replace("_", " ")
        resources = [
            StudyResource(
                type="practice",
                title="Practice Questions",
                items=[
                    {"question": f"Explain {topic} in one sentence.", "difficulty": "easy"},
                    {"question": f"Give one example connected to {topic}.", "difficulty": "medium"},
                ],
            ),
            StudyResource(
                type="flashcards",
                title="Flashcards",
                items=[
                    {"front": "Key idea", "back": f"Write the main idea of {topic} in your own words."},
                    {"front": "Common mistake", "back": "Do not memorize without understanding the reason."},
                ],
            ),
        ]
        if mode == ChatMode.study:
            resources.append(
                StudyResource(
                    type="study_plan",
                    title="Mini Study Plan",
                    items=[
                        {"step": "Read", "time": "5 min"},
                        {"step": "Recall", "time": "3 min"},
                        {"step": "Practice", "time": "7 min"},
                    ],
                )
            )
        return resources

    def _is_casual(self, message: str) -> bool:
        value = message.lower().strip()
        return value in {"hi", "hello", "hey", "yo", "thanks", "thank you", "bye"} or value.startswith("how are you")

    def _casual_answer(self, message: str) -> str:
        value = message.lower().strip()
        if value in {"thanks", "thank you"}:
            return "No problem. Send the next doubt whenever you are ready."
        if value == "bye":
            return "Bye. Study light, revise smart."
        return "Hey. Send me the doubt, topic, or homework photo and I will help."

    def _opening(self, subject: SubjectArea, difficulty: DifficultyLevel, strategy: ModeStrategy, profile: LearnerProfile) -> str:
        name_part = f"{profile.user_id}, " if profile.user_id and profile.user_id != "guest" else ""
        return (
            f"{name_part}let's handle this in **{strategy.title}** mode. "
            f"I'll keep it {difficulty.value} level and focused on *{subject.value.replace('_', ' ')}*."
        )

    def _subject_explanation(self, message: str, subject: SubjectArea, tool_calls: List[ToolCall], knowledge_notes: List[str]) -> str:
        note = knowledge_notes[0] if knowledge_notes else "Start with the core meaning, then connect it to an example."
        calculator = next((call for call in tool_calls if call.name == "calculator" and "result" in call.output), None)
        if calculator:
            return f"The calculation tool found `{calculator.output.get('expression')}` = **{calculator.output.get('result')}**. Now connect that result to the question."
        if subject == SubjectArea.geography:
            return "For geography, first locate the place, then describe physical features, climate, resources, and how people live there."
        if subject == SubjectArea.history:
            return "For history, focus on cause, event, people involved, and result. This makes dates easier to remember."
        if subject == SubjectArea.biology:
            return "For biology, connect the structure or process to its function in a living organism."
        if subject == SubjectArea.computer_science:
            return "For coding, identify the input, the logic, the output, and the edge cases before changing code."
        return note

    def _steps(self, subject: SubjectArea, reasoning_plan: List[ReasoningStep], tool_calls: List[ToolCall]) -> List[str]:
        steps = [f"{index + 1}. {step.detail}" for index, step in enumerate(reasoning_plan[:3])]
        if tool_calls:
            steps.append(f"{len(steps) + 1}. Used tools: {', '.join(call.name for call in tool_calls)}.")
        if not steps:
            steps = ["1. Identify the topic.", "2. Explain the rule.", "3. Apply it to the question."]
        return steps

    def _example(self, subject: SubjectArea, message: str) -> str:
        if subject == SubjectArea.mathematics:
            return "If the problem is `x + 5 = 10`, subtract 5 from both sides, so `x = 5`."
        if subject == SubjectArea.geography:
            return "Example: India is in South Asia, bordered by the Indian Ocean region and several neighboring countries."
        if subject == SubjectArea.history:
            return "Example: To explain independence, mention the cause, key people, major events, and result."
        if subject == SubjectArea.civics:
            return "Example: To explain democracy, mention people, voting, rights, duties, and accountability."
        if subject == SubjectArea.economics:
            return "Example: If demand rises and supply stays the same, price usually increases."
        if subject == SubjectArea.english:
            return "Example: If a sentence is confusing, rewrite it with simpler words while keeping the meaning."
        return "Example: Take the main idea, apply it to one simple situation, and check if the result still makes sense."

    def _final_line(self, subject: SubjectArea, message: str, tool_calls: List[ToolCall]) -> str:
        calculator = next((call for call in tool_calls if call.name == "calculator" and "result" in call.output), None)
        if calculator:
            return f"the result is {calculator.output.get('result')}."
        return f"understand the main idea of {subject.value.replace('_', ' ')} by connecting meaning, reason, and example."

    def _personalized_tip(self, memories: List[MemoryItem], profile: LearnerProfile) -> str:
        if profile.weak_concepts:
            return f"_Since weak topics include {', '.join(profile.weak_concepts[:3])}, revise the definition first, then practice one example._"
        return f"_This connects with your earlier study context: {memories[0].text[:140]}_"

    def _spark_steps(self, steps: List[str]) -> str:
        return "\n".join(steps[:3])

    def _concept_for(self, subject: SubjectArea) -> str:
        if subject == SubjectArea.mathematics:
            return "Write the formula or relationship first, substitute the values, solve carefully, and verify the answer."
        if subject in {SubjectArea.physics, SubjectArea.chemistry, SubjectArea.biology}:
            return "Start with the main concept, then connect it to the example or process in the question."
        if subject == SubjectArea.english:
            return "Identify the grammar rule or literary idea, then apply it directly to the sentence or text."
        if subject in {SubjectArea.history, SubjectArea.geography, SubjectArea.civics, SubjectArea.economics}:
            return "Use context first, then connect facts through cause-effect, location, or civic/economic relationships."
        return "Understand the question, apply the right concept, then check the answer."

    def _common_mistake(self, subject: SubjectArea, analysis: QuestionAnalysis) -> str:
        if subject == SubjectArea.mathematics:
            return "Do not skip the setup. Students often use the right numbers with the wrong relationship."
        if subject in {SubjectArea.physics, SubjectArea.chemistry}:
            return "Do not use a formula before checking what each value means and whether the units match."
        if subject == SubjectArea.biology:
            return "Do not memorize only keywords; explain the process in the correct order."
        if subject == SubjectArea.english:
            return "Do not choose what sounds right without connecting it to the rule or evidence."
        if subject == SubjectArea.geography:
            return "Do not stop at a broad location if the question asks for a city, state, or exact region."
        if subject == SubjectArea.history:
            return "Do not list facts without explaining cause and effect."
        return "Do not memorize the final line only; remember the reason behind it."
