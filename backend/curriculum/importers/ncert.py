from __future__ import annotations

import html as html_lib
import io
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from pypdf import PdfReader

try:
    from backend.curriculum.sources import SOURCE_REGISTRY
    from backend.curriculum_store import normalize_text, slug
except ImportError:
    from curriculum.sources import SOURCE_REGISTRY
    from curriculum_store import normalize_text, slug


NCERT_PORTAL = SOURCE_REGISTRY["ncert_textbooks"].url
CBSE_CURRICULUM_2026_27 = SOURCE_REGISTRY["cbse_academic_2026_27"].url
PDF_ROOT = "https://ncert.nic.in/textbook/pdf/"
USER_AGENT = "Tutorly curriculum importer/1.0 (+https://mytutor.co.in)"

# These are selection rules, not curriculum data. Subjects and books are still
# discovered from the official NCERT portal; the rules keep the first production
# snapshot focused on ordinary English-medium school study rather than exemplars,
# lab manuals and vocational job-role manuals.
CORE_SUBJECTS_BY_GRADE = {
    1: {"English", "Mathematics"},
    2: {"English", "Mathematics"},
    3: {"English", "Mathematics", "The World Around Us"},
    4: {"English", "Mathematics", "The World Around Us"},
    5: {"English", "Mathematics", "The World Around Us"},
    6: {"English", "Mathematics", "Science", "Social Science"},
    7: {"English", "Mathematics", "Science", "Social Science"},
    8: {"English", "Mathematics", "Science", "Social Science"},
    9: {"English", "Mathematics", "Science", "Social Science"},
    10: {"English", "Mathematics", "Science", "Social Science"},
    11: {
        "English", "Mathematics", "Physics", "Chemistry", "Biology", "Accountancy",
        "Business Studies", "Economics", "Geography", "History", "Political Science",
        "Computer Science", "Informatics Practices", "Psychology", "Sociology",
    },
    12: {
        "English", "Mathematics", "Physics", "Chemistry", "Biology", "Accountancy",
        "Business Studies", "Economics", "Geography", "History", "Political Science",
        "Computer Science", "Informatics Practices", "Psychology", "Sociology",
    },
}

NON_TEXTBOOK_MARKERS = (
    "exemplar", "examplar", "lab manual", "project book", "coming soon",
    "online chemistry", "reading material",
)


@dataclass(frozen=True)
class PortalBook:
    grade: int
    subject: str
    title: str
    portal_url: str
    book_code: str
    first_chapter: int
    last_chapter: int

    @property
    def part_label(self) -> str:
        match = re.search(r"\b(?:part|bhag)[\s-]*(i{1,3}|[12])\b", self.title, re.I)
        return match.group(0).strip() if match else ""


def _strip_javascript_comments(source: str) -> str:
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return re.sub(r"//[^\n]*", "", source)


def _book_details(portal_value: str) -> tuple[str, int, int] | None:
    absolute = urljoin(NCERT_PORTAL, html_lib.unescape(portal_value))
    query = parse_qs(urlparse(absolute).query)
    if not query:
        return None
    book_code, values = next(iter(query.items()))
    if not values or "-" not in values[0]:
        return None
    start, end = values[0].split("-", 1)
    if not start.isdigit() or not end.isdigit() or int(end) < 1:
        return None
    return book_code.lower(), max(1, int(start)), int(end)


