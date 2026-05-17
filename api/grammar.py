"""
Grammar Knowledge Base endpoints.

Lee la tabla `grammar_topics` (poblada por scripts/import_grammar_kb.py)
y la expone para el picker del frontend y para que /api/writing/submit
pueda recuperar `content_md` por slug y pasarlo al prompt V2.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from api.schemas import (
    GrammarCategoryCount,
    GrammarTopicFull,
    GrammarTopicsOut,
)
from database.connection import get_db
from database.models import GrammarTopic

router = APIRouter(prefix="/api/grammar", tags=["grammar"])


@router.get("/topics", response_model=GrammarTopicsOut)
def list_topics(
    q: str | None = Query(default=None, max_length=100),
    level: str | None = Query(default=None, max_length=10),
    category: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=250),
    db: Session = Depends(get_db),
):
    query = db.query(GrammarTopic)

    if q:
        # SQLite LIKE es case-insensitive para ASCII por defecto.
        like = f"%{q.strip().lower()}%"
        query = query.filter(or_(
            func.lower(GrammarTopic.title).like(like),
            func.lower(GrammarTopic.keywords).like(like),
        ))
    if level:
        query = query.filter(GrammarTopic.level == level.strip())
    if category:
        query = query.filter(GrammarTopic.category == category.strip())

    rows = query.order_by(GrammarTopic.section_number.asc()).limit(limit).all()
    return GrammarTopicsOut(topics=rows)


@router.get("/topics/{slug}", response_model=GrammarTopicFull)
def get_topic(slug: str, db: Session = Depends(get_db)):
    row = db.query(GrammarTopic).filter(GrammarTopic.slug == slug).one_or_none()
    if row is None:
        raise HTTPException(404, f"Topic no encontrado: {slug}")
    return row


@router.get("/categories", response_model=list[GrammarCategoryCount])
def list_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(GrammarTopic.category, func.count(GrammarTopic.id))
        .group_by(GrammarTopic.category)
        .order_by(func.count(GrammarTopic.id).desc())
        .all()
    )
    return [GrammarCategoryCount(category=cat, count=n) for cat, n in rows]
