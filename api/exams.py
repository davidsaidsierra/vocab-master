"""
International Exams — de momento solo TOEFL iBT Writing 2026.

Dos modos:
    - practice    relajada, con ayudas (timer libre, pistas, Add Word ES↔EN).
    - simulation  fiel al examen real y calificada por la LLM según las rúbricas
                  oficiales de ETS.

La sección Writing tiene 3 tareas:
    - build_sentence       determinista (sin IA): 1 punto por frase perfecta.
    - email                IA: rúbrica "Write an Email" (banda 0–5).
    - academic_discussion  IA: rúbrica oficial "Academic Discussion" (banda 0–5).

Regla de un solo round-trip: cada tarea de ensayo se califica con EXACTAMENTE una
llamada a Groq. Build a Sentence no llama a la IA. La generación de una pregunta es
una operación aparte (una llamada) y SIEMPRE se persiste para reutilizar.
"""

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.schemas import (
    ExamSectionMeta, ExamMeta, ExamListOut,
    ExamQuestionOut, ExamQuestionSetOut,
    ExamAttemptCreateIn, ExamAttemptOut,
    ExamGradeTaskIn, ExamTaskResultOut,
    ExamFinalizeOut, ExamAttemptDetailOut,
    ExamHistoryItem, ExamHistoryOut,
)
from database.connection import get_db
from database.models import ExamQuestion, ExamAttempt, ExamTaskResult, User
from api.auth import get_current_user, owner_id, scope_to_owner
from api.quota import require_ai_access, consume_ai_quota
from services import groq as groq_service

router = APIRouter(prefix="/api/exams", tags=["exams"])

TASK_TYPES = ["build_sentence", "email", "academic_discussion"]


# ── Metadatos de exámenes (TOEFL activo; resto "Próximamente") ──────────────
def _exam_catalog() -> list[ExamMeta]:
    def sections(writing=False, reading=False, listening=False, speaking=False):
        return [
            ExamSectionMeta(key="writing", label="Writing", available=writing),
            ExamSectionMeta(key="reading", label="Reading", available=reading),
            ExamSectionMeta(key="listening", label="Listening", available=listening),
            ExamSectionMeta(key="speaking", label="Speaking", available=speaking),
        ]
    return [
        ExamMeta(
            key="toefl", name="TOEFL iBT", origin="Estados Unidos", flag="🇺🇸",
            total_duration="~1 h 30 min", available=True,
            description="Examen académico de ETS. Escala 1–6 (CEFR). Resultados en 72 h.",
            sections=sections(writing=True),
        ),
        ExamMeta(
            key="ielts", name="IELTS", origin="Reino Unido / Australia", flag="🇬🇧",
            total_duration="~2 h 45 min", available=False,
            description="Academic y General Training. Escala 1–9 por bandas.",
            sections=sections(),
        ),
        ExamMeta(
            key="cambridge", name="Cambridge (B2/C1/C2)", origin="Reino Unido", flag="🇬🇧",
            total_duration="~3 h 30 min", available=False,
            description="First (B2), Advanced (C1), Proficiency (C2). Escala Cambridge.",
            sections=sections(),
        ),
    ]


@router.get("/", response_model=ExamListOut)
def list_exams():
    return ExamListOut(exams=_exam_catalog())


# ── Helpers de banco de preguntas ───────────────────────────────────────────
def _question_out(q: ExamQuestion, *, hide_answers: bool = True) -> ExamQuestionOut:
    """Serializa una ExamQuestion; oculta las respuestas de build_sentence."""
    try:
        payload = json.loads(q.payload)
    except (json.JSONDecodeError, TypeError):
        payload = {}
    if hide_answers and q.task_type == "build_sentence" and isinstance(payload, dict):
        for s in payload.get("sentences", []):
            if isinstance(s, dict):
                s.pop("answer", None)  # la corrección es server-side
    return ExamQuestionOut(
        id=q.id, exam=q.exam, section=q.section, task_type=q.task_type,
        payload=payload if isinstance(payload, dict) else {},
        source=q.source, difficulty=q.difficulty,
    )