def discover_books(portal_html: str) -> list[PortalBook]:
    """Parse NCERT's own class/subject/book JavaScript without guessing URLs."""
    source = _strip_javascript_comments(portal_html)
    block_pattern = re.compile(
        r"(?:else\s+)?if\s*\(\(document\.test\.tclass\.value\s*==\s*(\d+)\)"
        r"\s*&&\s*\(document\.test\.tsubject\.options\[sind\]\.text\s*==\s*"
        r"[\"']([^\"']+)[\"']\)\)\s*\{(.*?)\n\s*\}",
        re.S,
    )
    text_pattern = re.compile(r"tbook\.options\[(\d+)\]\.text\s*=\s*[\"']([^\"']*)")
    value_pattern = re.compile(r"tbook\.options\[(\d+)\]\.value\s*=\s*[\"']([^\"']+)")
    found: dict[tuple[int, str, str], PortalBook] = {}
    for grade_value, subject_value, block in block_pattern.findall(source):
        grade = int(grade_value)
        if grade < 1 or grade > 12:
            continue
        titles = {int(index): html_lib.unescape(value).strip() for index, value in text_pattern.findall(block)}
        links = {int(index): value.strip() for index, value in value_pattern.findall(block)}
        for index in sorted(set(titles) & set(links)):
            if index == 0 or not titles[index]:
                continue
            details = _book_details(links[index])
            if not details:
                continue
            book_code, first_chapter, last_chapter = details
            book = PortalBook(
                grade=grade,
                subject=html_lib.unescape(subject_value).strip(),
                title=titles[index],
                portal_url=urljoin(NCERT_PORTAL, links[index]),
                book_code=book_code,
                first_chapter=first_chapter,
                last_chapter=last_chapter,
            )
            found[(grade, normalize_text(book.subject), book_code)] = book
    return sorted(found.values(), key=lambda item: (item.grade, normalize_text(item.subject), item.book_code))


def is_english_book(book: PortalBook) -> bool:
    # NCERT's stable textbook code uses the second character for language.
    return len(book.book_code) > 1 and book.book_code[1] == "e"


def select_core_books(books: Iterable[PortalBook]) -> list[PortalBook]:
    selected: list[PortalBook] = []
    for book in books:
        if book.subject not in CORE_SUBJECTS_BY_GRADE.get(book.grade, set()):
            continue
        if not is_english_book(book):
            continue
        if any(marker in book.title.casefold() for marker in NON_TEXTBOOK_MARKERS):
            continue
        selected.append(book)
    return selected


def _request(url: str, timeout: int = 60) -> requests.Response:
    candidates = [url]
    if "https://ncert.nic.in/" in url:
        candidates.append(url.replace("https://ncert.nic.in/", "https://www.ncert.nic.in/", 1))
    elif "https://www.ncert.nic.in/" in url:
        candidates.append(url.replace("https://www.ncert.nic.in/", "https://ncert.nic.in/", 1))
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = requests.get(
                candidates[attempt % len(candidates)],
                timeout=timeout,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.8"},
            )
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            last_error = error
            if attempt < 3:
                time.sleep(0.5 * (attempt + 1))
    assert last_error is not None
    raise last_error


def fetch_portal_html() -> str:
    return _request(NCERT_PORTAL, timeout=45).text


def chapter_pdf_url(book_code: str, number: int) -> str:
    return f"{PDF_ROOT}{book_code}{number:02d}.pdf"


def _pdf_text(content: bytes, pages: int = 2) -> tuple[str, int]:
    reader = PdfReader(io.BytesIO(content))
    selected = reader.pages[: min(pages, len(reader.pages))]
    return "\n".join(page.extract_text() or "" for page in selected), len(reader.pages)


def _clean_lines(text: str) -> list[str]:
    value = unicodedata.normalize("NFKC", text or "").replace("\x00", "")
    lines: list[str] = []
    for raw in value.splitlines():
        line = re.sub(r"\s+", " ", raw).strip(" \t|•")
        if not line or re.fullmatch(r"[ivxlcdm\d]+", line, re.I):
            continue
        if re.search(r"(?:reprint\s+20\d\d|\.indd\b|copyright|isbn)", line, re.I):
            continue
        if lines and normalize_text(lines[-1]) == normalize_text(line):
            continue
        lines.append(line)
    return lines


NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20,
}


def _number_value(value: str) -> int | None:
    clean = normalize_text(value)
    if clean.isdigit():
        return int(clean)
    return NUMBER_WORDS.get(clean)


def _plausible_title(value: str) -> bool:
    clean = re.sub(r"\s+", " ", value).strip(" -–—:;,.\t")
    words = clean.split()
    if len(clean) < 3 or len(clean) > 180 or len(words) > 24:
        return False
    normalized = normalize_text(clean)
    rejected = (
        "foreword", "about the book", "contents", "constitution of india",
        "fundamental duties", "textbook development committee", "acknowledgement",
        "let us sing", "chapter", "unit", "the", "a", "an", "enable you to", "read and find out",
        "before you read", "learning objectives", "studying this chapter should",
        "introduction" if len(words) == 1 else "__never__",
    )
    if normalized in {normalize_text(item) for item in rejected}:
        return False
    if re.fullmatch(r"(?:chapter|unit)\s*\d*", normalized):
        return False
    if normalized.startswith((
        "enable you to", "studying this chapter should", "before you read", "read and find out",
        "after studying this unit", "after studying this chapter", "learning objectives",
        "in this chapter",
    )):
        return False
    normalized_words = normalized.split()
    if len(normalized_words) >= 6:
        trigrams = [tuple(normalized_words[index:index + 3]) for index in range(len(normalized_words) - 2)]
        if len(set(trigrams)) < len(trigrams):
            return False
    return True


