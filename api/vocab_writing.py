"""
Repaso — "Escribir un texto": subir el mastery del vocabulario propio usándolo
de verdad en una redacción.

Flujo:
    GET  /api/vocab-writing/topics    los 100 temas (para cambiar de tema sin round-trip)
    GET  /api/vocab-writing/session   tema + N palabras por categoría gramatical
    POST /api/vocab-writing/submit    evalúa el texto y sube el mastery
    GET  /api/vocab-writing/history   últimas notas

Reglas de diseño (ver CLAUDE.md):
    - UNA sola llamada a Groq por envío. Todo lo que se puede decidir con reglas
      se decide en services/vocab_writing.py (detección de uso, candidatos a
      error de ortografía) y se le entrega al modelo ya resuelto.
    - El mastery sube por el MISMO camino que el repaso normal: SM-2 real
      (fila en `reviews` + recálculo de mastery_level), reutilizando los
      helpers de api/reviews.py. Usar una palabra en tu propio texto es, como
      mínimo, tan buena evidencia como acertar una tarjeta.
    - No se penaliza el mal uso: este ejercicio suma, no resta. El repaso normal
      ya se encarga de castigar lo que no sabes.
"""

import json
import logging
import random
import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.auth import get_current_user, owner_id, scope_to_owner
from api.quota import require_ai_access, consume_ai_quota
from api.reviews import _sm2, _mastery_from_sm2
from api.schemas import (
    VocabWritingTopic,
    VocabWritingTopicsOut,
    VocabWritingWord,
    VocabWritingBucket,
    VocabWritingSessionOut,
    VocabWritingSubmitIn,
    VocabWritingWordResult,
    VocabWritingSpellError,
    VocabWritingSubmitOut,
    VocabWritingHistoryItem,
    VocabWritingHistoryOut,
)
from database.connection import get_db
from database.models import Word, Review, User, VocabWritingSession
from services import groq as groq_service
from services import vocab_writing as engine
from services import writing_topics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vocab-writing", tags=["vocab-writing"])

MAX_WORDS = 500          # tope del texto
MIN_WORDS = 25           # por debajo de esto no hay nada que evaluar
DAILY_LIMIT = 20         # envíos por día (además de la cuota global de IA)
MAX_PUSH_DAYS = 14       # cuánto puede alejar este ejercicio el próximo repaso
PER_TYPE_CHOICES = (3, 4, 5, 6)

# Las 7 categorías gramaticales del ejercicio, en el orden en que se muestran.
POS_BUCKETS: list[tuple[str, str, str]] = [
    ("phrase",      "Frases / expresiones", "💬"),
    ("verb",        "Verbos",               "🏃"),
    ("noun",        "Sustantivos",          "📦"),
    ("adjective",   "Adjetivos",            "🎨"),
    ("adverb",      "Adverbios",            "⚡"),
    ("conjunction", "Conectores",           "🔗"),
    ("preposition", "Preposiciones",        "📍"),
]
_POS_LABEL = {pos: label for pos, label, _ in POS_BUCKETS}


def _start_of_today_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, tzinfo=timezone.utc)


def _count_today(db: Session, user: User) -> int:
    return (
        scope_to_owner(
            db.query(func.count(VocabWritingSession.id)), VocabWritingSession, user
        )
        .filter(VocabWritingSession.created_at >= _start_of_today_utc())
        .scalar()
        or 0
    )


def _translations(w: Word) -> list[str]:
    """
    Todas las acepciones guardadas de la palabra. `meanings` es la fuente rica
    (una entrada por significado); si no existe, se parte el resumen
    `translation`, que el lookup guarda unido por comas.
    """
    out: list[str] = []
    try:
        meanings = json.loads(w.meanings) if w.meanings else []
    except (ValueError, TypeError):
        meanings = []
    if isinstance(meanings, list):
        for m in meanings:
            if isinstance(m, dict):
                t = str(m.get("translation_es") or "").strip()
                if t:
                    out.append(t)
    if not out:
        out = [p.strip() for p in re.split(r"[,;/]", w.translation or "") if p.strip()]

    seen: set[str] = set()
    uniq: list[str] = []
    for t in out:
        k = t.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(t)
    return uniq[:6] or [(w.translation or "").strip()]


