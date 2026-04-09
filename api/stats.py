from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Word, Category, Review

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    total_words = db.query(func.count(Word.id)).scalar()
    avg_mastery = db.query(func.avg(Word.mastery_level)).scalar() or 0
    due_now = (
        db.query(func.count(Word.id))
        .filter(Word.next_review <= datetime.now(timezone.utc))
        .scalar()
    )
    total_reviews = db.query(func.count(Review.id)).scalar()
    return {
        "total_words": total_words,
        "average_mastery": round(avg_mastery, 1),
        "due_for_review": due_now,
        "total_reviews": total_reviews,
    }


@router.get("/by-category")
def by_category(db: Session = Depends(get_db)):
    cats = db.query(Category).all()
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
    uncategorized = db.query(Word).filter(Word.category_id.is_(None)).all()
    if uncategorized:
        avg = sum(w.mastery_level for w in uncategorized) / len(uncategorized)
        result.append({
            "id": None, "name": "Sin categoría", "color": "#64748b",
            "icon": "📝", "word_count": len(uncategorized),
            "avg_mastery": round(avg, 1),
        })
    return result


@router.get("/activity")
def activity(days: int = 30, db: Session = Depends(get_db)):
    """Review count per day for the last N days (for heatmap/chart)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    reviews = (
        db.query(
            func.date(Review.reviewed_at).label("day"),
            func.count(Review.id).label("count"),
        )
        .filter(Review.reviewed_at >= since)
        .group_by(func.date(Review.reviewed_at))
        .all()
    )
    return [{"date": str(r.day), "count": r.count} for r in reviews]


@router.get("/mastery-distribution")
def mastery_distribution(db: Session = Depends(get_db)):
    """Group words by mastery ranges: 0-20, 20-40, 40-60, 60-80, 80-100."""
    words = db.query(Word.mastery_level).all()
    buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for (m,) in words:
        if m < 20: buckets["0-20"] += 1
        elif m < 40: buckets["20-40"] += 1
        elif m < 60: buckets["40-60"] += 1
        elif m < 80: buckets["60-80"] += 1
        else: buckets["80-100"] += 1
    return buckets
