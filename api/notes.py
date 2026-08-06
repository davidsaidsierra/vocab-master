"""
Apuntes personales en texto plano.

CRUD simple por usuario, sin IA y sin cuota: el valor está en que sea rápido
de escribir, no en la estructura.
"""

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from api.auth import get_current_user, owner_id, scope_to_owner
from api.schemas import NoteCreate, NoteOut, NoteUpdate
from database.connection import get_db
from database.models import Note, User

router = APIRouter(prefix="/api/notes", tags=["notes"])

_MAX_TITLE = 200
_MAX_CONTENT = 100_000


def _out(n: Note) -> NoteOut:
    return NoteOut(
        id=n.id,
        title=n.title,
        content=n.content or "",
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


def _get_owned(note_id: int, db: Session, user: User) -> Note:
    note = scope_to_owner(db.query(Note), Note, user).filter(Note.id == note_id).first()
    if note is None:
        raise HTTPException(404, "Apunte no encontrado")
    return note


@router.get("/", response_model=list[NoteOut])
def list_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista los apuntes del usuario, el más reciente primero."""
    notes = (
        scope_to_owner(db.query(Note), Note, current_user)
        .order_by(Note.updated_at.desc())
        .all()
    )
    return [_out(n) for n in notes]


@router.post("/", response_model=NoteOut, status_code=201)
def create_note(
    data: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = Note(
        user_id=owner_id(current_user),
        title=(data.title or "Sin título").strip()[:_MAX_TITLE] or "Sin título",
        content=(data.content or "")[:_MAX_CONTENT],
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _out(note)


@router.put("/{note_id}", response_model=NoteOut)
def update_note(
    data: NoteUpdate,
    note_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = _get_owned(note_id, db, current_user)
    if data.title is not None:
        note.title = data.title.strip()[:_MAX_TITLE] or "Sin título"
    if data.content is not None:
        note.content = data.content[:_MAX_CONTENT]
    db.commit()
    db.refresh(note)
    return _out(note)


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = _get_owned(note_id, db, current_user)
    db.delete(note)
    db.commit()
