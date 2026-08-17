from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Keep benchmark runs from polluting the normal learning-pattern store.
os.environ.setdefault(
    "TUTORLY_PATTERN_MEMORY_PATH",
    str(ROOT / "tests" / "evaluation_reports" / "answer_quality_pattern_memory.json"),
)

from backend.chatbot.orchestrator import ChatbotOrchestrator
from backend.chatbot.schemas import ChatMode, ChatbotRequest


@dataclass(frozen=True)
class QualityCase:
    group: str
    subject: str
    question: str
    expected_terms: tuple[str, ...]
    required_terms: tuple[str, ...] = ()
    avoid_terms: tuple[str, ...] = ()
    expected_answer: str = ""


@dataclass
class QualityResult:
    case: QualityCase
    answer: str
    scores: dict[str, float]
    failures: list[str] = field(default_factory=list)
    missing_terms: list[str] = field(default_factory=list)
    weak_reasons: list[str] = field(default_factory=list)
    suggested_improvement: str = ""

    @property
    def average(self) -> float:
        return round(mean(self.scores.values()), 2)


CASES: list[QualityCase] = [
    # Mathematics: 10
    QualityCase("Mathematics", "mathematics", "Solve 2x + 5 = 17.", ("2x = 12", "x = 6", "subtract", "divide"), ("x = 6",)),
    QualityCase("Mathematics", "mathematics", "Solve x^2 - 5x + 6 = 0.", ("factor", "(x - 2)", "(x - 3)", "x = 2", "x = 3"), ("x = 2", "x = 3")),
    QualityCase("Mathematics", "mathematics", "What is 64 + 88?", ("64", "88", "152", "carry"), ("152",)),
    QualityCase("Mathematics", "mathematics", "Find 20 percent of 150.", ("20%", "150", "30"), ("30",)),
    QualityCase("Mathematics", "mathematics", "Find the mean of 12, 15, 18, 20, and 25.", ("12 + 15 + 18 + 20 + 25", "90", "5", "18"), ("18",)),
    QualityCase("Mathematics", "mathematics", "Find the area of a triangle with base 10 cm and height 8 cm.", ("1/2", "base", "height", "40", "cm"), ("40",)),
    QualityCase("Mathematics", "mathematics", "Use Pythagoras theorem to find the hypotenuse if the sides are 3 and 4.", ("3^2", "4^2", "25", "5"), ("5",)),
    QualityCase("Mathematics", "mathematics", "Simplify the fraction 18/24.", ("divide", "6", "3/4"), ("3/4",)),
    QualityCase("Mathematics", "mathematics", "A train travels 120 km in 2 hours. Find its speed.", ("speed", "distance", "time", "120/2", "60 km/h"), ("60",)),
    QualityCase("Mathematics", "mathematics", "Find the square root of 144.", ("12", "12 x 12", "144"), ("12",)),

    # Science: 10
    QualityCase("Science", "physics", "Why do astronauts appear weightless inside a spacecraft orbiting Earth?", ("gravity", "free fall", "orbit", "normal force", "microgravity"), ("free fall", "gravity")),
    QualityCase("Science", "physics", "Explain Newton's first law of motion.", ("object", "rest", "uniform motion", "external force", "inertia"), ("inertia",)),
    QualityCase("Science", "physics", "A force of 10 N acts on a 2 kg body. Find acceleration.", ("F = ma", "a = F/m", "10/2", "5 m/s"), ("5",)),
    QualityCase("Science", "physics", "What is Ohm's law?", ("V = IR", "voltage", "current", "resistance"), ("V = IR",)),
    QualityCase("Science", "chemistry", "Why does increasing temperature increase reaction rate?", ("particles", "kinetic energy", "collision", "activation energy", "reaction rate"), ("collision",)),
    QualityCase("Science", "chemistry", "How does a catalyst affect a chemical reaction?", ("catalyst", "activation energy", "faster", "not consumed"), ("activation energy",)),
    QualityCase("Science", "chemistry", "What is the difference between an acid and a base?", ("acid", "base", "pH", "hydrogen", "hydroxide"), ("acid", "base")),
    QualityCase("Science", "biology", "Explain photosynthesis.", ("sunlight", "carbon dioxide", "water", "glucose", "oxygen", "chlorophyll"), ("glucose", "oxygen")),
    QualityCase("Science", "biology", "What is cellular respiration?", ("glucose", "oxygen", "energy", "ATP", "carbon dioxide"), ("energy",)),
    QualityCase("Science", "biology", "What are chromosomes?", ("DNA", "genes", "cell", "nucleus", "hereditary"), ("DNA",)),

    # English: 10
    QualityCase("English", "english", "What is the difference between affect and effect?", ("affect", "verb", "effect", "noun", "example"), ("affect", "effect")),
    QualityCase("English", "english", "Identify the noun in this sentence: The cat slept on the mat.", ("cat", "mat", "noun", "person, place, thing"), ("cat", "mat")),
    QualityCase("English", "english", "Identify the tense: She has finished her homework.", ("present perfect", "has", "past participle", "finished"), ("present perfect",)),
    QualityCase("English", "english", "Change this sentence into passive voice: The boy kicked the ball.", ("The ball was kicked by the boy", "object", "passive"), ("ball was kicked",)),
    QualityCase("English", "english", "Use a or an before the word apple.", ("an apple", "vowel sound", "article"), ("an apple",)),
    QualityCase("English", "english", "Give a synonym for happy.", ("joyful", "glad", "pleased", "synonym"), ("synonym",)),
    QualityCase("English", "english", "What is a metaphor?", ("comparison", "without like or as", "example"), ("without like or as",)),
    QualityCase("English", "english", "Explain the theme of honesty in a story.", ("theme", "honesty", "truth", "message", "evidence"), ("honesty",)),
    QualityCase("English", "english", "Correct the punctuation in this sentence: wow that is amazing", ("Wow, that is amazing!", "capital", "comma", "exclamation"), ("Wow",)),
    QualityCase("English", "english", "Explain the idiom once in a blue moon.", ("rarely", "not often", "idiom", "example"), ("rarely",)),

    # History / Geography: 10
    QualityCase("History/Geography", "history", "What caused World War I?", ("militarism", "alliances", "imperialism", "nationalism", "assassination"), ("assassination",)),
    QualityCase("History/Geography", "history", "Explain the main causes of the French Revolution.", ("tax", "inequality", "estates", "enlightenment", "financial crisis"), ("inequality",)),
    QualityCase("History/Geography", "history", "Who was Ashoka and why is he important?", ("Mauryan", "emperor", "Kalinga", "Buddhism", "edicts"), ("Ashoka",)),
    QualityCase("History/Geography", "history", "What was the Industrial Revolution?", ("machines", "factories", "industry", "Britain", "production"), ("machines",)),
    QualityCase("History/Geography", "history", "What were the effects of colonialism?", ("resources", "trade", "exploitation", "culture", "economy"), ("exploitation",)),
    QualityCase("History/Geography", "geography", "Where is India located?", ("South Asia", "Asia", "Indian Ocean", "Northern Hemisphere"), ("South Asia",)),
    QualityCase("History/Geography", "geography", "Why do earthquakes occur near tectonic plate boundaries?", ("tectonic plates", "boundary", "stress", "fault", "seismic waves"), ("tectonic",)),
    QualityCase("History/Geography", "geography", "What causes monsoon rainfall in India?", ("land", "sea", "pressure", "moist winds", "Indian Ocean"), ("monsoon",)),
    QualityCase("History/Geography", "geography", "Explain the water cycle.", ("evaporation", "condensation", "precipitation", "collection"), ("evaporation",)),
    QualityCase("History/Geography", "geography", "What is erosion?", ("wearing away", "soil", "rock", "water", "wind"), ("erosion",)),

    # Mixed difficulty: 10
    QualityCase("Mixed", "mathematics", "A rectangular garden has area 84 square meters and length 5 meters longer than width. Find both dimensions.", ("w(w + 5)", "84", "w = 7", "length = 12", "width = 7"), ("12", "7")),
    QualityCase("Mixed", "mathematics", "Riya and Aman share chocolates in the ratio 2:3. If total chocolates are 50, how many does each get?", ("2 + 3", "5 parts", "20", "30"), ("20", "30")),
    QualityCase("Mixed", "physics", "Explain the difference between mass and weight.", ("mass", "weight", "gravity", "kg", "newton"), ("mass", "weight")),
    QualityCase("Mixed", "chemistry", "Balance the equation H2 + O2 -> H2O.", ("2H2", "O2", "2H2O", "atoms", "balanced"), ("2H2", "2H2O")),
    QualityCase("Mixed", "biology", "How does photosynthesis help plants survive?", ("glucose", "food", "energy", "oxygen", "sunlight"), ("food", "glucose")),
    QualityCase("Mixed", "english", "Write a character sketch of a brave student.", ("brave", "qualities", "evidence", "conclusion", "student"), ("brave",)),
    QualityCase("Mixed", "history", "Explain nationalism in Europe.", ("nationalism", "nation", "identity", "Europe", "unification"), ("nationalism",)),
    QualityCase("Mixed", "geography", "Why are rivers important for settlements?", ("water", "farming", "transport", "trade", "settlements"), ("water",)),
    QualityCase("Mixed", "physics", "Why do metals conduct heat well?", ("free electrons", "particles", "thermal energy", "conduction"), ("conduct",)),
    QualityCase("Mixed", "english", "What are homophones? Give examples.", ("same sound", "different meaning", "different spelling", "example"), ("same sound",)),
]


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower())