def _pick_words(db: Session, user: User, count: int) -> dict[str, list]:
    """
    `count` palabras por categoría gramatical, priorizando las flojas pero sin
    devolver siempre las mismas: se arma un pozo con las de menor mastery y se
    sortea dentro de él (ordenar por mastery a secas devolvería siempre las
    mismas en cuanto los valores dejan de empatar).

    Una SOLA consulta para las 7 categorías: contra Neon cada ida y vuelta
    cuesta ~250 ms, así que siete consultas se notaban al cambiar la cantidad.
    Se piden solo las columnas necesarias, sin cargar la entidad completa, para
    no arrastrar las relaciones `selectin` de Word (reviews y category).

    `family_head != 0` deja fuera a los miembros absorbidos por una familia,
    igual que el repaso normal: la familia se repasa como una sola unidad.
    """
    todas = (
        scope_to_owner(
            db.query(
                Word.id, Word.word, Word.translation, Word.meanings,
                Word.part_of_speech, Word.mastery_level, Word.cefr_level,
            ).filter(
                Word.family_head != 0,
                Word.part_of_speech.in_([pos for pos, _, _ in POS_BUCKETS]),
            ),
            Word, user,
        )
        .order_by(Word.mastery_level.asc())
        .all()
    )

    por_pos: dict[str, list] = {pos: [] for pos, _, _ in POS_BUCKETS}
    for row in todas:
        por_pos[row.part_of_speech].append(row)

    elegidas: dict[str, list] = {}
    for pos, pozo in por_pos.items():
        candidatas = pozo[: max(count * 4, count)]      # las más flojas
        elegidas[pos] = (
            candidatas if len(candidatas) <= count else random.sample(candidatas, count)
        )
    return elegidas


@router.get("/topics", response_model=VocabWritingTopicsOut)
def get_topics(current_user: User = Depends(get_current_user)):
    """Los 100 temas. El frontend los cachea y cambia de tema sin ir al servidor."""
    return VocabWritingTopicsOut(
        topics=[VocabWritingTopic(**t) for t in writing_topics.all_topics()]
    )


