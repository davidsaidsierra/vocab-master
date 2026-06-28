"""
Autenticación multi-usuario con JWT (invite-only).

Tres roles: admin | premium | free. Login con email + contraseña; el servidor
emite un JWT (HS256) que el frontend manda como `Authorization: Bearer <token>`.

Compatibilidad: durante la transición se acepta TAMBIÉN el viejo header
`X-API-Key` (== env API_KEY) y se trata a quien lo presente como el admin. Así el
frontend actual sigue funcionando hasta que se cambie al login. Este puente se
retira en la Fase 4.

Env vars:
    JWT_SECRET       secreto para firmar los tokens (obligatorio en prod).
    API_KEY          (legacy) clave única anterior; puente de compatibilidad.
"""

import os
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import User

_LEGACY_API_KEY = os.environ.get("API_KEY", "")
_JWT_SECRET = os.environ.get("JWT_SECRET", "")
_JWT_ALG = "HS256"
_TOKEN_TTL_HOURS = 24

# pbkdf2_sha256: puro Python, sin compilar nada nativo → instala igual en
# Windows y en Render (evita los líos de wheels de bcrypt).
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


# ── Hash de contraseñas ─────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


# ── JWT ─────────────────────────────────────────────────────────────────────
def create_access_token(user: User) -> str:
    if not _JWT_SECRET:
        raise RuntimeError("Falta la variable de entorno JWT_SECRET")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(hours=_TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALG)


# ── Dependencias de FastAPI ─────────────────────────────────────────────────
def _first_admin(db: Session) -> User | None:
    return (
        db.query(User)
        .filter(User.role == "admin", User.is_active == 1)
        .order_by(User.id.asc())
        .first()
    )


def _transient_admin() -> User:
    """
    Admin no persistido (id=0) para el modo local sin auth configurada y sin
    usuarios todavía. Preserva el comportamiento anterior (acceso abierto en
    localhost) sin reventar las dependencias que esperan un User.
    """
    return User(id=0, email="local@admin", role="admin", is_active=1)


async def get_current_user(
    authorization: str = Header(default=""),
    x_api_key: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    """
    Resuelve el usuario actual por (en orden):
        1. JWT Bearer válido.
        2. Puente legacy X-API-Key → admin (compatibilidad temporal).
        3. Modo local abierto: si NO hay JWT_SECRET ni API_KEY configurados,
           acceso abierto como antes (admin real si existe, si no transitorio).
    Lanza 401 si nada aplica.
    """
    # 1. JWT Bearer
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if _JWT_SECRET and token:
            try:
                payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
            except jwt.PyJWTError:
                raise HTTPException(401, "Token inválido o expirado")
            try:
                uid = int(payload.get("sub", 0))
            except (TypeError, ValueError):
                uid = 0
            user = db.query(User).filter(User.id == uid).one_or_none()
            if user is None or not user.is_active:
                raise HTTPException(401, "Usuario no encontrado o inactivo")
            return user

    # 2. Puente legacy X-API-Key → admin
    if _LEGACY_API_KEY and x_api_key == _LEGACY_API_KEY:
        return _first_admin(db) or _transient_admin()

    # 3. Modo local abierto (sin auth configurada): acceso abierto como antes
    if not _JWT_SECRET and not _LEGACY_API_KEY:
        return _first_admin(db) or _transient_admin()

    raise HTTPException(401, "No autenticado")


def require_role(*roles: str):
    """Dependencia: exige que el usuario tenga uno de los roles indicados."""
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "No tienes permiso para esta acción")
        return user
    return _dep


# ── Compatibilidad: se mantiene la firma anterior por si algo la importa ─────
async def verify_api_key(x_api_key: str = Header(default="")):
    """DEPRECATED: reemplazado por get_current_user. Se conserva sin uso."""
    if _LEGACY_API_KEY and x_api_key != _LEGACY_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Endpoints de autenticación ──────────────────────────────────────────────
router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str


class MeOut(BaseModel):
    id: int
    email: str
    role: str


@router.post("/login", response_model=LoginOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    email = (data.email or "").strip().lower()
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not user.is_active or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Email o contraseña incorrectos")
    try:
        token = create_access_token(user)
    except RuntimeError as exc:
        raise HTTPException(503, f"Auth no configurada: {exc}") from exc
    return LoginOut(access_token=token, role=user.role, email=user.email)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, email=user.email, role=user.role)