def _balanced_title(value: str) -> bool:
    return value.count("(") == value.count(")") and value.count("[") == value.count("]")


def _clean_extracted_title(value: str) -> str:
    clean = re.sub(r"\s+", " ", str(value or "")).strip(" ,.;:–—")
    clean = re.sub(r"^chapter\s+\d{1,2}\s*[:.-]?\s*", "", clean, flags=re.I)
    clean = re.sub(r"\s+let us (?:recite|read|listen)\b.*$", "", clean, flags=re.I)
    clean = re.sub(r"\s+\d{1,4}\s+unit\s+\d+\b.*$", "", clean, flags=re.I)
    clean = re.sub(r"\s+\d{1,4}\s*$", "", clean)
    midpoint = len(clean) // 2
    if len(clean) % 2 == 0 and normalize_text(clean[:midpoint]) == normalize_text(clean[midpoint:]):
        clean = clean[:midpoint]
    return clean.strip(" ,.;:–—")


def _title_quality(value: str) -> int:
    clean = _clean_extracted_title(value)
    normalized = normalize_text(clean)
    words = normalized.split()
    score = 10
    if len(clean) > 90 or len(words) > 14:
        score -= 5
    if clean[:1].islower() or re.match(r"^[,.;:]", str(value or "")):
        score -= 4
    if re.search(
        r"\b(?:foreword|appendix|professor|university|chairperson|member secretary|"
        r"you have learnt|we saw|shows|highlights|helps us|talks of|think it over)\b",
        normalized,
    ):
        score -= 7
    if re.search(r"\bunit\s+\d+\b", normalized):
        score -= 3
    return score


def extract_chapter_title(text: str, chapter_number: int) -> tuple[str, float]:
    lines = _clean_lines(text)
    # Highest-confidence path: the source itself prints "Chapter N" next to its title.
    markers: list[tuple[int, str, re.Match[str]]] = []
    for index, line in enumerate(lines[:45]):
        marker = re.search(r"\bchapter\s+([a-z]+|\d+)\b", line, re.I)
        if marker:
            markers.append((index, line, marker))
    exact = [item for item in markers if _number_value(item[2].group(1)) == chapter_number]
    candidates_to_try = exact or (markers if len(markers) == 1 else [])
    for index, line, marker in candidates_to_try:
        tail = line[marker.end():].strip(" :-–—")
        if _plausible_title(tail):
            return tail, 0.99
        candidates: list[str] = []
        for following in lines[index + 1:index + 5]:
            if re.match(r"^\d+(?:\.\d+)+\s+", following) or len(following) > 120:
                break
            if re.search(r"\bchapter\s+\d+\b", following, re.I):
                break
            candidates.append(re.sub(rf"\s*{chapter_number}\s*$", "", following).strip())
            joined = " ".join(item for item in candidates if item)
            if not _plausible_title(joined) or not _balanced_title(joined):
                continue
            if following.isupper() and index + len(candidates) + 1 < len(lines):
                next_line = lines[index + len(candidates) + 1]
                if next_line.isupper() and not re.match(r"^\d+(?:\.\d+)+", next_line):
                    continue
            return joined.title() if all(item.isupper() for item in candidates) else joined, 0.98

    # Many newer NCERT PDFs put a compact title before the first numbered section.
    candidates = []
    for line in lines[:8]:
        if re.match(r"^\d+(?:\.\d+)+\s+", line):
            break
        clean = re.sub(rf"(?<=[!?A-Za-z]){chapter_number}$", "", line).strip()
        if len(clean) > 115 or clean.endswith(".") and len(clean.split()) > 12:
            break
        candidates.append(clean)
        joined = " ".join(item for item in candidates if item)
        if _plausible_title(joined) and (len(candidates) >= 2 or len(joined.split()) >= 4):
            return joined, 0.75

    return f"Chapter {chapter_number}", 0.0


