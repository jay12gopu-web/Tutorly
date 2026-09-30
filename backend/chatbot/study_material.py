"""Bounded, in-memory extraction of student notes. Never stores uploaded files."""
from io import BytesIO

MAX_BYTES = 5 * 1024 * 1024
MAX_TEXT = 24000
MAX_PAGES = 40


def extract_pdf(payload: bytes) -> dict:
    from pypdf import PdfReader

    if not payload or len(payload) > MAX_BYTES or not payload.startswith(b"%PDF-"):
        raise ValueError("Choose a PDF smaller than 5 MB.")
    try:
        reader = PdfReader(BytesIO(payload), strict=True)
        if reader.is_encrypted:
            raise ValueError("This PDF is password protected. Upload an unlocked copy or paste your notes.")
        if len(reader.pages) > MAX_PAGES:
            raise ValueError("Choose up to 40 pages at a time, or paste the section for this exam.")
        parts, size, partial = [], 0, False
        for page in reader.pages:
            content = page.get_contents()
            if content and len(content.get_data()) > 2 * 1024 * 1024:
                raise ValueError("This page is too complex to read safely. Paste the relevant text instead.")
            text = (page.extract_text() or "").replace("\x00", "").strip()
            remaining = MAX_TEXT - size
            parts.append(text[:remaining])
            size += len(text) + 2
            if size >= MAX_TEXT:
                partial = True
                break
        text = "\n\n".join(parts).strip()[:MAX_TEXT]
        if len(text) < 20:
            raise ValueError("No readable text was found. For scanned notes, upload a photo or paste the text.")
        return {"text": text, "partial": partial, "pages": len(reader.pages)}
    except ValueError:
        raise
    except Exception:
        raise ValueError("Tutorly could not read this PDF. Try another file or paste the text.") from None
