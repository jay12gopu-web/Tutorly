"""Offline document and generated-check contracts. No live AI or student files."""
import asyncio
from io import BytesIO
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject, DictionaryObject
from backend.chatbot.study_material import extract_pdf, MAX_BYTES
from backend.chatbot.ai.semantic_router import SemanticTutorOutput, StudyCheck, bounded_study_session, fallback_classification


def pdf(text=None, pages=1, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width=300, height=300)
        if text:
            font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
            page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
            stream = DecodedStreamObject(); stream.set_data(f'BT /F1 12 Tf 10 250 Td ({text}) Tj ET'.encode())
            page[NameObject('/Contents')] = writer._add_object(stream)
    if encrypted:
        writer.encrypt('fixture-password')
    output = BytesIO(); writer.write(output); return output.getvalue()


class StudyMaterialTests(unittest.TestCase):
    def test_real_pdf_extraction(self):
        result = extract_pdf(pdf('Speed equals distance divided by time.'))
        self.assertIn('distance divided by time', result['text'])
        self.assertEqual(result['pages'], 1)
        self.assertFalse(result['partial'])

    def test_invalid_blank_encrypted_oversize_and_page_limit(self):
        for payload in (b'not a pdf', b'%PDF-' + b'x' * MAX_BYTES, pdf(), pdf(encrypted=True), pdf(pages=41), b'%PDF-broken'):
            with self.subTest(size=len(payload)), self.assertRaises(ValueError):
                extract_pdf(payload)

    def test_untrusted_notes_are_bounded_and_not_verified(self):
        result = bounded_study_session({'materials': [{'label':'My notes','text':'x'*30000,'verified':True}]*10})
        self.assertEqual(sum(len(item['text']) for item in result['materials']),12000)
        self.assertTrue(all(item['partial'] for item in result['materials']))
        self.assertTrue(all(item['provenance']=='student_supplied_not_verified' for item in result['materials']))

    def test_optional_quiz_invalid_data_cannot_break_existing_chat(self):
        payload = {'classification':fallback_classification().model_dump(mode='json'), 'answer':'A short explanation.', 'spoken_answer':'', 'study_check':{'questions':[{'answer':9}]}}
        result=SemanticTutorOutput.model_validate(payload)
        self.assertIsNone(result.study_check)
        self.assertEqual(result.answer,'A short explanation.')

    def test_valid_check_and_duplicate_choices(self):
        question={'topic':'Motion','question':'Which is a speed unit?','options':['m/s','m'],'answer':0,'explanation':'Speed is distance per time.'}
        self.assertEqual(len(StudyCheck.model_validate({'questions':[question,question]}).questions),2)
        with self.assertRaises(ValueError):
            StudyCheck.model_validate({'questions':[{**question,'options':['Same','same']},question]})

    def test_http_upload_contract_and_expired_auth(self):
        from fastapi import FastAPI, HTTPException
        from fastapi.testclient import TestClient
        from backend.chatbot.routes import router
        app=FastAPI(); app.include_router(router)
        with TestClient(app) as client:
            response=client.post('/api/study/material/extract',files={'file':('notes.pdf',pdf('Motion is a change in position over time.'),'application/pdf')})
            self.assertEqual(response.status_code,200)
            self.assertIn('position',response.json()['text'])
            self.assertNotIn('url',response.json())
            response=client.post('/api/study/material/extract',files={'file':('notes.exe',b'bad','application/octet-stream')})
            self.assertEqual(response.status_code,400)
            with patch('backend.chatbot.routes.authenticated_user_context',side_effect=HTTPException(401,'Expired')):
                response=client.post('/api/study/material/extract',headers={'Authorization':'Bearer fake-fixture'},files={'file':('notes.pdf',pdf('Private test document content.'),'application/pdf')})
                self.assertEqual(response.status_code,401)


if __name__=='__main__':
    unittest.main()
