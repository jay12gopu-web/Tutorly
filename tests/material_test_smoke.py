"""No secrets or real student documents. Provider and HTTP failure contracts."""
import asyncio
import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.chatbot.material_test import MaterialTestRequest, generate_material_test
from backend.chatbot.ai.provider import ProviderFailure

SOURCE='Speed is distance divided by time. A car travels 20 metres in 4 seconds, so its speed is 5 metres per second.'
PAYLOAD={'materials':[{'id':'notes-1','label':'Motion notes','text':SOURCE}], 'question_count':5}
QUESTION={'type':'objective','source_id':'notes-1','source_quote':'Speed is distance divided by time.', 'concept':'Speed',
          'question':'What is the speed of the car?', 'options':['5 m/s','80 m/s'], 'answer':0,'answer_guide':'',
          'explanation':'20 divided by 4 equals 5.','hint':'Divide distance by time.'}


class MaterialTestChecks(unittest.TestCase):
    def generate(self,question=QUESTION,payload=PAYLOAD):
        provider=AsyncMock(); provider.complete_structured.return_value={'questions':[question]}
        result=asyncio.run(generate_material_test(MaterialTestRequest.model_validate(payload),provider))
        self.assertIn('untrusted',provider.complete_structured.call_args.kwargs['messages'][0]['content'])
        return result

    def test_valid_grounded_question_and_honest_short_paper(self):
        result=self.generate()
        self.assertEqual(result['questions'][0]['correctText'],'5 m/s')
        self.assertIn('fewer than',result['notice'])
        self.assertEqual(result['source'],'student_material')

    def test_invalid_source_quote_answer_or_duplicate_choices(self):
        for change in ({'source_id':'invented'},{'source_quote':'This sentence is not in the notes.'},{'answer':4},{'options':['Same','same']},{'question':'x'}):
            with self.subTest(change=change),self.assertRaises(ValueError): self.generate({**QUESTION,**change})

    def test_written_question_is_not_automatically_graded(self):
        written={**QUESTION,'type':'subjective','options':[],'answer':None,'answer_guide':'Distance divided by time.'}
        with self.assertRaises(ValueError): self.generate(written)
        self.assertIsNone(self.generate(written,{**PAYLOAD,'include_subjective':True})['questions'][0]['answer'])

    def test_request_bounds_and_duplicate_source_ids(self):
        for payload in ({**PAYLOAD,'question_count':100},{'materials':[]},{'materials':PAYLOAD['materials']*2},
                        {'materials':[{'id':'x','label':'a','text':'x'*24001}]}, {**PAYLOAD,'question_count':True}):
            with self.assertRaises(ValueError): MaterialTestRequest.model_validate(payload)

    def test_duplicate_questions_rejected(self):
        provider=AsyncMock();provider.complete_structured.return_value={'questions':[QUESTION,copy.deepcopy(QUESTION)]}
        with self.assertRaises(ValueError): asyncio.run(generate_material_test(MaterialTestRequest.model_validate(PAYLOAD),provider))

    def test_http_success_failure_auth_and_redaction(self):
        from fastapi import FastAPI,HTTPException
        from fastapi.testclient import TestClient
        from backend.chatbot.routes import router
        app=FastAPI();app.include_router(router)
        with TestClient(app) as client, patch('backend.chatbot.routes.material_test_limiter.check') as limiter:
            limiter.return_value.allowed=True
            with patch('backend.chatbot.routes.orchestrator.semantic_tutor.provider.complete_structured',new=AsyncMock(return_value={'questions':[QUESTION]})):
                response=client.post('/api/tests/generate',json=PAYLOAD);self.assertEqual(response.status_code,200)
                self.assertEqual(response.json()['questions'][0]['chapterName'],'Motion notes')
            with patch('backend.chatbot.routes.authenticated_user_context',side_effect=HTTPException(401,'Expired')):
                self.assertEqual(client.post('/api/tests/generate',json=PAYLOAD,headers={'Authorization':'Bearer fixture'}).status_code,401)
            for error,expected in ((ProviderFailure('not_configured'),503),(ValueError(SOURCE),502)):
                with patch('backend.chatbot.routes.generate_material_test',new=AsyncMock(side_effect=error)):
                    response=client.post('/api/tests/generate',json=PAYLOAD);self.assertEqual(response.status_code,expected)
                    self.assertNotIn(SOURCE,response.text)
            limiter.return_value.allowed=False;limiter.return_value.retry_after_seconds=30
            self.assertEqual(client.post('/api/tests/generate',json=PAYLOAD).status_code,429)


if __name__=='__main__': unittest.main()
