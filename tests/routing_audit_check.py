from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.chatbot.knowledge_confidence_engine import KnowledgeConfidenceEngine
from backend.chatbot.knowledge_router import DisabledSearchProvider, SmartKnowledgeRouter
from backend.chatbot.pattern_matching_engine import PatternMatchingEngine
from backend.chatbot.question_analyzer import QuestionAnalyzer


CASES = [
    (
        "MATHEMATICS",
        "Solve x² − 5x + 6 = 0",
        "mathematics",
        "Quadratic Equations",
        "numerical",
        "school",
    ),
    (
        "PHYSICS",
        "Why do astronauts appear weightless inside a spacecraft orbiting Earth?",
        "physics",
        "Physics",
        "explanation",
        "balanced",
    ),
    (
        "CHEMISTRY",
        "Why does increasing temperature increase reaction rate?",
        "chemistry",
        "Reaction Rates",
        "explanation",
        "balanced",
    ),
    (
        "BIOLOGY",
        "Explain photosynthesis.",
        "biology",
        "Photosynthesis",
        "explanation",
        "balanced",
    ),
    (
        "HISTORY",
        "What caused World War I?",
        "history",
        "History",
        "conceptual",
        "balanced",
    ),
    (
        "GEOGRAPHY",
        "Why do earthquakes occur near tectonic plate boundaries?",
        "geography",
        "Earth Science",
        "explanation",
        "balanced",
    ),
    (
        "ENGLISH",
        "What is the difference between affect and effect?",
        "english",
        "Vocabulary",
        "conceptual",
        "balanced",
    ),
]


def main() -> None:
    analyzer = QuestionAnalyzer()
    patterns = PatternMatchingEngine()
    confidence = KnowledgeConfidenceEngine()
    router = SmartKnowledgeRouter()

    failures = []
    for label, question, subject, topic, question_type, difficulty in CASES:
        classification = router.classify(question)
        analysis = analyzer.analyze(question)
        matches = patterns.find_similar(question, analysis)
        knowledge = confidence.assess(analysis, matches)

        if classification.requires_search:
            failures.append(f"{label}: stable academic question triggered search")
        if analysis.subject.value != subject:
            failures.append(f"{label}: subject {analysis.subject.value!r} != {subject!r}")
        if analysis.topic != topic:
            failures.append(f"{label}: topic {analysis.topic!r} != {topic!r}")
        if analysis.question_type.value != question_type:
            failures.append(f"{label}: type {analysis.question_type.value!r} != {question_type!r}")
        if analysis.difficulty.value != difficulty:
            failures.append(f"{label}: difficulty {analysis.difficulty.value!r} != {difficulty!r}")
        if knowledge.confidence_score < 0.7:
            failures.append(f"{label}: confidence too low ({knowledge.confidence_score})")

        for match in matches:
            if match.subject.value != analysis.subject.value:
                failures.append(f"{label}: unrelated subject pattern {match.subject.value}")
            if match.relevance_score < 0.62:
                failures.append(f"{label}: low-relevance pattern {match.id}={match.relevance_score}")

    search_router = SmartKnowledgeRouter(provider=DisabledSearchProvider())
    current = search_router.classify("latest NASA mission today")
    if not current.requires_search:
        failures.append("CURRENT_EVENTS: latest NASA mission did not trigger search")
    summary = search_router.search("latest NASA mission today", current)
    if not summary.warning:
        failures.append("SEARCH: disabled provider did not produce structured warning")

    if failures:
        print("Routing audit failed:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)

    print("Routing audit checks passed.")


if __name__ == "__main__":
    main()