def _strip_toc_page(value: str) -> str:
    clean = re.sub(r"\s+", " ", value).strip()
    # Some PDF extractors merge a TOC entry with the first subsection in the
    # adjacent column: "Chapter title 27 2.1 Introduction".
    clean = re.sub(r"\s+\d{1,4}\s+\d{1,2}\.\d+\b.*$", "", clean)
    clean = re.sub(r"\s+\d{1,4}\s+(?:A\s*P\s*P\s*E\s*N\s*D\s*I\s*X|APPENDIX)\b.*$", "", clean, flags=re.I)
    clean = re.sub(r"\s+(?:[ivxlcdm]+|\d+(?:[-–]\d+)?)\s*$", "", clean, flags=re.I)
    return clean.strip(" .:-–—")


def _raw_toc_lines(text: str) -> list[str]:
    value = unicodedata.normalize("NFKC", text or "").replace("\x00", "")
    result: list[str] = []
    for raw in value.splitlines():
        line = re.sub(r"\s+", " ", raw).strip(" \t|•")
        if not line:
            continue
        if re.search(r"(?:\.indd\b|reprint\s+20\d\d)", line, re.I):
            continue
        result.append(line)
    return result


def extract_titles_from_prelims(text: str, expected_numbers: Iterable[int]) -> dict[int, str]:
    """Extract only high-confidence, explicitly numbered TOC entries."""
    expected = list(expected_numbers)
    lines = _clean_lines(text)
    content_index = next((index for index, line in enumerate(lines) if normalize_text(line) == "contents"), -1)
    if content_index >= 0:
        after_contents = lines[content_index + 1:]
        lines = after_contents if any(re.match(r"^chapter\s+\d+\b", line, re.I) for line in after_contents) else lines[max(0, content_index - 180):content_index]
    lines = lines[:240]
    found: dict[int, str] = {}

    marker_indexes: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        match = re.match(r"^chapter\s+([a-z]+|\d+)\s*(.*)$", line, re.I)
        if not match:
            continue
        number = _number_value(match.group(1))
        if number in expected:
            marker_indexes.append((index, number, match.group(2).strip()))
    for marker_position, (line_index, number, tail) in enumerate(marker_indexes):
        end = marker_indexes[marker_position + 1][0] if marker_position + 1 < len(marker_indexes) else min(len(lines), line_index + 5)
        direct_title = _strip_toc_page(tail)
        if (normalize_text(direct_title) == "introduction" or _plausible_title(direct_title)) and _balanced_title(direct_title):
            found[number] = direct_title
            continue
        title_parts = [tail] if tail else []
        for following in lines[line_index + 1:end]:
            if re.search(r"(?:\.indd|reprint|learning material|appendix|answers?)", following, re.I):
                break
            title_parts.append(following)
            candidate = _strip_toc_page(" ".join(title_parts))
            if _plausible_title(candidate):
                found[number] = candidate
                break

    if len(found) == len(expected):
        return found

    # Other official TOCs use "1. Title 12" instead of "Chapter 1".
    numbered: dict[int, str] = {}
    numbered_indexes: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        match = re.match(r"^(\d{1,2})[.)]\s+(.+)$", line)
        if not match:
            continue
        number = int(match.group(1))
        if number in expected:
            numbered_indexes.append((index, number, match.group(2)))
    for marker_position, (line_index, number, tail) in enumerate(numbered_indexes):
        end = numbered_indexes[marker_position + 1][0] if marker_position + 1 < len(numbered_indexes) else min(len(lines), line_index + 5)
        parts = [tail]
        for following in lines[line_index + 1:end]:
            if re.search(r"(?:\.indd|reprint|puzzles?|learning material)", following, re.I):
                break
            parts.append(following)
        title = _strip_toc_page(" ".join(parts))
        if _plausible_title(title) and _balanced_title(title):
            numbered[number] = title
    if len(numbered) == len(expected):
        return numbered

    # Primary readers often list lesson titles under Units without chapter numbers.
    raw_lines = _raw_toc_lines(text)
    raw_index = next((index for index, line in enumerate(raw_lines) if normalize_text(line) == "contents"), -1)
    if raw_index >= 0:
        after_contents = raw_lines[raw_index + 1:raw_index + 180]
        raw_lines = after_contents if any(re.match(r"^chapter\s+\d+\b", line, re.I) for line in after_contents) else raw_lines[max(0, raw_index - 180):raw_index]
    # In some older two-column PDFs, extraction emits every "Chapter N" cell
    # first and then every title cell. The visual ordering is still reliable,
    # even though the extracted chapter-number column can be interleaved.
    marker_positions = [
        (index, int(match.group(1)))
        for index, line in enumerate(raw_lines)
        if (match := re.fullmatch(r"chapter\s+(\d{1,2})", line, re.I))
        and int(match.group(1)) in expected
    ]
    if {number for _, number in marker_positions} == set(expected):
        after_markers = max(index for index, _ in marker_positions) + 1
        column_titles: list[str] = []
        for line in raw_lines[after_markers:]:
            if re.match(r"^(?:appendix|suggested readings?|answers?)\b", line, re.I):
                continue
            match = re.match(r"^(.*?)\s+(\d{1,4})$", line)
            if not match:
                if column_titles:
                    break
                continue
            candidate = _strip_toc_page(match.group(1))
            if _plausible_title(candidate) and _balanced_title(candidate):
                column_titles.append(candidate)
                if len(column_titles) == len(expected):
                    return dict(zip(expected, column_titles))
    # Unit-based readers restart chapter numbering inside every unit. PDF filenames
    # preserve the global order, so those titles are verified from each chapter page
    # instead of trusting the column order produced by PDF text extraction.
    if any(re.match(r"^unit\s+\d+\b", line, re.I) for line in raw_lines):
        return found
    entries: list[str] = []
    pending: list[str] = []
    for line in raw_lines:
        normalized = normalize_text(line)
        if normalized in {"foreword", "about the book", "acknowledgements", "acknowledgments"}:
            pending = []
            continue
        if re.match(r"^unit\s+\d+\b", line, re.I):
            pending = []
            continue
        if re.search(r"(?:learning material|appendix|answers?|puzzles?)", line, re.I):
            break
        if entries and re.match(r"^(?:and|or|of|the|a|an)\b", line, re.I) and not re.search(r"\s\d+\s*$", line):
            entries[-1] = f"{entries[-1]} {line}".strip()
            continue
        standalone_page = re.fullmatch(r"\d{1,4}", line)
        page_suffix = re.match(r"^(.*?)\s+(\d{1,4})$", line)
        if standalone_page and pending:
            candidate = " ".join(pending)
            pending = []
        elif page_suffix:
            candidate = " ".join([*pending, page_suffix.group(1)]).strip()
            pending = []
        else:
            pending.append(line)
            continue
        candidate = _strip_toc_page(candidate)
        if _plausible_title(candidate) and normalize_text(candidate) not in {"foreword", "about the book"}:
            entries.append(candidate)
    if len(entries) == len(expected) and all(_balanced_title(item) for item in entries):
        return dict(zip(expected, entries))
    return found


