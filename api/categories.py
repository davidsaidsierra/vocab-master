from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.connection import get_db
from database.models import Category
from api.schemas import CategoryCreate, CategoryOut

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(Category).order_by(Category.name).all()
    return [
        CategoryOut(
            id=c.id, name=c.name, color=c.color, icon=c.icon,
            created_at=c.created_at, word_count=len(c.words)
        )
        for c in cats
    ]


@router.post("/", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    if db.query(Category).filter(Category.name == data.name).first():
        raise HTTPException(400, "Category already exists")
    cat = Category(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut(
        id=cat.id, name=cat.name, color=cat.color, icon=cat.icon,
        created_at=cat.created_at, word_count=0
    )


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).get(category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    db.delete(cat)
    db.commit()
