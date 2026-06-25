"""
Diccionario EN→ES offline.

Lee la tabla `dictionary_entries` (poblada por scripts/import_dictionary.py) y
expone dos operaciones 100% locales (sin IA), pensadas para la captura rápida en
clase:
    - /suggest    autocompletado por prefijo mientras se escribe (máx. 5).
    - /translate  traducción exacta instantánea de una palabra.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.schemas import DictSuggestion, DictSuggestOut, DictTranslateOut
from database.connection import get_db
from database.models import DictionaryEntry

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


@router.get("/suggest", response_model=DictSuggestOut)
def suggest(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(default=5, ge=1, le=5),
    db: Session = Depends(get_db),
):
    prefix = q.strip().lower()
    if not prefix:
        return DictSuggestOut(suggestions=[])

    # ilike → válido en SQLite y Postgres; las comunes primero (rank asc, NULL al final).
    rows = (
        db.query(DictionaryEntry)
        .filter(DictionaryEntry.word.ilike(f"{prefix}%"))
        .order_by(
            (DictionaryEntry.rank.is_(None)).asc(),  # False (0) antes que True (1)
            DictionaryEntry.rank.asc(),
            DictionaryEntry.word.asc(),
        )
        .limit(limit)
        .all()
    )
    return DictSuggestOut(
        suggestions=[DictSuggestion(word=r.word, translation=r.translation) for r in rows]
    )


@router.get("/translate/{word}", response_model=DictTranslateOut)
def translate(word: str, db: Session = Depends(get_db)):
    word_lc = word.strip().lower()
    row = (
        db.query(DictionaryEntry)
        .filter(DictionaryEntry.word == word_lc)
        .one_or_none()
    )
    if row is None:
        return DictTranslateOut(word=word_lc, translation="", found=False)
    return DictTranslateOut(word=row.word, translation=row.translation, found=True)