def contains_term(answer: str, term: str) -> bool:
    haystack = normalize(answer).replace("×", "x")
    needle = normalize(term).replace("×", "x")
    if needle in haystack:
        return True
    compact_haystack = re.sub(r"\s+", "", haystack)
    compact_needle = re.sub(r"\s+", "", needle)
    return compact_needle in compact_haystack


def score_answer(case: QualityCase, answer: str) -> QualityResult:
    text = answer.strip()
    normalized = normalize(text)
    matched_expected = [term for term in case.expected_terms if contains_term(text, term)]
    matched_required = [term for term in case.required_terms if contains_term(text, term)]
    missing_terms = [term for term in case.required_terms if term not in matched_required]

    expected_ratio = len(matched_expected) / max(1, len(case.expected_terms))
    required_ratio = len(matched_required) / max(1, len(case.required_terms))
    accuracy = min(10.0, round((expected_ratio * 7.0) + (required_ratio * 3.0), 1))

    headings = len(re.findall(r"^#{1,4}\s+", text, re.M))
    has_steps = bool(re.search(r"\b(step|solution|1\.|2\.|formula|rule|concept)\b", normalized))
    has_practice = "practice question" in normalized or "practice challenge" in normalized
    has_mistake = "common mistake" in normalized or "misconception" in normalized
    has_final = "final answer" in normalized or "answer:" in normalized
    educational = 2 + (2 if has_steps else 0) + (2 if has_practice else 0) + (2 if has_mistake else 0) + min(2, headings / 2)
    educational = round(min(10.0, educational), 1)

    word_count = len(re.findall(r"\w+", text))
    clarity = 10.0
    if word_count < 80:
        clarity -= 2.5
    if word_count > 650:
        clarity -= 1.0
    if re.search(r"\b(undefined|null|placeholder|template filler|main idea of|right method|detect the subject)\b", normalized):
        clarity -= 4.0
    if headings < 2:
        clarity -= 1.5
    clarity = round(max(0.0, clarity), 1)

    completeness = min(10.0, round((accuracy * 0.65) + (educational * 0.25) + (2 if has_final else 0), 1))

    relevance = 10.0
    if case.subject not in normalized and case.group.lower().split("/")[0] not in normalized:
        relevance -= 0.5
    for bad in case.avoid_terms:
        if contains_term(text, bad):
            relevance -= 2
    if re.search(r"\b(coding help|product thinking|business direction|ui/ux|generic chatbot)\b", normalized):
        relevance -= 4
    if expected_ratio < 0.35:
        relevance -= 3
    relevance = round(max(0.0, relevance), 1)

    hallucination_safety = 10.0
    if re.search(r"\b(always|never|guaranteed|proves that|only reason)\b", normalized):
        hallucination_safety -= 0.8
    if re.search(r"\b(fake|invented|unknown source|i found online)\b", normalized):
        hallucination_safety -= 3
    if expected_ratio < 0.3:
        hallucination_safety -= 2.5
    hallucination_safety = round(max(0.0, hallucination_safety), 1)

    scores = {
        "accuracy": accuracy,
        "educational_value": educational,
        "clarity": clarity,
        "completeness": completeness,
        "relevance": relevance,
        "hallucination_safety": hallucination_safety,
    }
    failures: list[str] = []
    weak_reasons: list[str] = []
    if accuracy < 9:
        failures.append("accuracy_below_target")
        weak_reasons.append(f"Missing expected concepts: {', '.join([term for term in case.expected_terms if term not in matched_expected][:6])}")
    if educational < 9:
        failures.append("weak_educational_value")
        weak_reasons.append("Needs clearer teaching structure, steps, mistake warning, or practice.")
    if clarity < 9:
        failures.append("clarity_below_target")
        weak_reasons.append("Answer is too generic, too short, too long, or contains template-like phrasing.")
    if completeness < 9:
        failures.append("incomplete_answer")
        weak_reasons.append("Answer does not fully cover required terms and final answer structure.")
    if relevance < 9.5:
        failures.append("relevance_below_target")
        weak_reasons.append("Answer does not stay tightly enough on the question.")
    if hallucination_safety < 9:
        failures.append("hallucination_risk")
        weak_reasons.append("Answer uses overconfident or unsupported wording.")

    suggestion = "Include the specific expected concepts, show the method or rule, then give a clear final answer and one practice question."
    return QualityResult(
        case=case,
        answer=answer,
        scores=scores,
        failures=failures,
        missing_terms=missing_terms,
        weak_reasons=weak_reasons,
        suggested_improvement=suggestion,
    )


