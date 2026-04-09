from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Word
from api.schemas import WordCreate, WordUpdate, WordOut

router = APIRouter(prefix="/api/words", tags=["words"])


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
):
    q = db.query(Word)
    if category_id:
        q = q.filter(Word.category_id == category_id)
    if search:
        pattern = f"%{search}%"
        q = q.filter(Word.word.ilike(pattern) | Word.translation.ilike(pattern))
    words = q.order_by(Word.created_at.desc()).all()
    return [_word_to_out(w) for w in words]


@router.get("/{word_id}", response_model=WordOut)
def get_word(word_id: int, db: Session = Depends(get_db)):
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404, "Word not found")
    return _word_to_out(w)


@router.post("/", response_model=WordOut, status_code=201)
def create_word(data: WordCreate, db: Session = Depends(get_db)):
    w = Word(**data.model_dump())
    db.add(w)
    db.commit()
    db.refresh(w)
    return _word_to_out(w)


@router.put("/{word_id}", response_model=WordOut)
def update_word(word_id: int, data: WordUpdate, db: Session = Depends(get_db)):
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404, "Word not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(w, field, value)
    db.commit()
    db.refresh(w)
    return _word_to_out(w)


@router.delete("/{word_id}", status_code=204)
def delete_word(word_id: int, db: Session = Depends(get_db)):
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404, "Word not found")
    db.delete(w)
    db.commit()
