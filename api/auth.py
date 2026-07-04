"""
Autenticación multi-usuario con JWT (invite-only).

Tres roles: admin | premium | free. Login con email + contraseña; el servidor
emite un JWT (HS256) que el frontend (y la extensión de Chrome) mandan como
`Authorization: Bearer <token>`.

Env vars:
    JWT_SECRET       secreto para firmar los tokens (obligatorio en prod).
    ALLOW_OPEN_MODE  "1" habilita el modo local abierto (sin login) cuando no hay
                     JWT_SECRET. Por defecto DESACTIVADO → sin config, fail-closed.
"""

import logging
import os
import time
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import User

logger = logging.getLogger(__name__)

_JWT_SECRET = os.environ.get("JWT_SECRET", "")
_JWT_ALG = "HS256"
_TOKEN_TTL_HOURS = 24
# Modo local abierto: por defecto DESACTIVADO. Si falta config de auth en un
# entorno real (p. ej. variable de Render mal puesta), la API debe responder
# 401 en vez de abrirse como admin. El usuario lo habilita a propósito en su
# .env local con ALLOW_OPEN_MODE=1 si quiere seguir sin login en localhost.
_ALLOW_OPEN_MODE = os.environ.get("ALLOW_OPEN_MODE", "") == "1"

if _JWT_SECRET and len(_JWT_SECRET) < 32:
    logger.warning(
        "JWT_SECRET tiene menos de 32 caracteres; se recomienda una clave "
        "más larga y aleatoria (p. ej. generada con `openssl rand -hex 32`)."
    )

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
    db: Session = Depends(get_db),
) -> User:
    """
    Resuelve el usuario actual por (en orden):
        1. JWT Bearer válido.
        2. Modo local abierto: si NO hay JWT_SECRET configurado Y además
           ALLOW_OPEN_MODE=1, acceso abierto como antes (admin real si existe,
           si no transitorio). Sin ALLOW_OPEN_MODE, fail-closed.
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

    # 2. Modo local abierto: solo si se habilita explícitamente con
    #    ALLOW_OPEN_MODE=1. Si la auth no está configurada y el modo abierto
    #    NO está habilitado, se cae al 401 de abajo (fail-closed).
    if not _JWT_SECRET and _ALLOW_OPEN_MODE:
        return _first_admin(db) or _transient_admin()

    raise HTTPException(401, "No autenticado")


def require_role(*roles: str):
    """Dependencia: exige que el usuario tenga uno de los roles indicados."""
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "No tienes permiso para esta acción")
        return user
    return _dep


# ── Scoping de datos por usuario ────────────────────────────────────────────
def owner_id(user: User) -> int | None:
    """
    ID a usar como dueño al ESCRIBIR. Devuelve None en modo local abierto
    (admin transitorio id=0): así las filas quedan sin asignar y un futuro
    backfill las adjudica al admin real cuando se configure la auth.
    """
    return user.id if (user and user.id and user.id > 0) else None


def scope_to_owner(query, model, user):
    """
    Filtra una query por el dueño. En modo local abierto (id=0) NO filtra
    (se ve todo, como antes de multi-usuario).
    """
    oid = owner_id(user)
    if oid is None:
        return query
    return query.filter(model.user_id == oid)


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


# ── Rate limiting de login (fuerza bruta) ───────────────────────────────────
# En memoria: alcanza para uvicorn de un solo worker (Render free tier no
# necesita más). Se limita por email Y por IP para que no baste con rotar
# uno de los dos.
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 15 * 60
_login_attempts: dict[str, list[float]] = {}


def _check_login_rate_limit(key: str) -> None:
    now = time.time()
    attempts = [t for t in _login_attempts.get(key, []) if now - t < _LOGIN_WINDOW_SECONDS]
    _login_attempts[key] = attempts
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.")


def _register_failed_login(key: str) -> None:
    _login_attempts.setdefault(key, []).append(time.time())


@router.post("/login", response_model=LoginOut)
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = (data.email or "").strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    email_key = f"email:{email}"
    ip_key = f"ip:{client_ip}"

    _check_login_rate_limit(email_key)
    _check_login_rate_limit(ip_key)

    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not user.is_active or not verify_password(data.password, user.password_hash):
        _register_failed_login(email_key)
        _register_failed_login(ip_key)
        raise HTTPException(401, "Email o contraseña incorrectos")
    try:
        token = create_access_token(user)
    except RuntimeError as exc:
        logger.error("No se pudo emitir el token de acceso: %s", exc)
        raise HTTPException(503, "Autenticación no configurada correctamente en el servidor.") from exc
    return LoginOut(access_token=token, role=user.role, email=user.email)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, email=user.email, role=user.role)
