"""
Diccionario offline bidireccional.

Lee las tablas `dictionary_entries` (EN→ES, scripts/import_dictionary.py) y
`dictionary_entries_es` (ES→EN, scripts/import_dictionary_es.py) y expone dos
operaciones 100% locales (sin IA), pensadas para la captura rápida en clase y la
práctica de exámenes:
    - /suggest    autocompletado por prefijo mientras se escribe (máx. 5).
    - /translate  traducción exacta instantánea de una palabra.

El parámetro `dir` elige la dirección: "en-es" (por defecto) o "es-en".
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.schemas import DictSuggestion, DictSuggestOut, DictTranslateOut
from database.connection import get_db
from database.models import DictionaryEntry, DictionaryEntryEs

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


def _model_for(direction: str):
    """Devuelve el modelo de tabla según la dirección pedida."""
    return DictionaryEntryEs if direction == "es-en" else DictionaryEntry


@router.get("/suggest", response_model=DictSuggestOut)
def suggest(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(default=5, ge=1, le=5),
    dir: str = Query(default="en-es", pattern="^(en-es|es-en)$"),
    db: Session = Depends(get_db),
):
    prefix = q.strip().lower()
    if not prefix:
        return DictSuggestOut(suggestions=[])

    Model = _model_for(dir)
    # ilike → válido en SQLite y Postgres; las comunes primero (rank asc, NULL al final).
    rows = (
        db.query(Model)
        .filter(Model.word.ilike(f"{prefix}%"))
        .order_by(
            (Model.rank.is_(None)).asc(),  # False (0) antes que True (1)
            Model.rank.asc(),
            Model.word.asc(),
        )
        .limit(limit)
        .all()
    )
    return DictSuggestOut(
        suggestions=[DictSuggestion(word=r.word, translation=r.translation) for r in rows]
    )


@router.get("/translate/{word}", response_model=DictTranslateOut)
def translate(
    word: str,
    dir: str = Query(default="en-es", pattern="^(en-es|es-en)$"),
    db: Session = Depends(get_db),
):
    word_lc = word.strip().lower()
    Model = _model_for(dir)
    row = (
        db.query(Model)
        .filter(Model.word == word_lc)
        .one_or_none()
    )
    if row is None:
        return DictTranslateOut(word=word_lc, translation="", found=False)
    return DictTranslateOut(word=row.word, translation=row.translation, found=True)
