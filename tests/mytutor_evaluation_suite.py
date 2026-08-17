from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
import argparse
import json
import os
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / "backend" / ".env", override=False)
except Exception:
    pass

from backend.chatbot.knowledge_confidence_engine import KnowledgeConfidenceEngine
from backend.chatbot.knowledge_merge_engine import KnowledgeMergeEngine
from backend.chatbot.knowledge_router import SmartKnowledgeRouter
from backend.chatbot.pattern_matching_engine import PatternMatchingEngine
from backend.chatbot.question_analyzer import QuestionAnalyzer
from backend.chatbot.schemas import RetrievedKnowledge


@dataclass(frozen=True)
class EvalCase:
    group: str
    question: str
    expected_subject: str
    expected_topic_terms: tuple[str, ...] = ()
    expected_search: bool = False
    expected_type: str | None = None
    expected_template: str | None = None


@dataclass
class EvalResult:
    case: EvalCase
    subject: str
    topic: str
    subtopic: str
    difficulty: str
    question_type: str
    analyzer_confidence: float
    router_category: str
    router_confidence: float
    search_triggered: bool
    search_provider: str | None
    search_results: int
    search_warning: str
    pattern_match: bool
    best_pattern: dict[str, Any] | None
    knowledge_confidence: float
    teaching_template: str
    teaching_strategy: str
    merged_knowledge_preview: str
    scores: dict[str, int]
    failures: list[dict[str, str]] = field(default_factory=list)


