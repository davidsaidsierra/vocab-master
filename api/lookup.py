"""
Contextual word lookup endpoint.

Strategy:
    1. Check DB cache (word_lookups table).
    2. If hit → return instantly, mark as cached.
    3. If miss → call Gemini, store in cache, return result.

This way each unique word only consumes ONE Gemini API call for its lifetime.
"""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from api.schemas import LookupOut
from api.auth import get_current_user, require_role
from api.quota import require_ai_access, consume_ai_quota
from database.connection import get_db
from database.models import WordLookup, User
from services import word_lookup

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lookup", tags=["lookup"])

# Solo letras (incl. acentos), dígitos, espacios, guiones y apóstrofes. Neutraliza
# la inyección de prompt: elimina llaves, comillas, saltos de línea y marcadores
# que podrían usarse para "romper" el prompt del LLM. Una palabra/frase legítima
# nunca necesita otros caracteres.
_WORD_DISALLOWED = re.compile(r"[^0-9A-Za-zÀ-ÿ '\-]")


def _sanitize_word(raw: str) -> str:
    cleaned = _WORD_DISALLOWED.sub(" ", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return cleaned[:200]


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
    current_user: User = Depends(get_current_user),
):
    word_lc = _sanitize_word(word)
    if not word_lc:
        raise HTTPException(400, "Word cannot be empty")

    # ── 1. DB cache (se sirve a TODOS, también free: es solo lectura) ────────
    row = db.query(WordLookup).filter(WordLookup.word == word_lc).first()
    if row:
        try:
            data = json.loads(row.data)
        except json.JSONDecodeError:
            data = {}
        return _build_out(word_lc, data, cached=True, source=row.source or "gemini")

    # ── 2. Cache MISS → llamada real a IA: exige premium/admin + cuota ───────
    require_ai_access(current_user)
    consume_ai_quota(current_user, db)

    # ── 3. Gemini (with Groq fallback) ──────────────────────
    try:
        data, source = word_lookup.lookup_word(word_lc)
    except RuntimeError as exc:
        logger.warning("Lookup service unavailable for %r: %s", word_lc, exc)
        raise HTTPException(503, "Servicio de traducción no disponible en este momento.") from exc
    except ValueError as exc:
        logger.warning("Invalid model response for %r: %s", word_lc, exc)
        raise HTTPException(502, "El modelo devolvió una respuesta inválida.") from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("Unexpected error during lookup for %r", word_lc)
        raise HTTPException(500, "Error inesperado del servidor.") from exc

    # ── 4. Persist in cache ─────────────────────────────────
    try:
        row = WordLookup(
            word=word_lc,
            data=json.dumps(data, ensure_ascii=False),
            source=source,
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        # Non-fatal: still return the result even if caching failed.

    return _build_out(word_lc, data, cached=False, source=source)


@router.delete("/{word}", status_code=204)
def invalidate_lookup(
    word: str = Path(..., min_length=1, max_length=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    """Remove a cached entry so the next request re-queries Gemini. Solo admin:
    la cache es global y compartida, invalidarla afecta a todos los usuarios."""
    word_lc = _sanitize_word(word)
    row = db.query(WordLookup).filter(WordLookup.word == word_lc).first()
    if not row:
        raise HTTPException(404, "Not cached")
    db.delete(row)
    db.commit()
