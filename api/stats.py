from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Word, Category, Review, User, WritingChallenge, ExamAttempt
from api.auth import get_current_user, scope_to_owner

router = APIRouter(prefix="/api/stats", tags=["stats"])

_CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_words = scope_to_owner(db.query(func.count(Word.id)), Word, current_user).scalar()
    avg_mastery = scope_to_owner(db.query(func.avg(Word.mastery_level)), Word, current_user).scalar() or 0
    due_now = (
        scope_to_owner(db.query(func.count(Word.id)), Word, current_user)
        .filter(Word.next_review <= datetime.now(timezone.utc))
        .scalar()
    )
    total_reviews = scope_to_owner(db.query(func.count(Review.id)), Review, current_user).scalar()
    never_practiced = (
        scope_to_owner(db.query(func.count(Word.id)), Word, current_user)
        .filter(Word.repetitions == 0)
        .scalar()
    )
    mastered = (
        scope_to_owner(db.query(func.count(Word.id)), Word, current_user)
        .filter(Word.mastery_level >= 80)
        .scalar()
    )
    writing_count = scope_to_owner(
        db.query(func.count(WritingChallenge.id)), WritingChallenge, current_user
    ).scalar()
    exam_count = (
        scope_to_owner(db.query(func.count(ExamAttempt.id)), ExamAttempt, current_user)
        .filter(ExamAttempt.submitted_at.isnot(None))
        .scalar()
    )
    best_exam_band = (
        scope_to_owner(db.query(func.max(ExamAttempt.section_band)), ExamAttempt, current_user)
        .filter(ExamAttempt.submitted_at.isnot(None))
        .scalar()
    )
    return {
        "total_words": total_words,
        "average_mastery": round(avg_mastery, 1),
        "due_for_review": due_now,
        "total_reviews": total_reviews,
        "never_practiced": never_practiced,
        "mastered": mastered,
        "writing_count": writing_count,
        "exam_count": exam_count,
        "best_exam_band": round(best_exam_band, 1) if best_exam_band is not None else None,
    }


@router.get("/by-level")
def by_level(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Conteo de palabras por nivel CEFR (A1..C2) + 'none' (frases o fuera de la base de cefrpy)."""
    rows = (
        scope_to_owner(db.query(Word.cefr_level, func.count(Word.id)), Word, current_user)
        .group_by(Word.cefr_level)
        .all()
    )
    result = {lvl: 0 for lvl in _CEFR_LEVELS}
    result["none"] = 0
    for level, count in rows:
        key = level if level in result else "none"
        result[key] += count
    return result


@router.get("/level-progress")
def level_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Por nivel CEFR: cuántas palabras están dominadas (mastery >= 80), en
    progreso (con repasos pero < 80) y sin practicar (repetitions == 0).
    """
    rows = scope_to_owner(
        db.query(Word.cefr_level, Word.mastery_level, Word.repetitions), Word, current_user
    ).all()
    result = {lvl: {"mastered": 0, "in_progress": 0, "untouched": 0} for lvl in _CEFR_LEVELS}
    for level, mastery, repetitions in rows:
        if level not in result:
            continue
        bucket = result[level]
        if repetitions == 0:
            bucket["untouched"] += 1
        elif (mastery or 0) >= 80:
            bucket["mastered"] += 1
        else:
            bucket["in_progress"] += 1
    return result


@router.get("/by-category")
def by_category(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cats = scope_to_owner(db.query(Category), Category, current_user).all()
    result = []
    for c in cats:
        word_count = len(c.words)
        avg = sum(w.mastery_level for w in c.words) / word_count if word_count else 0
        result.append({
            "id": c.id, "name": c.name, "color": c.color,
            "icon": c.icon, "word_count": word_count,
            "avg_mastery": round(avg, 1),
        })
    # Include uncategorized words
    uncategorized = scope_to_owner(
        db.query(Word).filter(Word.category_id.is_(None)), Word, current_user
    ).all()
    if uncategorized:
        avg = sum(w.mastery_level for w in uncategorized) / len(uncategorized)
        result.append({
            "id": None, "name": "Sin categoría", "color": "#64748b",
            "icon": "📝", "word_count": len(uncategorized),
            "avg_mastery": round(avg, 1),
        })
    return result


@router.get("/activity")
def activity(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Review count per day for the last N days (for heatmap/chart)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    reviews = (
        scope_to_owner(
            db.query(
                func.date(Review.reviewed_at).label("day"),
                func.count(Review.id).label("count"),
            ),
            Review, current_user,
        )
        .filter(Review.reviewed_at >= since)
        .group_by(func.date(Review.reviewed_at))
        .all()
    )
    return [{"date": str(r.day), "count": r.count} for r in reviews]


@router.get("/mastery-distribution")
def mastery_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group words by mastery ranges: 0-20, 20-40, 40-60, 60-80, 80-100."""
    words = scope_to_owner(db.query(Word.mastery_level), Word, current_user).all()
    buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for (m,) in words:
        if m < 20: buckets["0-20"] += 1
        elif m < 40: buckets["20-40"] += 1
        elif m < 60: buckets["40-60"] += 1
        elif m < 80: buckets["60-80"] += 1
        else: buckets["80-100"] += 1
    return buckets