@router.get("/session", response_model=VocabWritingSessionOut)
def get_session(
    per_type: int = Query(5, ge=3, le=6, description="Palabras por categoría gramatical (3–6)"),
    topic_id: int | None = Query(None, description="Repetir un tema concreto; por defecto uno al azar"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tema + palabras del repositorio propio, repartidas por categoría gramatical."""
    if per_type not in PER_TYPE_CHOICES:
        raise HTTPException(400, f"per_type debe ser uno de {PER_TYPE_CHOICES}")

    topic = writing_topics.get_topic(topic_id) if topic_id else None
    if topic is None:
        topic = writing_topics.random_topic()

    elegidas = _pick_words(db, current_user, per_type)
    buckets: list[VocabWritingBucket] = []
    total = 0
    for pos, label, icon in POS_BUCKETS:
        rows = elegidas.get(pos, [])
        total += len(rows)
        buckets.append(VocabWritingBucket(
            pos=pos, label=label, icon=icon,
            words=[
                VocabWritingWord(
                    id=w.id,
                    word=w.word,
                    translations=_translations(w),
                    mastery_level=float(w.mastery_level or 0.0),
                    cefr_level=w.cefr_level,
                    match=engine.match_spec(w.word, w.part_of_speech),
                )
                for w in rows
            ],
        ))

    return VocabWritingSessionOut(
        topic=VocabWritingTopic(**topic),
        per_type=per_type,
        buckets=buckets,
        total=total,
        required=total // 2,
        max_words=MAX_WORDS,
        daily_used=_count_today(db, current_user),
        daily_limit=DAILY_LIMIT,
    )


@router.post("/submit", response_model=VocabWritingSubmitOut)
def submit(
    data: VocabWritingSubmitIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = (data.user_text or "").strip()
    if not text:
        raise HTTPException(400, "El texto no puede estar vacío")

    word_count = engine.count_words(text)
    if word_count > MAX_WORDS:
        raise HTTPException(400, f"El texto supera las {MAX_WORDS} palabras ({word_count}).")
    if word_count < MIN_WORDS:
        raise HTTPException(400, f"Escribe al menos {MIN_WORDS} palabras (llevas {word_count}).")

    ids = [int(i) for i in (data.word_ids or [])]
    if not ids:
        raise HTTPException(400, "No se recibió ninguna palabra objetivo")

    rows = scope_to_owner(
        db.query(Word).filter(Word.id.in_(ids)), Word, current_user
    ).all()
    if not rows:
        raise HTTPException(404, "Las palabras objetivo no existen o no son tuyas")

    # Gating de IA: free → 403; premium → cuota + cooldown; admin → ilimitado.
    require_ai_access(current_user)
    used_today = _count_today(db, current_user)
    if current_user.role != "admin" and used_today >= DAILY_LIMIT:
        raise HTTPException(429, f"Llegaste al límite diario de {DAILY_LIMIT} textos. Vuelve mañana.")
    if not groq_service.is_configured():
        raise HTTPException(503, "Groq no está configurado (falta GROQ_API_KEY)")

    total_shown = len(rows)
    required = total_shown // 2

    # ── 1. Determinista, sin IA ──────────────────────────────────────────────
    targets = [{"id": w.id, "word": w.word, "pos": w.part_of_speech} for w in rows]
    detection = engine.detect_used(targets, text)
    detected = [w.word for w in rows if detection.get(w.id, {}).get("found")]
    missing = [w.word for w in rows if not detection.get(w.id, {}).get("found")]
    own_vocab = [w.word for w in rows]
    try:
        spell_raw = engine.spell_candidates(db, text, own_words=own_vocab)
    except Exception:  # noqa: BLE001 — el corrector nunca debe tumbar el envío
        logger.warning("Spell-check determinista falló; se continúa sin él", exc_info=True)
        spell_raw = []

    words_block = "\n".join(
        f"- {w.word} [{w.part_of_speech or 'word'}] = {', '.join(_translations(w))}"
        for w in rows
    )

    # ── 2. IA: un solo round-trip ────────────────────────────────────────────
    consume_ai_quota(current_user, db)
    try:
        result = groq_service.evaluate_vocab_writing(
            topic=(data.topic or "").strip(),
            words_block=words_block,
            total=total_shown,
            required=required,
            detected=detected,
            missing=missing,
            spell_candidates=spell_raw,
            word_count=word_count,
            user_text=text,
        )
    except groq_service.AIRateLimitError:
        raise HTTPException(429, "El servicio de IA está saturado ahora mismo. Intenta de nuevo en unos segundos.")
    except RuntimeError as exc:
        logger.warning("Vocab writing AI service unavailable: %s", exc)
        raise HTTPException(503, "Servicio de IA no disponible en este momento.") from exc
    except ValueError as exc:
        logger.warning("Invalid AI response for vocab writing: %s", exc)
        raise HTTPException(502, "El modelo devolvió una respuesta inválida.") from exc

    # ── 3. Cruce determinista × IA ───────────────────────────────────────────
    # La detección de Python es condición NECESARIA (la IA no puede inventar que
    # una palabra se usó); la IA solo puede vetar un falso positivo (not_found)
    # o bajar la calidad del uso.
    verdicts = {
        str(v.get("word", "")).strip().lower(): v
        for v in result.get("words", [])
        if isinstance(v, dict)
    }

    # Palabras que YA se practicaron hoy (aquí o en el repaso normal): se
    # cuentan como usadas, pero no vuelven a mover el SM-2. Sin este freno,
    # repetir textos con las mismas palabras flojas — que son justo las que el
    # ejercicio ofrece — dispararía el mastery y sacaría la palabra de la cola
    # de repaso durante meses.
    already_today = {
        r[0] for r in (
            scope_to_owner(db.query(Review.word_id), Review, current_user)
            .filter(Review.word_id.in_([w.id for w in rows]),
                    Review.reviewed_at >= _start_of_today_utc())
            .all()
        )
    }

    now = datetime.now(timezone.utc)
    word_results: list[VocabWritingWordResult] = []
    used_count = 0
    for w in rows:
        found = bool(detection.get(w.id, {}).get("found"))
        status = "missing"
        comment = ""
        if found:
            v = verdicts.get(w.word.strip().lower())
            verdict = str(v.get("verdict", "correct")) if v else "correct"
            comment = str(v.get("comment_es", "")) if v else ""
            status = "missing" if verdict == "not_found" else verdict
            if status in ("correct", "awkward"):
                used_count += 1

        # ── SM-2: usar bien la palabra cuenta como acierto ──
        # Misma mecánica que responder una tarjeta (api/reviews.py), con dos
        # matices propios de este ejercicio:
        #   · una palabra usada de forma torpe entra con quality 3 (pasa, pero
        #     baja el ease factor), no con 4;
        #   · el próximo repaso no se aleja más de MAX_PUSH_DAYS por esta vía,
        #     y nunca se adelanta respecto a lo ya agendado. Producir una
        #     palabra al escribir es buena señal, pero no debe vaciar la cola
        #     del repaso normal, que es donde de verdad se prueba el recuerdo.
        mastery_old = mastery_new = None
        if status in ("correct", "awkward") and w.id not in already_today:
            quality = 4 if status == "correct" else 3
            mastery_old = float(w.mastery_level or 0.0)
            reps, ef, ivl = _sm2(quality, w.repetitions or 0, w.ease_factor or 2.5, w.interval or 0)
            w.repetitions = reps
            w.ease_factor = ef
            w.interval = ivl
            w.mastery_level = _mastery_from_sm2(reps, ef)
            proximo = now + timedelta(days=min(ivl, MAX_PUSH_DAYS))
            anterior = w.next_review
            if anterior is not None and anterior.tzinfo is None:
                anterior = anterior.replace(tzinfo=timezone.utc)
            w.next_review = max(anterior, proximo) if anterior else proximo
            mastery_new = float(w.mastery_level)
            db.add(Review(user_id=owner_id(current_user), word_id=w.id, quality=quality))

        word_results.append(VocabWritingWordResult(
            id=w.id, word=w.word, pos=w.part_of_speech or "",
            translations=_translations(w),
            status=status, comment_es=comment,
            mastery_old=mastery_old, mastery_new=mastery_new,
        ))

    coverage_met = used_count >= required

    # Ortografía: solo lo que la IA confirmó como error real. Los candidatos que
    # el modelo no menciona se descartan (FreeDict no tiene nombres propios ni
    # tecnicismos: mejor callar que acusar en falso).
    spelling_errors: list[VocabWritingSpellError] = []
    candidatos = {t.lower() for t in spell_raw}
    for s in result.get("spelling", []):
        if not isinstance(s, dict) or not s.get("is_error"):
            continue
        token = str(s.get("word", "")).strip()
        if token and token.lower() in candidatos:
            spelling_errors.append(VocabWritingSpellError(
                word=token, suggestion=str(s.get("suggestion", "")).strip()
            ))

    # Errores de palabra-real (their/there, form/from): ningún diccionario los
    # ve, porque las dos palabras existen. Los aporta la IA en la misma llamada.
    vistos = {e.word.lower() for e in spelling_errors}
    for r in result.get("real_word_errors", []):
        if not isinstance(r, dict):
            continue
        wrong = str(r.get("wrong", "")).strip()
        if not wrong or wrong.lower() in vistos:
            continue
        # Solo si de verdad está en el texto: así el modelo no inventa errores.
        if not any(tok == wrong.lower() for tok in engine.text_tokens(text)):
            continue
        vistos.add(wrong.lower())
        spelling_errors.append(VocabWritingSpellError(
            word=wrong,
            suggestion=str(r.get("right", "")).strip(),
            note_es=str(r.get("comment_es", "")).strip(),
        ))

    # Nota: la IA la propone, pero la cobertura es un tope duro y no negociable.
    score = round(min(5.0, max(0.0, float(result.get("score", 0.0) or 0.0))), 1)
    if not coverage_met:
        score = min(score, 2.4)

    # ── 4. Persistencia ──────────────────────────────────────────────────────
    evaluation = {
        # 1 = primer envío, 2 = reintento tras ver dónde estuvieron los fallos.
        # Va en el JSON y no en una columna para no tener que migrar la tabla.
        "attempt": max(1, min(2, int(data.attempt or 1))),
        "ai": result,
        "detected": detected,
        "missing": missing,
        "spell_candidates": spell_raw,
        "spelling_errors": [e.model_dump() for e in spelling_errors],
        "words": [r.model_dump() for r in word_results],
        "coverage_met": coverage_met,
    }
    try:
        db.add(VocabWritingSession(
            user_id=owner_id(current_user),
            topic=(data.topic or "")[:300],
            per_type=data.per_type if data.per_type in PER_TYPE_CHOICES else 5,
            shown_words=json.dumps(
                [{"id": w.id, "word": w.word, "pos": w.part_of_speech or ""} for w in rows],
                ensure_ascii=False,
            ),
            user_text=text,
            word_count=word_count,
            total_shown=total_shown,
            required=required,
            used_count=used_count,
            score=score,
            evaluation=json.dumps(evaluation, ensure_ascii=False),
        ))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return VocabWritingSubmitOut(
        score=score,
        score_reason_es=str(result.get("score_reason_es", "")),
        feedback_es=str(result.get("feedback_es", "")),
        encouragement_es=str(result.get("encouragement_es", "¡Sigue así!")),
        word_count=word_count,
        total_shown=total_shown,
        required=required,
        used_count=used_count,
        coverage_met=coverage_met,
        words=word_results,
        spelling_errors=spelling_errors,
        spelling_checked=len(spell_raw),
        daily_used=used_today + 1,
        daily_limit=DAILY_LIMIT,
    )


@router.get("/history", response_model=VocabWritingHistoryOut)
def get_history(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Últimas notas, para ver la evolución sin abrir cada texto."""
    rows = (
        scope_to_owner(db.query(VocabWritingSession), VocabWritingSession, current_user)
        .order_by(VocabWritingSession.created_at.desc())
        .limit(limit)
        .all()
    )
    return VocabWritingHistoryOut(items=[
        VocabWritingHistoryItem(
            id=r.id,
            created_at=r.created_at,
            topic=r.topic or "",
            score=float(r.score or 0.0),
            used_count=int(r.used_count or 0),
            required=int(r.required or 0),
            total_shown=int(r.total_shown or 0),
            word_count=int(r.word_count or 0),
        )
        for r in rows
    ])
