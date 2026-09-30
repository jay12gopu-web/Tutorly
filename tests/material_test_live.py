"""Opt-in synthetic material test against the already-configured Tutorly provider."""
import asyncio
from pathlib import Path
import sys

if '--live' not in sys.argv:
    raise SystemExit('Use --live to make one provider call with synthetic study notes.')
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from dotenv import load_dotenv
load_dotenv(root/'backend'/'.env')
from backend.chatbot.ai.groq import GroqProvider
from backend.chatbot.material_test import MaterialTestRequest,generate_material_test

async def run():
    provider=GroqProvider()
    result=await generate_material_test(MaterialTestRequest(
        materials=[{'id':'motion','label':'Synthetic Motion notes','text':(
            'Speed is distance divided by time. The SI unit of speed is metres per second. '
            'A car travels 20 metres in 4 seconds, so its speed is 5 metres per second. '
            'An object at rest has zero speed. An object travelling equal distances in equal time intervals has uniform speed. '
            'Average speed is total distance divided by total time.')}],question_count=5,grade='9'),provider)
    assert 1 <= len(result['questions']) <= 5
    assert all(item['chapterId']=='motion' for item in result['questions'])
    print('PASS existing Tutorly provider generated',len(result['questions']),'source-validated questions from synthetic notes.')

asyncio.run(run())
