from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Word, Review
from api.schemas import ReviewCreate, ReviewOut, WordOut

router = APIRouter(prefix="/api/reviews", tags=["reviews"])


# ── SM-2 adapted for binary feedback ────────────────────────
# Correct  → quality 4 (Good)  → interval grows exponentially
# Incorrect → quality 1 (Fail) → reset to immediate review
_QUALITY_MAP = {"correct": 4, "incorrect": 1}


def _sm2(quality: int, repetitions: int, ease_factor: float, interval: int):
    """SM-2 spaced repetition algorithm.

    Correct (quality >= 3):
      rep 0 → 1 day, rep 1 → 3 days, rep 2+ → interval * EF
      EF increases slightly (+0.1)

    Incorrect (quality < 3):
      Reset reps to 0, interval back to 1 day.
      EF decreases (min 1.3) so future intervals are shorter.
    """
    if quality >= 3:  # ── CORRECT ──
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 3
        else:
            interval = round(interval * ease_factor)
        repetitions += 1
        ease_factor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    else:             # ── INCORRECT ──
        repetitions = 0
        interval = 1
        ease_factor -= 0.2

    ease_factor = max(1.3, ease_factor)
    return repetitions, ease_factor, interval


def _mastery_from_sm2(repetitions: int, ease_factor: float) -> float:
    """Convert SM-2 state to a 0-100 mastery score.

    Score composition:
      70% from repetition streak (max at 8 consecutive correct)
      30% from ease factor health (how well you've been doing overall)
    """
    rep_score = min(repetitions / 8, 1.0) * 70
    ease_score = min((ease_factor - 1.3) / 1.2, 1.0) * 30
    return round(rep_score + ease_score, 1)


def _word_to_out(w: Word):
    from api.words import _word_to_out as _wto
    return _wto(w)


@router.get("/practice", response_model=list[WordOut])
def get_practice_words(
    category_id: int | None = Query(None, description="Filter by category"),
    days: int | None = Query(None, description="Only words added in the last N days (0 = today)"),
    difficulty_min: int | None = Query(None, ge=1, le=5, description="Min difficulty (1-5)"),
    difficulty_max: int | None = Query(None, ge=1, le=5, description="Max difficulty (1-5)"),
    db: Session = Depends(get_db),
):
    """Return ALL words matching filters — for free practice regardless of schedule."""
    q = db.query(Word)

    if category_id:
        q = q.filter(Word.category_id == category_id)

    if days is not None:
        # days=0 → only today, days=1 → last 2 calendar days, etc.
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        q = q.filter(Word.created_at >= cutoff)

    if difficulty_min is not None:
        q = q.filter(Word.difficulty >= difficulty_min)
    if difficulty_max is not None:
        q = q.filter(Word.difficulty <= difficulty_max)

    words = q.order_by(Word.created_at.desc()).all()
    return [_word_to_out(w) for w in words]


@router.post("/", response_model=ReviewOut, status_code=201)
def submit_review(data: ReviewCreate, db: Session = Depends(get_db)):
    """Submit a review. quality accepts 0-5 or the string mapping (4=correct, 1=incorrect)."""
    if not 0 <= data.quality <= 5:
        raise HTTPException(400, "Quality must be 0-5")

    word = db.query(Word).get(data.word_id)
    if not word:
        raise HTTPException(404, "Word not found")

    reps, ef, ivl = _sm2(data.quality, word.repetitions, word.ease_factor, word.interval)
    word.repetitions = reps
    word.ease_factor = ef
    word.interval = ivl
    word.mastery_level = _mastery_from_sm2(reps, ef)
    word.next_review = datetime.now(timezone.utc) + timedelta(days=ivl)

    review = Review(word_id=data.word_id, quality=data.quality)
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewOut(
        id=review.id, word_id=review.word_id,
        quality=review.quality, reviewed_at=review.reviewed_at
    )
