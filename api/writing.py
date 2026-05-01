"""
Writing Challenge — corrige textos del usuario integrando vocabulario
guardado y la gramática vista en clase.

Reglas:
    - Máximo 10 envíos al día (por defecto). Cuenta filas en
      writing_challenges con created_at >= medianoche UTC del día actual.
    - Cada palabra usada correctamente recibe un boost de mastery_level
      (+5, capado a 100) — esto cierra el loop con la repetición espaciada.
"""

import json
import random
from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.schemas import (
    WritingChallengeWord,
    WritingWordsOut,
    WritingSubmitIn,
    WritingSubmitOut,
    WritingError,
)
from database.connection import get_db
from database.models import Word, WritingChallenge
from services import groq as groq_service

router = APIRouter(prefix="/api/writing", tags=["writing"])

DAILY_LIMIT = 10
MASTERY_BOOST = 5.0


def _start_of_today_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, tzinfo=timezone.utc)


def _count_today(db: Session) -> int:
    start = _start_of_today_utc()
    return (
        db.query(func.count(WritingChallenge.id))
        .filter(WritingChallenge.created_at >= start)
        .scalar()
        or 0
    )


@router.get("/words", response_model=WritingWordsOut)
def get_challenge_words(
    count: int = Query(4, ge=1, le=8),
    db: Session = Depends(get_db),
):
    """
    Devuelve N palabras para el reto de escritura. Prioriza:
        1. Palabras vencidas para review (next_review <= now)
        2. Palabras de menor mastery_level
    Si no hay suficientes palabras guardadas, devuelve lo que haya.
    """
    now = datetime.now(timezone.utc)

    due = (
        db.query(Word)
        .filter(Word.next_review <= now)
        .order_by(Word.mastery_level.asc(), func.random())
        .limit(count)
        .all()
    )

    if len(due) < count:
        extra_needed = count - len(due)
        existing_ids = [w.id for w in due]
        q = db.query(Word).order_by(Word.mastery_level.asc(), func.random())
        if existing_ids:
            q = q.filter(~Word.id.in_(existing_ids))
        extra = q.limit(extra_needed).all()
        due.extend(extra)

    words_out = [
        WritingChallengeWord(
            id=w.id,
            word=w.word,
            translation=w.translation,
            mastery_level=w.mastery_level,
        )
        for w in due
    ]

    return WritingWordsOut(
        words=words_out,
        daily_used=_count_today(db),
        daily_limit=DAILY_LIMIT,
    )


@router.post("/submit", response_model=WritingSubmitOut)
def submit_writing(data: WritingSubmitIn, db: Session = Depends(get_db)):
    text = (data.user_text or "").strip()
    if not text:
        raise HTTPException(400, "El texto no puede estar vacío")
    if len(text) > 1500:
        raise HTTPException(400, "El texto es demasiado largo (max 1500 caracteres)")

    used_today = _count_today(db)
    if used_today >= DAILY_LIMIT:
        raise HTTPException(
            429,
            f"Has alcanzado el límite diario de {DAILY_LIMIT} retos. Vuelve mañana.",
        )

    if not groq_service.is_configured():
        raise HTTPException(503, "Groq no está configurado (falta GROQ_API_KEY)")

    target_words = [w.strip() for w in (data.target_words or []) if w.strip()]

    try:
        result = groq_service.correct_writing(
            grammar_topic=data.grammar_topic or "General writing",
            grammar_hint=data.grammar_hint or "",
            target_words=target_words,
            user_text=text,
        )
    except RuntimeError as exc:
        raise HTTPException(503, f"Servicio AI no disponible: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(502, f"Respuesta inválida del modelo: {exc}") from exc

    used_correctly_raw = result.get("words_used_correctly") or []
    used_lc = {w.strip().lower() for w in used_correctly_raw if isinstance(w, str)}

    mastery_boosts: list[dict] = []
    if data.target_word_ids and used_lc:
        rows = (
            db.query(Word).filter(Word.id.in_(data.target_word_ids)).all()
        )
        for w in rows:
            if w.word.strip().lower() in used_lc:
                old = float(w.mastery_level or 0.0)
                new = min(100.0, old + MASTERY_BOOST)
                if new != old:
                    w.mastery_level = new
                    mastery_boosts.append({
                        "word_id": w.id,
                        "word": w.word,
                        "old": old,
                        "new": new,
                    })

    try:
        challenge = WritingChallenge(
            grammar_topic=data.grammar_topic or "General writing",
            target_words=json.dumps(target_words, ensure_ascii=False),
            user_text=text,
            correction=json.dumps(result, ensure_ascii=False),
            words_used_correctly=json.dumps(list(used_lc), ensure_ascii=False),
            grammar_used_correctly=1 if result.get("grammar_used_correctly") else 0,
        )
        db.add(challenge)
        db.commit()
    except Exception:
        db.rollback()
        raise

    errors = []
    for e in result.get("errors", []) or []:
        if isinstance(e, dict):
            errors.append(WritingError(
                original=str(e.get("original", "")),
                fix=str(e.get("fix", "")),
                type=str(e.get("type", "")),
                explanation_es=str(e.get("explanation_es", "")),
            ))

    return WritingSubmitOut(
        corrected=str(result.get("corrected", text)),
        errors=errors,
        words_used_correctly=[str(w) for w in used_correctly_raw if isinstance(w, str)],
        grammar_used_correctly=bool(result.get("grammar_used_correctly", False)),
        grammar_feedback_es=str(result.get("grammar_feedback_es", "")),
        encouragement_es=str(result.get("encouragement_es", "¡Sigue así!")),
        score=int(result.get("score", 0) or 0),
        mastery_boosts=mastery_boosts,
        daily_used=used_today + 1,
        daily_limit=DAILY_LIMIT,
    )
