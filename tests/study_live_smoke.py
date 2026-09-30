"""Opt-in single Groq call with synthetic study notes; no account or private files."""
import asyncio
from pathlib import Path
import sys
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.chatbot.ai import GroqProvider, SemanticTutorService
from backend.chatbot.schemas import LearnerProfile


async def main():
    if '--live' not in sys.argv:
        raise SystemExit('Use --live to make one request to the existing configured Groq provider.')
    load_dotenv(ROOT / 'backend' / '.env')
    result = await SemanticTutorService(GroqProvider()).route_and_answer(
        student_question='Give me a quick check from my motion notes.', conversation_context=[],
        profile=LearnerProfile(grade='9', board='CBSE'), mode='study',
        client_context={'study_session': {'plan_id':'study-live-check','task_id':'task-check','topic':'Motion','topics':['Motion'],'subject':'Science','task_kind':'quiz','action':'quick_check','question_count':2,
            'materials':[{'label':'Synthetic test notes','text':'Speed is distance divided by time. An object travels 20 metres in 4 seconds, so its average speed is 5 metres per second.'}]}})
    print('Generation status:', result.status)
    assert result.provider_used and result.output.study_check, 'No validated study check was returned.'
    assert all(q.topic=='Motion' for q in result.output.study_check.questions)
    assert not result.output.classification.tools.graph_engine
    assert not result.output.classification.tools.diagram_renderer
    print('Validated questions:',len(result.output.study_check.questions))
    print('PASS existing Groq call returns short introduction and structured checks; Study Live Board remains off.')


if __name__=='__main__':
    asyncio.run(main())
