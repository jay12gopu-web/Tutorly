from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class CurriculumSource:
    id: str
    board: str
    name: str
    url: str
    kind: str
    official: bool = True


SOURCE_REGISTRY = {
    "ncert_textbooks": CurriculumSource(
        id="ncert_textbooks",
        board="CBSE",
        name="NCERT Textbook Portal",
        url="https://ncert.nic.in/textbook.php",
        kind="official_textbook_portal",
    ),
    "cbse_academic_2026_27": CurriculumSource(
        id="cbse_academic_2026_27",
        board="CBSE",
        name="CBSE Academic Curriculum 2026-27",
        url="https://cbseacademic.nic.in/curriculum_2027.html",
        kind="official_board_curriculum",
    ),
    "cisce": CurriculumSource("cisce", "CISCE", "CISCE", "https://cisce.org/", "official_board"),
    "maharashtra": CurriculumSource(
        "maharashtra", "MAHARASHTRA", "Maharashtra eBalbharati", "https://ebooks.ebalbharati.in/", "official_textbook_portal"
    ),
    "kerala": CurriculumSource("kerala", "KERALA", "Kerala SCERT", "https://scert.kerala.gov.in/", "official_board"),
    "telangana": CurriculumSource(
        "telangana", "TELANGANA", "Telangana SCERT", "https://scert.telangana.gov.in/", "official_board"
    ),
    "tamil_nadu": CurriculumSource(
        "tamil_nadu", "TAMIL_NADU", "Tamil Nadu Textbook Corporation", "https://textbookcorp.in/", "official_textbook_portal"
    ),
}


def public_source_registry() -> list[dict]:
    return [asdict(source) for source in SOURCE_REGISTRY.values()]
