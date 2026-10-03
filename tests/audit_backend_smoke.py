"""Isolated audit regressions; no provider calls, credentials or persistent DB writes."""
import asyncio
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.chatbot.ai.groq import GroqProvider
from backend.chatbot.ai.provider import ProviderFailure
from backend.chatbot.ai.semantic_router import SemanticTutorService, STUDY_SESSION_PROMPT, clean_student_answer
from backend.chatbot.material_test import MaterialTestRequest, generate_material_test
from backend.curriculum_store import catalog, resolve_context
from material_test_smoke import PAYLOAD, QUESTION

class AuditChecks(unittest.TestCase):
    def test_long_response_budget_and_truncation_do_not_silently_salvage_partial_json(self):
        with patch.dict('os.environ', {'TUTORLY_GROQ_MAX_COMPLETION_TOKENS':'3500'}):
            provider=GroqProvider(api_key='synthetic-test-only')
        client=Mock();provider._client=client
        client.chat.completions.create.return_value=SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop',message=SimpleNamespace(content='{"answer":"ok"}'))])
        self.assertEqual(provider._complete([],{},'audit'),{'answer':'ok'})
        self.assertEqual(client.chat.completions.create.call_args.kwargs['max_completion_tokens'],3500)
        client.chat.completions.create.return_value.choices[0].finish_reason='length'
        with self.assertRaises(ProviderFailure) as failure: provider._complete([],{},'audit')
        self.assertEqual(failure.exception.status,'truncated_response')

    def test_depth_and_cell_foundation_guardrails_are_scoped(self):
        prompt=SemanticTutorService._system_prompt()
        self.assertIn('Outside a guided study_session',prompt)
        self.assertIn('common mistakes',prompt)
        self.assertIn('basic structural and functional unit of life',STUDY_SESSION_PROMPT)
        self.assertIn('cell membrane is a PART',STUDY_SESSION_PROMPT)
        self.assertIn('unless the student asks',STUDY_SESSION_PROMPT)
        answer='## Explanation\nA short answer.\n\n### Common Mistakes\nDo not change only one side.'
        self.assertIn('Do not change only one side',clean_student_answer(answer,student_question='Include common mistakes in your explanation.'))
        self.assertNotIn('Do not change only one side',clean_student_answer(answer))

    def test_material_test_resolves_canonical_ids_not_client_labels(self):
        with tempfile.TemporaryDirectory(prefix='tutorly-audit-test-') as directory:
            db=Path(directory)/'curriculum.db'
            data=catalog(board='CBSE',grade='9',academic_year='2026-27',medium='English',database_path=db)
            subject=next(item for item in data['subjects'] if item['name']=='Science')
            book=subject['books'][0];chapter=book['chapters'][0]
            ref={'board':'CBSE','grade':'9','academic_year':'2026-27','medium':'English','subject_id':subject['id'],'book_id':book['id'],'chapter_id':chapter['id']}
            provider=AsyncMock();provider.complete_structured.return_value={'questions':[QUESTION]}
            with patch('backend.curriculum_store.resolve_context',side_effect=lambda **kw:resolve_context(**kw,database_path=db)):
                asyncio.run(generate_material_test(MaterialTestRequest.model_validate({**PAYLOAD,'curriculum_context':ref}),provider))
                supplied=json.loads(provider.complete_structured.call_args.kwargs['messages'][1]['content'])
                self.assertEqual(supplied['curriculum_context']['chapter'],chapter['name'])
                self.assertIn('not treat chapter metadata as teaching content',provider.complete_structured.call_args.kwargs['messages'][0]['content'])
                provider.reset_mock()
                with self.assertRaises(ValueError):
                    asyncio.run(generate_material_test(MaterialTestRequest.model_validate({**PAYLOAD,'curriculum_context':{**ref,'chapter_id':'unverified-or-wrong-grade'}}),provider))
                provider.complete_structured.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