CASES: list[EvalCase] = [
    # Mathematics: 20
    EvalCase("Mathematics", "Solve x^2 - 5x + 6 = 0", "mathematics", ("Quadratic",), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Solve 2x + 5 = 17", "mathematics", ("Algebra", "Mathematics"), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "What is 64 + 88?", "mathematics", ("Mathematics",), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "A rectangular garden has area 84 square meters and length 5 meters longer than width. Find both dimensions.", "mathematics", ("Geometry",), False, "problem_solving", "Mathematics"),
    EvalCase("Mathematics", "Find 20 percent of 150.", "mathematics", ("Ratio", "Mathematics"), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Find the mean of 12, 15, 18, 20, and 25.", "mathematics", ("Mathematics", "Statistics"), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "What is the probability of getting heads when tossing a fair coin?", "mathematics", ("Mathematics", "Probability"), False, None, "Mathematics"),
    EvalCase("Mathematics", "Find the LCM of 12 and 18.", "mathematics", ("Mathematics",), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Calculate compound interest on 5000 at 10 percent for 2 years.", "mathematics", ("Mathematics",), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Find the area of a triangle with base 10 cm and height 8 cm.", "mathematics", ("Geometry",), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Use Pythagoras theorem to find the hypotenuse if the sides are 3 and 4.", "mathematics", ("Geometry", "Mathematics"), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Simplify the fraction 18/24.", "mathematics", ("Mathematics",), False, None, "Mathematics"),
    EvalCase("Mathematics", "Solve the simultaneous equations x + y = 10 and x - y = 2.", "mathematics", ("Algebra", "Mathematics"), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Differentiate x^3 with respect to x.", "mathematics", ("Mathematics",), False, None, "Mathematics"),
    EvalCase("Mathematics", "Integrate 2x with respect to x.", "mathematics", ("Mathematics",), False, None, "Mathematics"),
    EvalCase("Mathematics", "Riya and Aman share chocolates in the ratio 2:3. If total chocolates are 50, how many does each get?", "mathematics", ("Ratio",), False, "problem_solving", "Mathematics"),
    EvalCase("Mathematics", "A train travels 120 km in 2 hours. Find its speed.", "mathematics", ("Rates",), False, "problem_solving", "Mathematics"),
    EvalCase("Mathematics", "Find the square root of 144.", "mathematics", ("Mathematics",), False, "numerical", "Mathematics"),
    EvalCase("Mathematics", "Solve log base 10 of x equals 2.", "mathematics", ("Mathematics",), False, None, "Mathematics"),
    EvalCase("Mathematics", "Find the determinant of the matrix [[1, 2], [3, 4]].", "mathematics", ("Mathematics",), False, "numerical", "Mathematics"),

    # Physics: 20
    EvalCase("Physics", "Why do astronauts appear weightless inside a spacecraft orbiting Earth?", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "Explain Newton's first law of motion.", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "A force of 10 N acts on a 2 kg body. Find acceleration.", "physics", ("Physics",), False, "numerical", "Science"),
    EvalCase("Physics", "What is the difference between speed and velocity?", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "Why does friction oppose motion?", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "Explain conservation of energy with an example.", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "Calculate power if 100 J of work is done in 5 seconds.", "physics", ("Physics",), False, "numerical", "Science"),
    EvalCase("Physics", "What causes sound waves to travel through air?", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "Explain why light bends when it enters water.", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "What is Ohm's law?", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "Find current when voltage is 12 V and resistance is 4 ohms.", "physics", ("Physics",), False, "numerical", "Science"),
    EvalCase("Physics", "Explain how a magnet attracts iron.", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "What is density and how is it calculated?", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "Why does pressure increase when force increases on the same area?", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "Explain buoyancy in simple words.", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "What is momentum?", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "Why do metals conduct heat well?", "physics", ("Physics",), False, "explanation", "Science"),
    EvalCase("Physics", "Explain the difference between mass and weight.", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "What is centripetal force?", "physics", ("Physics",), False, "conceptual", "Science"),
    EvalCase("Physics", "Latest NASA mission today for students.", "physics", ("Physics",), True, "current_events", "Science"),

    # Chemistry/Biology: 20
    EvalCase("Chemistry/Biology", "Why does increasing temperature increase reaction rate?", "chemistry", ("Reaction Rates",), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "Explain activation energy in chemistry.", "chemistry", ("Reaction Rates", "Chemistry"), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What is collision theory?", "chemistry", ("Reaction Rates", "Chemistry"), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "How does a catalyst affect a chemical reaction?", "chemistry", ("Reaction Rates", "Chemistry"), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What is the difference between an acid and a base?", "chemistry", ("Acids", "Chemistry"), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "Explain pH scale with examples.", "chemistry", ("Acids", "Chemistry"), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What is a mole in chemistry?", "chemistry", ("Stoichiometry", "Chemistry"), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "Balance the equation H2 + O2 -> H2O.", "chemistry", ("Chemistry",), False, None, "Science"),
    EvalCase("Chemistry/Biology", "Explain oxidation and reduction.", "chemistry", ("Redox", "Chemistry"), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What happens during electrolysis of water?", "chemistry", ("Redox", "Chemistry"), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "Explain photosynthesis.", "biology", ("Photosynthesis",), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "How does photosynthesis help plants survive?", "biology", ("Photosynthesis",), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What is cellular respiration?", "biology", ("Biology",), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "Explain germination in seeds.", "biology", ("Germination",), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What is the function of the heart?", "biology", ("Biology",), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "Explain digestion in humans.", "biology", ("Biology",), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What is the difference between plant and animal cells?", "biology", ("Biology",), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "Explain ecosystems with an example.", "biology", ("Biology",), False, "explanation", "Science"),
    EvalCase("Chemistry/Biology", "What are chromosomes?", "biology", ("Biology",), False, "conceptual", "Science"),
    EvalCase("Chemistry/Biology", "What is the latest discovery about photosynthesis this week?", "biology", ("Photosynthesis", "Biology"), True, "current_events", "Science"),

    # English: 20
    EvalCase("English", "What is the difference between affect and effect?", "english", ("Vocabulary",), False, "conceptual", "English"),
    EvalCase("English", "Identify the noun in this sentence: The cat slept on the mat.", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Identify the tense: She has finished her homework.", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Change this sentence into passive voice: The boy kicked the ball.", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Change direct speech to indirect speech: He said, I am tired.", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Use a or an before the word apple.", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Fill the correct preposition: She is good ___ math.", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Give a synonym for happy.", "english", ("Vocabulary",), False, None, "English"),
    EvalCase("English", "Give an antonym for ancient.", "english", ("Vocabulary",), False, None, "English"),
    EvalCase("English", "What is a metaphor?", "english", ("Literature", "Vocabulary"), False, "literature", "English"),
    EvalCase("English", "What is a simile?", "english", ("Literature", "Vocabulary"), False, "literature", "English"),
    EvalCase("English", "Explain the theme of honesty in a story.", "english", ("Literature",), False, "literature", "English"),
    EvalCase("English", "Write a character sketch of a brave student.", "english", ("Literature",), False, "literature", "English"),
    EvalCase("English", "Summarize a short story about friendship.", "english", ("Literature",), False, None, "English"),
    EvalCase("English", "Write a formal letter to the principal asking for leave.", "english", ("Grammar", "English"), False, "essay", "English"),
    EvalCase("English", "Write an essay on the importance of reading.", "english", ("English",), False, "essay", "English"),
    EvalCase("English", "Correct the punctuation in this sentence: wow that is amazing", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "What is the difference between adjective and adverb?", "english", ("Grammar",), False, "grammar", "English"),
    EvalCase("English", "Explain the idiom once in a blue moon.", "english", ("Vocabulary",), False, None, "English"),
    EvalCase("English", "What are homophones? Give examples.", "english", ("Vocabulary",), False, None, "English"),

    # History/Geography: 20
    EvalCase("History/Geography", "What caused World War I?", "history", ("History",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Explain the main causes of the French Revolution.", "history", ("History",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "Who was Ashoka and why is he important?", "history", ("History",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Explain the features of the Harappan civilization.", "history", ("History",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "What was the Industrial Revolution?", "history", ("History",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Why did India start the Non-Cooperation Movement?", "history", ("History",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "Explain nationalism in Europe.", "history", ("History",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "What were the effects of colonialism?", "history", ("History",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Explain the Mughal Empire in brief.", "history", ("History",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "Latest election result in India today.", "general", ("General",), True, "current_events", "General"),
    EvalCase("History/Geography", "Where is India located?", "geography", ("Location",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Why do earthquakes occur near tectonic plate boundaries?", "geography", ("Earth Science",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "Explain how volcanoes are formed.", "geography", ("Earth Science",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "What causes monsoon rainfall in India?", "geography", ("Geography",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Explain the water cycle.", "geography", ("Geography",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "What is erosion?", "geography", ("Earth Science",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Why are rivers important for settlements?", "geography", ("Geography",), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "What is climate change?", "geography", ("Geography",), False, "conceptual", "Social Studies"),
    EvalCase("History/Geography", "Explain latitude and longitude.", "geography", ("Location", "Geography"), False, "explanation", "Social Studies"),
    EvalCase("History/Geography", "What is the capital of Brazil?", "geography", ("Location",), False, "conceptual", "Social Studies"),
]


def model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        try:
            return normalize_for_report(model.model_dump(mode="json"))
        except TypeError:
            return normalize_for_report(model.model_dump())
    if hasattr(model, "dict"):
        return normalize_for_report(model.dict())
    return normalize_for_report(dict(model))


def normalize_for_report(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {key: normalize_for_report(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_for_report(item) for item in value]
    return value


def template_for(subject: str) -> str:
    if subject == "mathematics":
        return "Mathematics"
    if subject in {"physics", "chemistry", "biology"}:
        return "Science"
    if subject == "english":
        return "English"
    if subject in {"history", "geography", "civics", "economics"}:
        return "Social Studies"
    return "General"


def topic_matches(topic: str, subtopic: str, expected_terms: tuple[str, ...]) -> bool:
    if not expected_terms:
        return True
    haystack = f"{topic} {subtopic}".lower()
    return any(term.lower() in haystack for term in expected_terms)


def severity(category: str) -> str:
    if category in {"subject_misclassification", "search_not_triggered", "unexpected_search"}:
        return "critical"
    if category in {"topic_mismatch", "low_confidence", "search_failure", "wrong_template"}:
        return "high"
    if category in {"pattern_memory_mistake", "type_mismatch"}:
        return "medium"
    return "low"


def score_result(result: EvalResult) -> None:
    case = result.case
    failures: list[dict[str, str]] = []

    if result.subject != case.expected_subject:
        failures.append({
            "category": "subject_misclassification",
            "severity": severity("subject_misclassification"),
            "detail": f"expected {case.expected_subject}, got {result.subject}",
        })

    if not topic_matches(result.topic, result.subtopic, case.expected_topic_terms):
        failures.append({
            "category": "topic_mismatch",
            "severity": severity("topic_mismatch"),
            "detail": f"expected topic containing {case.expected_topic_terms}, got {result.topic} / {result.subtopic}",
        })

    if case.expected_type and result.question_type != case.expected_type:
        failures.append({
            "category": "type_mismatch",
            "severity": severity("type_mismatch"),
            "detail": f"expected {case.expected_type}, got {result.question_type}",
        })

    if case.expected_search and not result.search_triggered:
        failures.append({
            "category": "search_not_triggered",
            "severity": severity("search_not_triggered"),
            "detail": "question expected live search but router did not trigger it",
        })

    if not case.expected_search and result.search_triggered:
        failures.append({
            "category": "unexpected_search",
            "severity": severity("unexpected_search"),
            "detail": "stable educational question triggered web search",
        })

    if result.search_triggered and result.search_provider == "disabled":
        failures.append({
            "category": "search_failure",
            "severity": severity("search_failure"),
            "detail": result.search_warning or "search triggered but no live provider is configured",
        })

    if case.expected_template and result.teaching_template != case.expected_template:
        failures.append({
            "category": "wrong_template",
            "severity": severity("wrong_template"),
            "detail": f"expected {case.expected_template}, got {result.teaching_template}",
        })

    if result.knowledge_confidence < 0.7 and not case.expected_search:
        failures.append({
            "category": "low_confidence",
            "severity": severity("low_confidence"),
            "detail": f"knowledge confidence {result.knowledge_confidence}",
        })

    if result.best_pattern:
        pattern_subject = result.best_pattern.get("subject")
        relevance = float(result.best_pattern.get("relevanceScore") or result.best_pattern.get("relevance_score") or 0)
        if pattern_subject != result.subject or relevance < 0.62:
            failures.append({
                "category": "pattern_memory_mistake",
                "severity": severity("pattern_memory_mistake"),
                "detail": f"pattern subject={pattern_subject}, relevance={relevance}",
            })

    correctness = 100
    relevance = 100
    educational_quality = 100
    clarity = 100

    for failure in failures:
        cat = failure["category"]
        if cat == "subject_misclassification":
            correctness -= 55
            relevance -= 45
            educational_quality -= 30
        elif cat in {"search_not_triggered", "unexpected_search"}:
            correctness -= 35
            relevance -= 25
        elif cat == "topic_mismatch":
            correctness -= 22
            relevance -= 30
            educational_quality -= 15
        elif cat == "low_confidence":
            correctness -= 10
            clarity -= 20
        elif cat == "search_failure":
            correctness -= 20
            relevance -= 20
        elif cat == "wrong_template":
            educational_quality -= 30
            clarity -= 10
        elif cat == "pattern_memory_mistake":
            educational_quality -= 15
        elif cat == "type_mismatch":
            clarity -= 10

    if result.teaching_template == "General" and case.expected_subject != "general":
        educational_quality -= 20
    if not result.teaching_strategy:
        educational_quality -= 20
        clarity -= 10
    if result.analyzer_confidence < 0.55:
        clarity -= 15

    result.scores = {
        "correctness": max(0, correctness),
        "relevance": max(0, relevance),
        "educational_quality": max(0, educational_quality),
        "clarity": max(0, clarity),
    }
    result.failures = failures


def evaluate_case(case: EvalCase, engines: dict[str, Any]) -> EvalResult:
    router: SmartKnowledgeRouter = engines["router"]
    analyzer: QuestionAnalyzer = engines["analyzer"]
    patterns: PatternMatchingEngine = engines["patterns"]
    confidence: KnowledgeConfidenceEngine = engines["confidence"]
    merge: KnowledgeMergeEngine = engines["merge"]

    classification = router.classify(case.question)
    search_summary = None
    if classification.requires_search:
        search_summary = router.search(case.question, classification, max_results=3)

    analysis = analyzer.analyze(case.question)
    pattern_matches = patterns.find_similar(case.question, analysis)
    knowledge_confidence = confidence.assess(analysis, pattern_matches)
    retrieved = RetrievedKnowledge(
        internal_notes=[
            "Use Tutorly's strict teaching format.",
            "Generate a relevant practice question after the answer.",
        ],
        previous_patterns=pattern_matches,
        memory_summary=" ".join(case.question.split()[:18]),
        search_summary=search_summary.summary if search_summary else "",
    )
    merged = merge.merge(analysis, retrieved, knowledge_confidence)
    best_pattern = model_dump(pattern_matches[0]) if pattern_matches else None

    result = EvalResult(
        case=case,
        subject=analysis.subject.value,
        topic=analysis.topic,
        subtopic=analysis.sub_topic,
        difficulty=analysis.difficulty.value,
        question_type=analysis.question_type.value,
        analyzer_confidence=analysis.confidence,
        router_category=classification.category,
        router_confidence=round(classification.confidence, 3),
        search_triggered=classification.requires_search,
        search_provider=search_summary.provider if search_summary else None,
        search_results=len(search_summary.results) if search_summary else 0,
        search_warning=search_summary.warning if search_summary else "",
        pattern_match=bool(pattern_matches),
        best_pattern=best_pattern,
        knowledge_confidence=knowledge_confidence.confidence_score,
        teaching_template=template_for(analysis.subject.value),
        teaching_strategy=merged.recommended_teaching_strategy,
        merged_knowledge_preview=merged.merged_knowledge[:400],
        scores={},
    )
    score_result(result)
    return result


def result_to_dict(result: EvalResult) -> dict[str, Any]:
    return {
        "group": result.case.group,
        "question": result.case.question,
        "expected": {
            "subject": result.case.expected_subject,
            "topicTerms": result.case.expected_topic_terms,
            "search": result.case.expected_search,
            "type": result.case.expected_type,
            "template": result.case.expected_template,
        },
        "actual": {
            "subject": result.subject,
            "topic": result.topic,
            "subtopic": result.subtopic,
            "difficulty": result.difficulty,
            "questionType": result.question_type,
            "analyzerConfidence": result.analyzer_confidence,
            "routerCategory": result.router_category,
            "routerConfidence": result.router_confidence,
            "patternMatch": result.pattern_match,
            "bestPattern": result.best_pattern,
            "knowledgeConfidence": result.knowledge_confidence,
            "searchTriggered": result.search_triggered,
            "searchProvider": result.search_provider,
            "searchResults": result.search_results,
            "searchWarning": result.search_warning,
            "teachingTemplate": result.teaching_template,
            "teachingStrategy": result.teaching_strategy,
            "mergedKnowledgePreview": result.merged_knowledge_preview,
        },
        "scores": result.scores,
        "failures": result.failures,
    }


def write_reports(results: list[EvalResult], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "tutorly_evaluation_results.json"
    md_path = output_dir / "tutorly_evaluation_report.md"

    payload = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "caseCount": len(results),
        "summary": build_summary(results),
        "results": [result_to_dict(result) for result in results],
    }
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    md_path.write_text(build_markdown_report(results, payload["summary"]), encoding="utf-8")
    return json_path, md_path


def build_summary(results: list[EvalResult]) -> dict[str, Any]:
    failure_counter = Counter()
    severity_counter = Counter()
    group_totals = Counter(result.case.group for result in results)
    group_failures = Counter()
    score_totals = defaultdict(int)

    for result in results:
        for name, score in result.scores.items():
            score_totals[name] += score
        if result.failures:
            group_failures[result.case.group] += 1
        for failure in result.failures:
            failure_counter[failure["category"]] += 1
            severity_counter[failure["severity"]] += 1

    return {
        "cases": len(results),
        "passed": sum(1 for result in results if not result.failures),
        "failed": sum(1 for result in results if result.failures),
        "averageScores": {
            name: round(total / max(1, len(results)), 1)
            for name, total in sorted(score_totals.items())
        },
        "failureCategories": dict(failure_counter.most_common()),
        "severityCounts": dict(severity_counter),
        "groupFailureRates": {
            group: {
                "failed": group_failures[group],
                "total": total,
                "rate": round(group_failures[group] / total, 3),
            }
            for group, total in sorted(group_totals.items())
        },
    }


def build_markdown_report(results: list[EvalResult], summary: dict[str, Any]) -> str:
    ranked_failures = []
    impact_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    for result in results:
        for failure in result.failures:
            ranked_failures.append((impact_rank[failure["severity"]], result, failure))
    ranked_failures.sort(key=lambda item: (-item[0], item[1].case.group, item[1].case.question))

    lines = [
        "# Tutorly Evaluation Report",
        "",
        f"Generated: {datetime.now(UTC).isoformat()}",
        "",
        "## Summary",
        "",
        f"- Total questions: {summary['cases']}",
        f"- Passed without flags: {summary['passed']}",
        f"- Flagged: {summary['failed']}",
        f"- Average correctness: {summary['averageScores'].get('correctness', 0)}",
        f"- Average relevance: {summary['averageScores'].get('relevance', 0)}",
        f"- Average educational quality: {summary['averageScores'].get('educational_quality', 0)}",
        f"- Average clarity: {summary['averageScores'].get('clarity', 0)}",
        "",
        "## Top Failure Categories",
        "",
    ]

    if summary["failureCategories"]:
        lines.extend(f"- {category}: {count}" for category, count in summary["failureCategories"].items())
    else:
        lines.append("- None")

    lines.extend(["", "## Group Failure Rates", ""])
    for group, data in summary["groupFailureRates"].items():
        lines.append(f"- {group}: {data['failed']}/{data['total']} ({data['rate'] * 100:.1f}%)")

    lines.extend(["", "## Ranked Issues By Impact", ""])
    if ranked_failures:
        for _, result, failure in ranked_failures[:40]:
            lines.append(
                f"- [{failure['severity'].upper()}] {failure['category']} | "
                f"{result.case.group} | {result.case.question} | {failure['detail']}"
            )
    else:
        lines.append("- No issues flagged.")

    lines.extend(["", "## Detailed Results", ""])
    for index, result in enumerate(results, start=1):
        failure_text = "; ".join(f"{item['category']} ({item['severity']})" for item in result.failures) or "None"
        best_pattern = result.best_pattern or {}
        lines.extend([
            f"### {index}. {result.case.group}",
            "",
            f"Question: {result.case.question}",
            "",
            f"- Subject detected: {result.subject}",
            f"- Topic detected: {result.topic} / {result.subtopic}",
            f"- Difficulty detected: {result.difficulty}",
            f"- Question type: {result.question_type}",
            f"- Confidence score: analyzer {result.analyzer_confidence}, knowledge {result.knowledge_confidence}",
            f"- Pattern match: {result.pattern_match}",
            f"- Best pattern: {best_pattern.get('id', '-')}, similarity {best_pattern.get('similarity', '-')}, relevance {best_pattern.get('relevance_score', best_pattern.get('relevanceScore', '-'))}",
            f"- Search triggered: {result.search_triggered}",
            f"- Search provider: {result.search_provider or '-'}",
            f"- Search results: {result.search_results}",
            f"- Teaching template used: {result.teaching_template}",
            f"- Teaching strategy: {result.teaching_strategy}",
            f"- Scores: correctness {result.scores['correctness']}, relevance {result.scores['relevance']}, educational quality {result.scores['educational_quality']}, clarity {result.scores['clarity']}",
            f"- Failures: {failure_text}",
            "",
        ])

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Tutorly's 100-question routing and teaching diagnostics evaluation.")
    parser.add_argument("--output-dir", default=str(ROOT / "tests" / "evaluation_reports"))
    args = parser.parse_args()

    engines = {
        "router": SmartKnowledgeRouter(),
        "analyzer": QuestionAnalyzer(),
        "patterns": PatternMatchingEngine(),
        "confidence": KnowledgeConfidenceEngine(),
        "merge": KnowledgeMergeEngine(),
    }
    results = [evaluate_case(case, engines) for case in CASES]
    json_path, md_path = write_reports(results, Path(args.output_dir))

    summary = build_summary(results)
    print(f"Tutorly evaluation completed: {summary['passed']} passed, {summary['failed']} flagged.")
    print(f"JSON: {json_path}")
    print(f"Report: {md_path}")
    if summary["failureCategories"]:
        print("Top failure categories:")
        for category, count in summary["failureCategories"].items():
            print(f"- {category}: {count}")


if __name__ == "__main__":
    main()
