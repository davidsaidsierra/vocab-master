import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Word, DictionaryEntry, User
from api.auth import get_current_user, owner_id, scope_to_owner
from api.quota import require_ai_access, consume_ai_quota
from api.schemas import (
    WordCreate, WordUpdate, WordOut,
    QuickWordCreate, QuickWordOut, EnrichResult, EnrichOut,
    SynonymBackfillOut, LevelBackfillOut,
)
from services import groq
from services import cefr
from services import ai_schemas

router = APIRouter(prefix="/api/words", tags=["words"])

ENRICH_BATCH = 5  # palabras enriquecidas por llamada a la IA


def _pending_count(db: Session, user: User) -> int:
    return scope_to_owner(
        db.query(Word).filter(Word.needs_enrichment == 1), Word, user
    ).count()


def _word_to_out(w: Word) -> WordOut:
    return WordOut(
        id=w.id, word=w.word, translation=w.translation,
        definition=w.definition, example=w.example, notes=w.notes,
        category_id=w.category_id,
        category_name=w.category.name if w.category else None,
        category_color=w.category.color if w.category else None,
        category_icon=w.category.icon if w.category else None,
        difficulty=w.difficulty, cefr_level=w.cefr_level,
        synonyms=json.loads(w.synonyms) if w.synonyms else [],
        meanings=json.loads(w.meanings) if w.meanings else [],
        common_phrases=json.loads(w.common_phrases) if w.common_phrases else [],
        part_of_speech=w.part_of_speech, phonetic=w.phonetic,
        source_document_id=w.source_document_id,
        mastery_level=w.mastery_level,
        next_review=w.next_review, ease_factor=w.ease_factor,
        interval=w.interval, repetitions=w.repetitions,
        created_at=w.created_at, updated_at=w.updated_at,
    )


def _apply_lookup_payload(w: Word, meanings, common_phrases, *, override_translation: bool):
    """
    Guarda TODAS las acepciones y frases del lookup en el Word y deriva los
    campos "resumen" (translation/definition/example/part_of_speech). No llama
    a la IA: recibe datos que ya venían del lookup cacheado.
    - `translation` se rellena con TODAS las traducciones unidas por ", " porque
      el calificador de repaso ya separa por comas y acepta cualquier variante.
    - `part_of_speech` se normaliza a la lista cerrada (por si el lookup era del
      cache viejo con categorías libres).
    """
    if meanings:
        for m in meanings:
            m["part_of_speech"] = ai_schemas.canonical_pos(m.get("part_of_speech"))
        w.meanings = json.dumps(meanings, ensure_ascii=False)
        all_tr = list(dict.fromkeys(
            (m.get("translation_es") or "").strip()
            for m in meanings if (m.get("translation_es") or "").strip()
        ))
        if all_tr and override_translation:
            w.translation = ", ".join(all_tr)
        first = meanings[0]
        if not w.part_of_speech:
            w.part_of_speech = first.get("part_of_speech") or None
        if not w.definition:
            w.definition = first.get("definition_en") or None
        if not w.example:
            exs = first.get("examples") or []
            if exs:
                w.example = (exs[0] or {}).get("en") or None
    if common_phrases is not None:
        w.common_phrases = json.dumps(common_phrases, ensure_ascii=False) if common_phrases else None


