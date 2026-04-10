"""
Contextual word lookup endpoint.

Strategy:
    1. Check DB cache (word_lookups table).
    2. If hit → return instantly, mark as cached.
    3. If miss → call Gemini, store in cache, return result.

This way each unique word only consumes ONE Gemini API call for its lifetime.
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from api.schemas import LookupOut
from database.connection import get_db
from database.models import WordLookup
from services import gemini

router = APIRouter(prefix="/api/lookup", tags=["lookup"])


def _build_out(word_lc: str, data: dict, cached: bool, source: str) -> LookupOut:
    return LookupOut(
        word=data.get("word") or word_lc,
        phonetic=data.get("phonetic", "") or "",
        meanings=data.get("meanings", []) or [],
        common_phrases=data.get("common_phrases", []) or [],
        cached=cached,
        source=source,
    )


@router.get("/{word}", response_model=LookupOut)
def lookup(
    word: str = Path(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
):
    word_lc = word.strip().lower()
    if not word_lc:
        raise HTTPException(400, "Word cannot be empty")

    # ── 1. DB cache ─────────────────────────────────────────
    row = db.query(WordLookup).filter(WordLookup.word == word_lc).first()
    if row:
        try:
            data = json.loads(row.data)
        except json.JSONDecodeError:
            data = {}
        return _build_out(word_lc, data, cached=True, source=row.source or "gemini")

    # ── 2. Gemini call ──────────────────────────────────────
    try:
        data = gemini.lookup_word(word_lc)
    except RuntimeError as exc:
        # Configuration / auth / network
        raise HTTPException(503, f"Servicio de traducción no disponible: {exc}") from exc
    except ValueError as exc:
        # JSON parse error
        raise HTTPException(502, f"Respuesta inválida del modelo: {exc}") from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(500, f"Error inesperado: {exc}") from exc

    # ── 3. Persist in cache ─────────────────────────────────
    try:
        row = WordLookup(
            word=word_lc,
            data=json.dumps(data, ensure_ascii=False),
            source="gemini",
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        # Non-fatal: still return the result even if caching failed.

    return _build_out(word_lc, data, cached=False, source="gemini")


@router.delete("/{word}", status_code=204)
def invalidate_lookup(
    word: str = Path(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
):
    """Remove a cached entry so the next request re-queries Gemini."""
    word_lc = word.strip().lower()
    row = db.query(WordLookup).filter(WordLookup.word == word_lc).first()
    if not row:
        raise HTTPException(404, "Not cached")
    db.delete(row)
    db.commit()