def _chapter_from_toc(book: PortalBook, number: int, title: str, academic_year: str, verified_at: str) -> dict[str, Any]:
    book_id = f"cbse:{academic_year}:g{book.grade}:en:{slug(book.subject)}:{book.book_code}"
    return {
        "id": f"{book_id}:ch-{number}",
        "chapter_number": str(number),
        "chapter_name": title,
        "sort_order": number,
        "source_url": chapter_pdf_url(book.book_code, number),
        "source_page": 1,
        "verification_status": "verified",
        "last_verified_at": verified_at,
        "active": True,
        "topics": [],
        "diagrams": [],
        "import_confidence": 0.97,
        "title_source": f"{PDF_ROOT}{book.book_code}ps.pdf",
    }


def _prelim_titles(book: PortalBook) -> dict[int, str]:
    url = f"{PDF_ROOT}{book.book_code}ps.pdf"
    response = _request(url, timeout=75)
    text, _page_count = _pdf_text(response.content, pages=40)
    return extract_titles_from_prelims(text, range(book.first_chapter, book.last_chapter + 1))


def _diagram_type(subject: str, caption: str) -> str:
    value = normalize_text(f"{subject} {caption}")
    if "circuit" in value:
        return "circuit_diagram"
    if subject == "Mathematics":
        return "geometry_diagram"
    if subject in {"Science", "Physics"}:
        return "physics_diagram"
    if subject == "Chemistry":
        return "chemistry_diagram"
    if subject == "Biology":
        return "biology_diagram"
    if subject in {"Geography", "Social Science", "History"}:
        return "map_or_process_diagram"
    return "educational_diagram"