@router.get("/", response_model=list[WordOut])
def list_words(
    category_id: int | None = Query(None),
    search: str | None = Query(None),
    cefr_level: str | None = Query(None, description="Filtrar por nivel CEFR (A1..C2)"),
    part_of_speech: str | None = Query(None, description="Filtrar por categoría gramatical"),
    days: int | None = Query(None, description="Solo palabras añadidas en los últimos N días (0 = hoy)"),
    mastery_max: int | None = Query(None, ge=0, le=100, description="Solo palabras con mastery ≤ este valor"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = scope_to_owner(db.query(Word), Word, current_user)
    if category_id:
        q = q.filter(Word.category_id == category_id)
    if cefr_level:
        q = q.filter(Word.cefr_level == cefr_level.upper())
    if part_of_speech:
        q = q.filter(Word.part_of_speech == part_of_speech.lower())
    if days is not None:
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        q = q.filter(Word.created_at >= cutoff)
    if search:
        pattern = f"%{search}%"
        q = q.filter(Word.word.ilike(pattern) | Word.translation.ilike(pattern))
    if mastery_max is not None:
        q = q.filter(Word.mastery_level <= mastery_max)
        words = q.order_by(Word.mastery_level.asc()).all()
    else:
        words = q.order_by(Word.created_at.desc()).all()
    return [_word_to_out(w) for w in words]


# ── Captura rápida (modo clase) ─────────────────────────────
@router.post("/quick", response_model=QuickWordOut, status_code=201)
def quick_add(
    data: QuickWordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guarda una palabra al instante con traducción offline (sin IA) y la marca
    como pendiente de enriquecer. Devuelve la palabra + cuántas pendientes hay.
    """
    word_lc = data.word.strip().lower()
    if not word_lc:
        raise HTTPException(400, "La palabra no puede estar vacía")

    translation = (data.translation or "").strip()
    if not translation:
        entry = (
            db.query(DictionaryEntry)
            .filter(DictionaryEntry.word == word_lc)
            .one_or_none()
        )
        translation = entry.translation if entry else ""

    w = Word(
        user_id=owner_id(current_user),
        word=word_lc,
        translation=translation,
        category_id=data.category_id,
        cefr_level=cefr.level_for_word(word_lc),
        source="quick",
        needs_enrichment=1,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return QuickWordOut(word=_word_to_out(w), pending_count=_pending_count(db, current_user))


@router.get("/pending", response_model=list[WordOut])
def list_pending(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Palabras de captura rápida pendientes de enriquecer (más antiguas primero)."""
    rows = (
        scope_to_owner(db.query(Word).filter(Word.needs_enrichment == 1), Word, current_user)
        .order_by(Word.created_at.asc())
        .all()
    )
    return [_word_to_out(w) for w in rows]


@router.post("/enrich-pending", response_model=EnrichOut)
def enrich_pending(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Toma hasta ENRICH_BATCH palabras pendientes (las más antiguas) y las completa
    en UNA sola llamada a Groq: definición, ejemplo, notas, y traducción si faltaba.
    """
    batch = (
        scope_to_owner(db.query(Word).filter(Word.needs_enrichment == 1), Word, current_user)
        .order_by(Word.created_at.asc())
        .limit(ENRICH_BATCH)
        .all()
    )
    if not batch:
        return EnrichOut(enriched=[], remaining_pending=0)

    # Gating de IA: free → 403; premium consume cuota; admin ilimitado.
    require_ai_access(current_user)
    consume_ai_quota(current_user, db)

    payload = [{"word": w.word, "translation": w.translation} for w in batch]
    try:
        results = groq.enrich_words_batch(payload)
    except groq.AIRateLimitError:
        raise HTTPException(429, "El servicio de IA está saturado ahora mismo. Intenta de nuevo en unos segundos.")
    except RuntimeError as exc:
        raise HTTPException(503, f"Servicio de IA no disponible: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(502, f"Respuesta inválida del modelo: {exc}") from exc

    by_word = {r["word"]: r for r in results}
    enriched: list[EnrichResult] = []
    for w in batch:
        r = by_word.get(w.word)
        if r:
            if r.get("translation_es") and (not w.translation or w.source == "quick"):
                w.translation = r["translation_es"]
            if r.get("definition_en"):
                w.definition = r["definition_en"]
            if r.get("example_en"):
                w.example = r["example_en"]
            if r.get("notes_es"):
                w.notes = r["notes_es"]
            # Sinónimos para el modo Synonym del repaso (se cachean; [] si no hay).
            syns = [s for s in (r.get("synonyms_en") or []) if s and s != w.word.strip().lower()]
            w.synonyms = json.dumps(syns, ensure_ascii=False)
        # Marcar como enriquecida aunque el modelo la haya omitido, para no
        # reintentarla en bucle; queda editable a mano.
        w.needs_enrichment = 0
        w.source = "ai"
        enriched.append(EnrichResult(
            id=w.id, word=w.word, translation=w.translation,
            definition=w.definition, example=w.example,
        ))

    db.commit()
    return EnrichOut(enriched=enriched, remaining_pending=_pending_count(db, current_user))


def _synonyms_pending_q(db: Session, user: User):
    """Palabras SUELTAS del usuario sin sinónimos generados todavía."""
    return scope_to_owner(
        db.query(Word).filter(Word.synonyms.is_(None), ~Word.word.like("% %")),
        Word, user,
    )


@router.post("/backfill-synonyms", response_model=SynonymBackfillOut)
def backfill_synonyms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Genera sinónimos para hasta ENRICH_BATCH palabras que aún no los tienen,
    en UNA sola llamada a Groq (reutiliza enrich_words_batch). Solo escribe el
    campo `synonyms`; no toca definición/ejemplo/traducción. Para poblar el modo
    Synonym en palabras viejas ya enriquecidas.
    """
    batch = (
        _synonyms_pending_q(db, current_user)
        .order_by(Word.created_at.asc())
        .limit(ENRICH_BATCH)
        .all()
    )
    if not batch:
        return SynonymBackfillOut(updated=0, remaining=0)

    require_ai_access(current_user)
    consume_ai_quota(current_user, db)

    payload = [{"word": w.word, "translation": w.translation} for w in batch]
    try:
        results = groq.enrich_words_batch(payload)
    except groq.AIRateLimitError:
        raise HTTPException(429, "El servicio de IA está saturado ahora mismo. Intenta de nuevo en unos segundos.")
    except RuntimeError as exc:
        raise HTTPException(503, "Servicio de IA no disponible en este momento.") from exc
    except ValueError as exc:
        raise HTTPException(502, "El modelo devolvió una respuesta inválida.") from exc

    by_word = {r["word"]: r for r in results}
    for w in batch:
        r = by_word.get(w.word)
        syns = [s for s in ((r or {}).get("synonyms_en") or []) if s and s != w.word.strip().lower()]
        # Se guarda aunque quede vacío ('[]') para no reprocesar esta palabra.
        w.synonyms = json.dumps(syns, ensure_ascii=False)

    db.commit()
    remaining = _synonyms_pending_q(db, current_user).count()
    return SynonymBackfillOut(updated=len(batch), remaining=remaining)


@router.post("/backfill-levels", response_model=LevelBackfillOut)
def backfill_levels(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Asigna el nivel CEFR (A1–C2) a las palabras del usuario que aún no lo tienen.
    100% offline y determinista (cefrpy) — SIN IA, sin cuota. Solo agrega el
    nivel; no toca traducción, definición, ejemplo ni nada más. Para que las
    palabras añadidas antes de esta función se pongan al día en un clic.
    """
    rows = scope_to_owner(
        db.query(Word).filter(Word.cefr_level.is_(None)), Word, current_user
    ).all()

    updated = 0
    for w in rows:
        lvl = cefr.level_for_word(w.word)
        if lvl:
            w.cefr_level = lvl
            updated += 1
    db.commit()

    # Las que siguen sin nivel son frases o palabras fuera de la base de cefrpy.
    unresolved = scope_to_owner(
        db.query(Word).filter(Word.cefr_level.is_(None)), Word, current_user
    ).count()
    return LevelBackfillOut(updated=updated, unresolved=unresolved)


def _get_owned_word(db: Session, word_id: int, user: User) -> Word:
    """Carga una palabra del usuario actual o lanza 404 (no revela ajenas)."""
    w = scope_to_owner(db.query(Word).filter(Word.id == word_id), Word, user).one_or_none()
    if not w:
        raise HTTPException(404, "Word not found")
    return w


@router.get("/{word_id}", response_model=WordOut)
def get_word(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _word_to_out(_get_owned_word(db, word_id, current_user))


@router.post("/", response_model=WordOut, status_code=201)
def create_word(
    data: WordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = data.model_dump()
    meanings = payload.pop("meanings", None)
    common_phrases = payload.pop("common_phrases", None)
    w = Word(user_id=owner_id(current_user), **payload)
    _apply_lookup_payload(w, meanings, common_phrases, override_translation=True)
    w.cefr_level = cefr.level_for_word(w.word)
    db.add(w)
    db.commit()
    db.refresh(w)
    return _word_to_out(w)


@router.put("/{word_id}", response_model=WordOut)
def update_word(
    word_id: int,
    data: WordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = _get_owned_word(db, word_id, current_user)
    fields = data.model_dump(exclude_unset=True)
    meanings = fields.pop("meanings", None)
    common_phrases = fields.pop("common_phrases", None)
    # synonyms es una columna JSON (Text): serializar la lista antes de asignar.
    if "synonyms" in fields:
        syns = fields.pop("synonyms")
        w.synonyms = json.dumps(syns or [], ensure_ascii=False)
    for field, value in fields.items():
        setattr(w, field, value)
    if meanings is not None or common_phrases is not None:
        # Si el cliente mandó explícitamente translation, respetarla; si no,
        # derivarla de los significados.
        _apply_lookup_payload(
            w, meanings, common_phrases,
            override_translation=("translation" not in fields),
        )
    # Si cambió el texto de la palabra, el nivel CEFR puede haber cambiado.
    if "word" in fields:
        w.cefr_level = cefr.level_for_word(w.word)
    db.commit()
    db.refresh(w)
    return _word_to_out(w)


@router.delete("/{word_id}", status_code=204)
def delete_word(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = _get_owned_word(db, word_id, current_user)
    db.delete(w)
    db.commit()
