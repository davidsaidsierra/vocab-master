"""
Panel de administración: CRUD de usuarios. Solo para el rol admin.

Invite-only: aquí el admin da de alta a cada persona y le asigna su rol
(admin | premium | free), la activa o la desactiva, y puede resetear su
contraseña. Hay una salvaguarda contra quedarse sin ningún admin activo.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import User
from api.auth import require_role, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

ROLES = {"admin", "premium", "free"}


class UserCreateIn(BaseModel):
    email: str
    password: str
    role: str = "free"


class UserUpdateIn(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


class AdminUserOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    ai_calls_today: int


def _out(u: User) -> AdminUserOut:
    return AdminUserOut(
        id=u.id, email=u.email, role=u.role,
        is_active=bool(u.is_active), ai_calls_today=u.ai_calls_today or 0,
    )


def _active_admin_count(db: Session, exclude_id: int | None = None) -> int:
    q = db.query(User).filter(User.role == "admin", User.is_active == 1)
    if exclude_id is not None:
        q = q.filter(User.id != exclude_id)
    return q.count()


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    users = db.query(User).order_by(User.id.asc()).all()
    return [_out(u) for u in users]


@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_user(
    data: UserCreateIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    email = (data.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Email inválido")
    if data.role not in ROLES:
        raise HTTPException(400, f"Rol inválido: {data.role}")
    if len(data.password or "") < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Ya existe un usuario con ese email")
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _out(user)


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    data: UserUpdateIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None:
        raise HTTPException(404, "Usuario no encontrado")

    # Salvaguarda: no dejar el sistema sin ningún admin activo.
    will_lose_admin = (
        (data.role is not None and data.role != "admin" and user.role == "admin")
        or (data.is_active is False and user.role == "admin")
    )
    if will_lose_admin and _active_admin_count(db, exclude_id=user.id) == 0:
        raise HTTPException(400, "No puedes dejar la app sin ningún admin activo.")

    if data.role is not None:
        if data.role not in ROLES:
            raise HTTPException(400, f"Rol inválido: {data.role}")
        user.role = data.role
    if data.is_active is not None:
        user.is_active = 1 if data.is_active else 0
    if data.password:
        if len(data.password) < 6:
            raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
        user.password_hash = hash_password(data.password)

    db.commit()
    db.refresh(user)
    return _out(user)
