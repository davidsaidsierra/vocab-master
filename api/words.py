from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Word, DictionaryEntry, User
from api.auth import get_current_user, owner_id, scope_to_owner
from api.quota import require_ai_access, consume_ai_quota
from api.schemas import (
    WordCreate, WordUpdate, WordOut,
    QuickWordCreate, QuickWordOut, EnrichResult, EnrichOut,
)
from services import groq

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
        difficulty=w.difficulty, mastery_level=w.mastery_level,
        next_review=w.next_review, ease_factor=w.ease_factor,
        interval=w.interval, repetitions=w.repetitions,
        created_at=w.created_at, updated_at=w.updated_at,
    )


@router.get("/", response_model=list[WordOut])
def list_words(
    category_id: int | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = scope_to_owner(db.query(Word), Word, current_user)
    if category_id:
        q = q.filter(Word.category_id == category_id)
    if search:
        pattern = f"%{search}%"
        q = q.filter(Word.word.ilike(pattern) | Word.translation.ilike(pattern))
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
    w = Word(user_id=owner_id(current_user), **data.model_dump())
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(w, field, value)
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
