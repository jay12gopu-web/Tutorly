from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

try:
    from backend.curriculum.sources import public_source_registry
    from backend.curriculum_store import DEFAULT_ACADEMIC_YEAR, catalog, coverage
except ImportError:
    from curriculum.sources import public_source_registry
    from curriculum_store import DEFAULT_ACADEMIC_YEAR, catalog, coverage


router = APIRouter(prefix="/api/curriculum", tags=["curriculum"])


@router.get("/catalog")
def get_catalog(
    board: str = Query(..., min_length=2, max_length=80),
    grade: str = Query(..., min_length=1, max_length=20),
    academic_year: str = Query(DEFAULT_ACADEMIC_YEAR, min_length=7, max_length=9),
    medium: str = Query("English", min_length=2, max_length=80),
):
    try:
        return catalog(board=board, grade=grade, academic_year=academic_year, medium=medium)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None


@router.get("/coverage")
def get_coverage():
    return coverage()


@router.get("/sources")
def get_sources():
    return {"sources": public_source_registry()}