def _generate_and_store(db: Session, task_type: str, difficulty: str, user: User) -> ExamQuestion:
    if not groq_service.is_configured():
        raise HTTPException(503, "Groq no está configurado (falta GROQ_API_KEY)")
    # Generar una pregunta es una llamada a IA: exige premium/admin + cuota.
    require_ai_access(user)
    consume_ai_quota(user, db)
    try:
        payload = groq_service.generate_toefl_question(task_type=task_type, difficulty=difficulty)
    except groq_service.AIRateLimitError:
        raise HTTPException(429, "El servicio de IA está saturado ahora mismo. Intenta de nuevo en unos segundos.")
    except RuntimeError as exc:
        raise HTTPException(503, f"Servicio AI no disponible: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(502, f"Respuesta inválida del modelo: {exc}") from exc

    q = ExamQuestion(
        exam="toefl", section="writing", task_type=task_type,
        payload=json.dumps(payload, ensure_ascii=False),
        source="ai", difficulty=difficulty,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def _pick_or_generate(db: Session, task_type: str, *, generate: bool, user: User) -> ExamQuestion:
    if not generate:
        q = (
            db.query(ExamQuestion)
            .filter(ExamQuestion.task_type == task_type)
            .order_by(func.random())
            .first()
        )
        if q is not None:
            q.times_used = (q.times_used or 0) + 1
            db.commit()
            return q
    # banco vacío para ese tipo, o se pidió explícitamente generar → llamada a IA
    return _generate_and_store(db, task_type, "medium", user)


@router.get("/toefl/writing/question")
def get_question(
    task_type: str | None = Query(default=None),
    mode: str = Query(default="practice", pattern="^(practice|simulation)$"),
    generate: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    practice: requiere `task_type` y devuelve UNA pregunta.
    simulation: devuelve un set (una por cada tarea, en orden de examen).
    Si el banco está vacío para un tipo (o generate=true), genera y persiste.
    """
    if mode == "simulation":
        questions = [_question_out(_pick_or_generate(db, t, generate=generate, user=current_user)) for t in TASK_TYPES]
        return ExamQuestionSetOut(questions=questions)

    if task_type not in TASK_TYPES:
        raise HTTPException(400, f"task_type inválido: {task_type}")
    return _question_out(_pick_or_generate(db, task_type, generate=generate, user=current_user))


# ── Intentos ────────────────────────────────────────────────────────────────
def _round_half(x: float) -> float:
    return round(x * 2) / 2


def _norm_to_band(norm: float) -> float:
    """Normalizado 0–1 → banda CEFR 1.0–6.0 (incrementos de 0.5)."""
    band = 1.0 + max(0.0, min(1.0, norm)) * 5.0
    return _round_half(band)


def _cefr(band: float | None) -> str | None:
    if band is None:
        return None
    if band >= 6.0:
        return "C2"
    if band >= 5.0:
        return "C1"
    if band >= 4.0:
        return "B2"
    if band >= 3.0:
        return "B1"
    if band >= 2.0:
        return "A2"
    return "A1"


@router.post("/attempts", response_model=ExamAttemptOut)
def create_attempt(
    data: ExamAttemptCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.mode not in ("practice", "simulation"):
        raise HTTPException(400, f"mode inválido: {data.mode}")
    attempt = ExamAttempt(
        user_id=owner_id(current_user),
        exam=data.exam, section=data.section, mode=data.mode,
        time_limit_seconds=data.time_limit_seconds,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return ExamAttemptOut(
        id=attempt.id, exam=attempt.exam, section=attempt.section,
        mode=attempt.mode, time_limit_seconds=attempt.time_limit_seconds,
        section_band=None, cefr=None,
    )


_PUNCT_RE = re.compile(r"[^\w\s']", flags=re.UNICODE)


def _normalize_sentence(s: str) -> list[str]:
    """Tokeniza para comparación: minúsculas, sin puntuación, por espacios."""
    return _PUNCT_RE.sub("", (s or "").lower()).split()


def _grade_build_sentence(question: ExamQuestion, sentence_orders: list[list[str]]) -> dict:
    """Calificación determinista (sin IA). Devuelve evaluation + raw_score + normalized."""
    try:
        payload = json.loads(question.payload)
    except (json.JSONDecodeError, TypeError):
        payload = {}
    sentences = payload.get("sentences", []) if isinstance(payload, dict) else []
    total = len(sentences)
    details = []
    correct = 0
    for i, s in enumerate(sentences):
        answer = s.get("answer", "") if isinstance(s, dict) else ""
        user_words = sentence_orders[i] if i < len(sentence_orders) else []
        user_join = " ".join(user_words)
        is_ok = _normalize_sentence(user_join) == _normalize_sentence(answer)
        if is_ok:
            correct += 1
        details.append({"index": i, "answer": answer, "user": user_join, "correct": is_ok})
    normalized = (correct / total) if total else 0.0
    evaluation = {
        "type": "build_sentence",
        "correct": correct,
        "total": total,
        "details": details,
    }
    return {"evaluation": evaluation, "raw_score": float(correct), "normalized": normalized}


@router.post("/attempts/{attempt_id}/grade-task", response_model=ExamTaskResultOut)
def grade_task(
    attempt_id: int,
    data: ExamGradeTaskIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = scope_to_owner(
        db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id), ExamAttempt, current_user
    ).one_or_none()
    if attempt is None:
        raise HTTPException(404, f"Intento no encontrado: {attempt_id}")
    if data.task_type not in TASK_TYPES:
        raise HTTPException(400, f"task_type inválido: {data.task_type}")

    question = None
    if data.question_id is not None:
        question = db.query(ExamQuestion).filter(ExamQuestion.id == data.question_id).one_or_none()

    # ── Build a Sentence: determinista, sin IA ──────────────────────────────
    if data.task_type == "build_sentence":
        if question is None:
            raise HTTPException(400, "build_sentence requiere question_id")
        graded = _grade_build_sentence(question, data.sentence_orders)
        evaluation = graded["evaluation"]
        raw_score = graded["raw_score"]
        band = _norm_to_band(graded["normalized"])
        user_response = json.dumps(data.sentence_orders, ensure_ascii=False)

    # ── Ensayos: una llamada a Groq según la rúbrica ────────────────────────
    else:
        text = (data.user_response or "").strip()
        if not text:
            raise HTTPException(400, "El texto no puede estar vacío")
        if len(text) > 5000:
            raise HTTPException(400, "El texto es demasiado largo (max 5000 caracteres)")
        if question is None:
            raise HTTPException(400, f"{data.task_type} requiere question_id")
        if not groq_service.is_configured():
            raise HTTPException(503, "Groq no está configurado (falta GROQ_API_KEY)")
        # Calificar un ensayo es una llamada a IA: exige premium/admin + cuota.
        require_ai_access(current_user)
        consume_ai_quota(current_user, db)
        try:
            payload = json.loads(question.payload)
        except (json.JSONDecodeError, TypeError):
            payload = {}
        try:
            if data.task_type == "email":
                evaluation = groq_service.grade_toefl_email(
                    scenario=payload.get("scenario", ""),
                    requirements=payload.get("requirements", []),
                    user_text=text,
                )
            else:  # academic_discussion
                evaluation = groq_service.grade_toefl_discussion(
                    professor_prompt=payload.get("professor_prompt", ""),
                    student_responses=payload.get("student_responses", []),
                    user_text=text,
                )
        except groq_service.AIRateLimitError:
            raise HTTPException(429, "El servicio de IA está saturado ahora mismo. Intenta de nuevo en unos segundos.")
        except RuntimeError as exc:
            raise HTTPException(503, f"Servicio AI no disponible: {exc}") from exc
        except ValueError as exc:
            raise HTTPException(502, f"Respuesta inválida del modelo: {exc}") from exc

        raw_score = float(evaluation.get("band", 0) or 0)
        band = _norm_to_band(raw_score / 5.0)
        user_response = text

    result = ExamTaskResult(
        attempt_id=attempt.id,
        question_id=question.id if question else None,
        task_type=data.task_type,
        user_response=user_response,
        evaluation=json.dumps(evaluation, ensure_ascii=False),
        raw_score=raw_score,
        band=band,
    )
    db.add(result)
    db.commit()
    db.refresh(result)

    return ExamTaskResultOut(
        id=result.id, task_type=result.task_type,
        raw_score=result.raw_score, band=result.band,
        evaluation=evaluation, user_response=user_response,
    )


def _result_out(r: ExamTaskResult) -> ExamTaskResultOut:
    try:
        evaluation = json.loads(r.evaluation)
    except (json.JSONDecodeError, TypeError):
        evaluation = {}
    return ExamTaskResultOut(
        id=r.id, task_type=r.task_type, raw_score=r.raw_score, band=r.band,
        evaluation=evaluation if isinstance(evaluation, dict) else {},
        user_response=r.user_response or "",
    )


@router.post("/attempts/{attempt_id}/finalize", response_model=ExamFinalizeOut)
def finalize_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = scope_to_owner(
        db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id), ExamAttempt, current_user
    ).one_or_none()
    if attempt is None:
        raise HTTPException(404, f"Intento no encontrado: {attempt_id}")

    results = (
        db.query(ExamTaskResult)
        .filter(ExamTaskResult.attempt_id == attempt.id)
        .order_by(ExamTaskResult.id.asc())
        .all()
    )
    # Banda de sección = promedio de los normalizados de cada tarea → 1–6 (estimada).
    norms = [((r.band or 1.0) - 1.0) / 5.0 for r in results if r.band is not None]
    section_band = _norm_to_band(sum(norms) / len(norms)) if norms else None

    attempt.section_band = section_band
    attempt.submitted_at = datetime.now(timezone.utc)
    db.commit()

    return ExamFinalizeOut(
        attempt_id=attempt.id,
        section_band=section_band,
        cefr=_cefr(section_band),
        estimated=True,
        results=[_result_out(r) for r in results],
    )


@router.get("/attempts/{attempt_id}", response_model=ExamAttemptDetailOut)
def get_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = scope_to_owner(
        db.query(ExamAttempt).filter(ExamAttempt.id == attempt_id), ExamAttempt, current_user
    ).one_or_none()
    if attempt is None:
        raise HTTPException(404, f"Intento no encontrado: {attempt_id}")
    results = (
        db.query(ExamTaskResult)
        .filter(ExamTaskResult.attempt_id == attempt.id)
        .order_by(ExamTaskResult.id.asc())
        .all()
    )
    return ExamAttemptDetailOut(
        attempt=ExamAttemptOut(
            id=attempt.id, exam=attempt.exam, section=attempt.section,
            mode=attempt.mode, time_limit_seconds=attempt.time_limit_seconds,
            section_band=attempt.section_band, cefr=_cefr(attempt.section_band),
        ),
        results=[_result_out(r) for r in results],
        created_at=attempt.created_at,
        submitted_at=attempt.submitted_at,
    )


@router.get("/history", response_model=ExamHistoryOut)
def history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        scope_to_owner(db.query(ExamAttempt), ExamAttempt, current_user)
        .filter(ExamAttempt.submitted_at.isnot(None))
        .order_by(ExamAttempt.created_at.desc())
        .limit(limit)
        .all()
    )
    return ExamHistoryOut(attempts=[
        ExamHistoryItem(
            id=a.id, exam=a.exam, section=a.section, mode=a.mode,
            section_band=a.section_band, cefr=_cefr(a.section_band),
            created_at=a.created_at, submitted_at=a.submitted_at,
        )
        for a in rows
    ])