async def run_cases(cases: list[QualityCase]) -> list[QualityResult]:
    bot = ChatbotOrchestrator()
    results: list[QualityResult] = []
    for case in cases:
        response = await bot.respond(ChatbotRequest(user_id="answer_quality_benchmark", message=case.question, mode=ChatMode.prime))
        results.append(score_answer(case, response.answer))
    return results


def build_summary(results: list[QualityResult]) -> dict[str, Any]:
    fields = list(results[0].scores) if results else []
    failure_counter = Counter(failure for result in results for failure in result.failures)
    group_scores: dict[str, dict[str, float]] = {}
    for group in sorted({result.case.group for result in results}):
        group_results = [result for result in results if result.case.group == group]
        group_scores[group] = {
            field: round(mean(result.scores[field] for result in group_results), 2)
            for field in fields
        }
    return {
        "cases": len(results),
        "passed": sum(1 for result in results if not result.failures),
        "flagged": sum(1 for result in results if result.failures),
        "averageScores": {
            field: round(mean(result.scores[field] for result in results), 2)
            for field in fields
        },
        "failureCategories": dict(failure_counter.most_common()),
        "groupScores": group_scores,
    }


def result_to_dict(result: QualityResult) -> dict[str, Any]:
    return {
        "group": result.case.group,
        "subject": result.case.subject,
        "question": result.case.question,
        "expectedTerms": result.case.expected_terms,
        "requiredTerms": result.case.required_terms,
        "answer": result.answer,
        "scores": result.scores,
        "average": result.average,
        "failures": result.failures,
        "missingTerms": result.missing_terms,
        "whyItFailed": result.weak_reasons,
        "suggestedImprovement": result.suggested_improvement,
    }


