import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.chatbot.orchestrator import ChatbotOrchestrator
from backend.chatbot.groq_tutor import GroqTutor
from backend.chatbot.knowledge_router import SearchResult, SmartKnowledgeRouter
from backend.chatbot.knowledge_confidence_engine import KnowledgeConfidenceEngine
from backend.chatbot.pattern_matching_engine import PatternMatchingEngine
from backend.chatbot.question_analyzer import QuestionAnalyzer
from backend.chatbot.schemas import Attachment, ChatMode, ChatbotRequest, LearnerProfile, ResponseStage, SubjectArea, TeachingFeedbackRequest
from backend.chatbot.teaching_success import TeachingSuccessScore


class FakeSearchProvider:
    name = "fake"

    def __init__(self) -> None:
        self.calls = 0

    def search(self, query: str, *, max_results: int = 5):
        self.calls += 1
        return [
            SearchResult(
                title="Latest study result",
                url="https://example.com/latest-study-result",
                snippet="A concise current-information summary for testing.",
                source="Fake Search",
            )
        ]


async def main() -> None:
    router = SmartKnowledgeRouter(provider=FakeSearchProvider())
    math_route = router.classify("Solve x^2 - 5x + 6 = 0")
    assert math_route.requires_search is False
    assert math_route.category == "Mathematics"

    science_route = router.classify("Explain photosynthesis")
    assert science_route.requires_search is False
    assert science_route.category in {"Science", "General Education"}

    current_electricity_route = router.classify("Explain current electricity")
    assert current_electricity_route.requires_search is False
    assert current_electricity_route.category == "Science"

    current_route = router.classify("Latest NASA mission this week")
    assert current_route.requires_search is True
    assert current_route.category in {"Recent Science and Technology", "Current Events"}
    current_summary = router.search("Latest NASA mission this week", current_route)
    assert current_summary.has_results
    assert "latest-study-result" in current_summary.sources_markdown()

    analyzer = QuestionAnalyzer()
    word_problem = analyzer.analyze("Sarah has three times as many pencils as Tom. Together they have 48 pencils. How many pencils does each person have?")
    assert word_problem.subject == SubjectArea.mathematics
    assert word_problem.topic == "Algebra"
    assert word_problem.question_type.value == "problem_solving"

    geometry_word_problem = analyzer.analyze("The area of a rectangular garden is 84 square meters and the length is 5 meters longer than the width.")
    assert geometry_word_problem.subject == SubjectArea.mathematics
    assert geometry_word_problem.topic == "Geometry Word Problem"
    assert geometry_word_problem.sub_topic == "Quadratic Equation from Area"

    patterns = PatternMatchingEngine()
    matches = patterns.find_similar("A car travels 300 km in 5 hours. Find speed.", analyzer.analyze("A car travels 300 km in 5 hours. Find speed."))
    assert matches
    assert "Speed" in matches[0].solution_pattern or "Distance" in matches[0].solution_pattern

    confidence = KnowledgeConfidenceEngine().assess(word_problem, matches)
    assert confidence.confidence_score >= 0.7
    assert confidence.requires_additional_knowledge is False

    orchestrator = ChatbotOrchestrator()

    math_response = await orchestrator.respond(
        ChatbotRequest(
            user_id="smoke",
            message="solve 2 + 2",
            mode=ChatMode.deep,
        )
    )
    assert math_response.subject == SubjectArea.mathematics
    assert "Final answer" in math_response.answer
    assert math_response.tool_calls

    geo_response = await orchestrator.respond(
        ChatbotRequest(
            user_id="smoke",
            message="where is India located",
            mode=ChatMode.prime,
        )
    )
    assert geo_response.subject in {SubjectArea.geography, SubjectArea.general_knowledge}
    assert geo_response.study_resources

    stages = []
    async for event in orchestrator.stream(
        ChatbotRequest(
            user_id="smoke",
            message="explain germination concept",
            mode=ChatMode.study,
        )
    ):
        stages.append(event.stage)

    assert ResponseStage.understanding in stages
    assert ResponseStage.final in stages
    assert stages[-1] == ResponseStage.final

    feedback = TeachingSuccessScore(analyzer=orchestrator.analyzer, patterns=orchestrator.patterns).record(
        TeachingFeedbackRequest(
            user_id="smoke",
            prompt="Explain photosynthesis",
            answer="### Final Answer\nPlants make food.\n### Practice Question\nWhy do plants need chlorophyll?",
            feedback_type="understood",
        )
    )
    assert feedback.ok
    assert feedback.success_score > 0.9

    refused = await orchestrator.respond(
        ChatbotRequest(
            user_id="smoke",
            message="Who will win tomorrow's cricket match?",
            mode=ChatMode.prime,
        )
    )
    assert "designed to help students learn" in refused.answer
    assert refused.metadata["scope"]["allowed"] is False

    allowed_civics = await orchestrator.respond(
        ChatbotRequest(
            user_id="smoke",
            message="For Class 8 civics, explain how voting works in a democracy.",
            mode=ChatMode.prime,
        )
    )
    assert allowed_civics.metadata["scope"]["allowed"] is True

    generic_request = await orchestrator.respond(
        ChatbotRequest(user_id="smoke", message="Tell me a joke.", mode=ChatMode.prime)
    )
    assert generic_request.metadata["scope"]["allowed"] is False

    offline_groq = GroqTutor(api_key="")
    prompt_messages = offline_groq._messages(
        "Explain Newton's second law for Class 6.",
        analyzer.analyze("Explain Newton's second law for Class 6."),
        LearnerProfile(grade="Class 6"),
        orchestrator.modes.get(ChatMode.prime),
        [],
    )
    assert "world-class educational tutor" in prompt_messages[0]["content"]
    assert "### Practice Question" in prompt_messages[0]["content"]
    vision_messages = offline_groq._messages(
        "What does this diagram show?",
        analyzer.analyze("What does this diagram show?"),
        LearnerProfile(grade="Class 6"),
        orchestrator.modes.get(ChatMode.lens),
        [Attachment(type="image", metadata={"data_url": "data:image/png;base64,ZmFrZQ=="})],
    )
    assert isinstance(vision_messages[1]["content"], list)
    assert vision_messages[1]["content"][1]["type"] == "image_url"
    offline_result = await offline_groq.compose(
        message="Explain Newton's second law for Class 6.",
        analysis=analyzer.analyze("Explain Newton's second law for Class 6."),
        profile=LearnerProfile(grade="Class 6"),
        strategy=orchestrator.modes.get(ChatMode.prime),
        attachments=[],
        fallback="local fallback",
    )
    assert offline_result.answer == "local fallback"
    assert offline_result.provider_used is False

    captured_groq_call = {}
    mock_groq = GroqTutor(api_key="test-key", model="text-model")
    mock_groq.vision_model = "vision-model"

    def fake_complete(messages, temperature, model):
        captured_groq_call["messages"] = messages
        captured_groq_call["model"] = model
        return """### Direct Answer
Final answer: Force equals mass times acceleration.
### Step-by-Step Explanation
1. Use F = ma.
2. Multiply mass by acceleration.
### Example
A 2 kg object accelerating at 3 m/s² needs 6 N.
### Common Mistake
Do not confuse mass with weight.
### Quick Recap
- Force causes acceleration.
- Mass changes the required force.
### Practice Question
What force is needed for a 4 kg object to accelerate at 2 m/s²?"""

    mock_groq._complete = fake_complete
    generated = await mock_groq.compose(
        message="Explain Newton's second law.",
        analysis=analyzer.analyze("Explain Newton's second law."),
        profile=LearnerProfile(grade="Class 6"),
        strategy=orchestrator.modes.get(ChatMode.prime),
        attachments=[],
        fallback="local fallback",
    )
    assert generated.provider_used is True
    assert generated.status == "generated"
    assert captured_groq_call["model"] == "text-model"

    vision_generated = await mock_groq.compose(
        message="Explain this science diagram.",
        analysis=analyzer.analyze("Explain this science diagram."),
        profile=LearnerProfile(grade="Class 6"),
        strategy=orchestrator.modes.get(ChatMode.lens),
        attachments=[Attachment(type="image", metadata={"data_url": "data:image/png;base64,ZmFrZQ=="})],
        fallback="local fallback",
    )
    assert vision_generated.provider_used is True
    assert captured_groq_call["model"] == "vision-model"


if __name__ == "__main__":
    asyncio.run(main())
    print("Chatbot backend smoke checks passed.")