def extract_diagram_candidates(text: str, *, subject: str, chapter_id: str, source_url: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in re.finditer(r"\bFig(?:ure)?\.?\s*([\d.]+)\s*[:\-–—]?\s*([^\n]{3,100})", text, re.I):
        caption = re.sub(r"\s+", " ", match.group(2)).strip(" .")
        if not _plausible_title(caption):
            continue
        normalized = normalize_text(caption)
        if normalized in seen:
            continue
        seen.add(normalized)
        candidates.append({
            "id": f"{chapter_id}:diagram:{len(candidates) + 1}",
            "diagram_title": caption,
            "diagram_type": _diagram_type(subject, caption),
            "important_labels": [],
            "source_url": source_url,
            "source_page": None,
            "reuse_allowed": False,
            "verification_status": "needs_review",
            "last_verified_at": None,
            "active": True,
        })
        if len(candidates) >= 8:
            break
    return candidates


def _chapter_record(book: PortalBook, number: int, academic_year: str, verified_at: str) -> dict[str, Any]:
    source_url = chapter_pdf_url(book.book_code, number)
    book_id = f"cbse:{academic_year}:g{book.grade}:en:{slug(book.subject)}:{book.book_code}"
    chapter_id = f"{book_id}:ch-{number}"
    try:
        response = _request(source_url, timeout=75)
        text, _page_count = _pdf_text(response.content, pages=2)
        title, confidence = extract_chapter_title(text, number)
        status = "verified" if confidence >= 0.9 else "needs_review"
        return {
            "id": chapter_id,
            "chapter_number": str(number),
            "chapter_name": title,
            "sort_order": number,
            "source_url": source_url,
            "source_page": 1,
            "verification_status": status,
            "last_verified_at": verified_at if status == "verified" else None,
            "active": True,
            "topics": [],
            "diagrams": extract_diagram_candidates(text, subject=book.subject, chapter_id=chapter_id, source_url=source_url),
            "import_confidence": confidence,
        }
    except Exception as error:
        return {
            "id": chapter_id,
            "chapter_number": str(number),
            "chapter_name": f"Chapter {number}",
            "sort_order": number,
            "source_url": source_url,
            "source_page": None,
            "verification_status": "needs_review",
            "last_verified_at": None,
            "active": True,
            "topics": [],
            "diagrams": [],
            "import_error": type(error).__name__,
            "import_confidence": 0.0,
        }


def validate_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Downgrade uncertain or conflicting extraction; never auto-publish it."""
    conflicts: list[dict[str, Any]] = []
    for subject in snapshot.get("subjects") or []:
        for book in subject.get("books") or []:
            verified_by_name: dict[str, list[dict[str, Any]]] = {}
            for chapter in book.get("chapters") or []:
                if chapter.get("verification_status") != "verified":
                    continue
                if not _plausible_title(str(chapter.get("chapter_name") or "")):
                    chapter["verification_status"] = "needs_review"
                    chapter["last_verified_at"] = None
                    chapter["validation_issue"] = "title_failed_quality_gate"
                    continue
                verified_by_name.setdefault(normalize_text(chapter["chapter_name"]), []).append(chapter)
            for normalized_name, matches in verified_by_name.items():
                if len(matches) < 2:
                    continue
                conflicts.append({
                    "book_code": book["book_code"],
                    "normalized_chapter_name": normalized_name,
                    "chapter_numbers": [chapter["chapter_number"] for chapter in matches],
                })
                for chapter in matches:
                    chapter["verification_status"] = "needs_review"
                    chapter["last_verified_at"] = None
                    chapter["validation_issue"] = "duplicate_verified_title"
            book["verification_status"] = (
                "verified" if any(chapter.get("verification_status") == "verified" for chapter in book.get("chapters") or [])
                else "needs_review"
            )
            if book["verification_status"] == "needs_review":
                book["last_verified_at"] = None
        subject["verification_status"] = (
            "verified" if any(book.get("verification_status") == "verified" for book in subject.get("books") or [])
            else "needs_review"
        )
        if subject["verification_status"] == "needs_review":
            subject["last_verified_at"] = None

    chapters = [
        chapter for subject in snapshot.get("subjects") or []
        for book in subject.get("books") or [] for chapter in book.get("chapters") or []
    ]
    counts = snapshot.setdefault("metadata", {}).setdefault("counts", {})
    counts["verified_chapters"] = sum(chapter.get("verification_status") == "verified" for chapter in chapters)
    counts["needs_review_chapters"] = sum(chapter.get("verification_status") == "needs_review" for chapter in chapters)
    snapshot["metadata"]["validation"] = {
        "conflicts": conflicts,
        "conflict_count": len(conflicts),
        "uncertain_records_are_withheld": True,
    }
    return snapshot


def reconcile_snapshots(primary: dict[str, Any], references: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Use agreement across official-source import runs; disagreements require review."""
    snapshots = [primary, *list(references)]
    indexes = [
        {
            chapter["id"]: chapter
            for subject in snapshot.get("subjects") or []
            for book in subject.get("books") or []
            for chapter in book.get("chapters") or []
        }
        for snapshot in snapshots
    ]
    disagreements: list[dict[str, Any]] = []
    primary_index = indexes[0]
    for chapter_id, chapter in primary_index.items():
        verified = [index[chapter_id] for index in indexes if index.get(chapter_id, {}).get("verification_status") == "verified"]
        if not verified:
            continue
        by_title: dict[str, list[dict[str, Any]]] = {}
        for candidate in verified:
            candidate = {**candidate, "chapter_name": _clean_extracted_title(candidate["chapter_name"])}
            by_title.setdefault(normalize_text(candidate["chapter_name"]), []).append(candidate)
        ranked = sorted(by_title.items(), key=lambda item: len(item[1]), reverse=True)
        winner: dict[str, Any] | None = None
        if len(ranked) > 1 and len(ranked[0][1]) == len(ranked[1][1]):
            scored = sorted(
                ((max(_title_quality(item["chapter_name"]) for item in items), items[0]) for _, items in ranked),
                key=lambda item: item[0],
                reverse=True,
            )
            if len(scored) == 1 or scored[0][0] - scored[1][0] >= 4:
                winner = scored[0][1]
            else:
                chapter["verification_status"] = "needs_review"
                chapter["last_verified_at"] = None
                chapter["validation_issue"] = "official_import_runs_disagree"
                disagreements.append({
                    "chapter_id": chapter_id,
                    "chapter_number": chapter.get("chapter_number"),
                    "candidates": [items[0]["chapter_name"] for _, items in ranked],
                })
                continue
        elif len(ranked[0][1]) >= 2:
            winner = ranked[0][1][0]
        elif chapter.get("verification_status") == "verified":
            winner = ranked[0][1][0]
        if winner:
            chapter.update({
                "chapter_name": winner["chapter_name"],
                "verification_status": "verified",
                "last_verified_at": winner.get("last_verified_at"),
                "import_confidence": winner.get("import_confidence"),
            })
            chapter.pop("validation_issue", None)

    result = validate_snapshot(primary)
    validation = result["metadata"]["validation"]
    validation["source_disagreements"] = disagreements
    validation["source_disagreement_count"] = len(disagreements)
    validation["conflict_count"] += len(disagreements)
    return result


def build_snapshot(
    *,
    academic_year: str = "2026-27",
    books: Iterable[PortalBook] | None = None,
    workers: int = 8,
) -> dict[str, Any]:
    verified_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    all_books = list(books) if books is not None else select_core_books(discover_books(fetch_portal_html()))
    chapter_results: dict[tuple[str, int], dict[str, Any]] = {}
    preliminary_titles: dict[str, dict[int, str]] = {}
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 10))) as executor:
        futures = {executor.submit(_prelim_titles, book): book for book in all_books}
        for future in as_completed(futures):
            book = futures[future]
            try:
                preliminary_titles[book.book_code] = future.result()
            except Exception:
                preliminary_titles[book.book_code] = {}

    jobs: list[tuple[PortalBook, int]] = []
    for book in all_books:
        titles = preliminary_titles.get(book.book_code, {})
        for number in range(book.first_chapter, book.last_chapter + 1):
            if title := titles.get(number):
                chapter_results[(book.book_code, number)] = _chapter_from_toc(
                    book, number, title, academic_year, verified_at
                )
            else:
                jobs.append((book, number))
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 12))) as executor:
        futures = {
            executor.submit(_chapter_record, book, number, academic_year, verified_at): (book, number)
            for book, number in jobs
        }
        for future in as_completed(futures):
            book, number = futures[future]
            chapter_results[(book.book_code, number)] = future.result()

    grouped: dict[tuple[int, str], list[PortalBook]] = {}
    for book in all_books:
        grouped.setdefault((book.grade, book.subject), []).append(book)

    subjects: list[dict[str, Any]] = []
    for subject_order, ((grade, subject_name), subject_books) in enumerate(sorted(grouped.items()), start=1):
        subject_id = f"cbse:{academic_year}:g{grade}:en:{slug(subject_name)}"
        public_books: list[dict[str, Any]] = []
        for book_order, book in enumerate(subject_books, start=1):
            chapters = [chapter_results[(book.book_code, number)] for number in range(book.first_chapter, book.last_chapter + 1)]
            verified_chapters = [item for item in chapters if item["verification_status"] == "verified"]
            book_status = "verified" if verified_chapters else "needs_review"
            public_books.append({
                "id": f"{subject_id}:{book.book_code}",
                "title": book.title,
                "part_label": book.part_label,
                "book_code": book.book_code,
                "sort_order": book_order,
                "source_url": book.portal_url,
                "verification_status": book_status,
                "last_verified_at": verified_at if book_status == "verified" else None,
                "active": True,
                "chapters": chapters,
            })
        subject_status = "verified" if any(book["verification_status"] == "verified" for book in public_books) else "needs_review"
        subjects.append({
            "id": subject_id,
            "board": "CBSE",
            "academic_year": academic_year,
            "grade": grade,
            "medium": "English",
            "name": subject_name,
            "sort_order": subject_order,
            "source_id": "ncert_textbooks",
            "source_url": NCERT_PORTAL,
            "verification_status": subject_status,
            "last_verified_at": verified_at if subject_status == "verified" else None,
            "active": True,
            "books": public_books,
        })

    chapters = [chapter for subject in subjects for book in subject["books"] for chapter in book["chapters"]]
    diagrams = [diagram for chapter in chapters for diagram in chapter["diagrams"]]
    snapshot = {
        "metadata": {
            "board": "CBSE",
            "academic_year": academic_year,
            "medium": "English",
            "generated_at": verified_at,
            "scope": "official NCERT core English-medium textbooks",
            "copyright_note": "Only curriculum metadata and source references are stored; textbook prose and artwork are not copied.",
            "counts": {
                "grades": len({subject["grade"] for subject in subjects}),
                "subjects": len(subjects),
                "books": sum(len(subject["books"]) for subject in subjects),
                "chapters": len(chapters),
                "verified_chapters": sum(item["verification_status"] == "verified" for item in chapters),
                "needs_review_chapters": sum(item["verification_status"] == "needs_review" for item in chapters),
                "topics": sum(len(item["topics"]) for item in chapters),
                "diagram_candidates_needing_review": len(diagrams),
                "chapter_titles_from_official_contents": sum(
                    item.get("import_confidence") == 0.97 for item in chapters
                ),
            },
        },
        "sources": [
            {
                "id": "ncert_textbooks", "board": "CBSE", "name": "NCERT Textbook Portal",
                "url": NCERT_PORTAL, "kind": "official_textbook_portal", "official": True,
            },
            {
                "id": "cbse_academic_2026_27", "board": "CBSE", "name": "CBSE Academic Curriculum 2026-27",
                "url": CBSE_CURRICULUM_2026_27, "kind": "official_board_curriculum", "official": True,
            },
        ],
        "subjects": subjects,
    }
    return validate_snapshot(snapshot)


def write_snapshot(snapshot: dict[str, Any], path: Path) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