def write_reports(results: list[QualityResult], output_dir: Path, label: str) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"tutorly_answer_quality_{label}.json"
    md_path = output_dir / f"tutorly_answer_quality_{label}.md"
    summary = build_summary(results)
    weakest = sorted(results, key=lambda result: (result.average, result.scores["accuracy"], result.scores["relevance"]))[:20]
    payload = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "label": label,
        "summary": summary,
        "weakestAnswers": [result_to_dict(result) for result in weakest],
        "results": [result_to_dict(result) for result in results],
    }
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    md_path.write_text(build_markdown(payload), encoding="utf-8")
    return json_path, md_path


def build_markdown(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    lines = [
        "# Tutorly Answer Quality Benchmark",
        "",
        f"Generated: {payload['generatedAt']}",
        f"Label: {payload['label']}",
        "",
        "## Summary",
        "",
        f"- Total questions: {summary['cases']}",
        f"- Passed target: {summary['passed']}",
        f"- Flagged: {summary['flagged']}",
    ]
    for name, score in summary["averageScores"].items():
        lines.append(f"- Average {name.replace('_', ' ').title()}: {score}/10")

    lines.extend(["", "## Failure Categories", ""])
    if summary["failureCategories"]:
        lines.extend(f"- {name}: {count}" for name, count in summary["failureCategories"].items())
    else:
        lines.append("- None")

    lines.extend(["", "## Weakest 20 Answers", ""])
    for index, result in enumerate(payload["weakestAnswers"], start=1):
        answer_preview = result["answer"][:900].replace("\n", "\n  ")
        lines.extend([
            f"### {index}. {result['question']}",
            "",
            f"- Group: {result['group']}",
            f"- Average score: {result['average']}/10",
            f"- Scores: {result['scores']}",
            f"- Failures: {', '.join(result['failures']) or 'None'}",
            f"- Why it failed: {'; '.join(result['whyItFailed']) or 'No major weakness.'}",
            f"- Suggested improvement: {result['suggestedImprovement']}",
            "",
            "Generated answer:",
            "",
            f"> {answer_preview}",
            "",
        ])
    return "\n".join(lines)


async def async_main() -> None:
    parser = argparse.ArgumentParser(description="Run Tutorly answer-quality benchmark.")
    parser.add_argument("--label", default="latest", help="Report filename label, for example baseline or after.")
    parser.add_argument("--output-dir", default=str(ROOT / "tests" / "evaluation_reports"))
    args = parser.parse_args()

    results = await run_cases(CASES)
    json_path, md_path = write_reports(results, Path(args.output_dir), args.label)
    summary = build_summary(results)
    print(f"Tutorly answer quality benchmark completed: {summary['passed']} passed, {summary['flagged']} flagged.")
    print(f"JSON: {json_path}")
    print(f"Report: {md_path}")
    print("Average scores:")
    for name, score in summary["averageScores"].items():
        print(f"- {name}: {score}/10")
    if summary["failureCategories"]:
        print("Top failure categories:")
        for name, count in summary["failureCategories"].items():
            print(f"- {name}: {count}")


if __name__ == "__main__":
    asyncio.run(async_main())
