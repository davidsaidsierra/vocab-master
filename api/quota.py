"""
Gating de IA por rol + cuota diaria por usuario.

Protege el pool COMPARTIDO de Groq (una sola GROQ_API_KEY para todos):
    - admin    → IA ilimitada (incluye el admin transitorio del modo local).
    - premium  → tope diario PREMIUM_AI_DAILY + cooldown anti-ráfaga.
    - free     → sin IA (403).

`consume_ai_quota` se llama JUSTO antes de cada llamada real a la LLM y persiste
el contador en el propio usuario (campos ai_calls_date / ai_calls_today /
last_ai_call_at). Sin tablas extra ni Redis: basta con el free tier de Neon.
"""

import os
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database.models import User

PREMIUM_AI_DAILY = int(os.environ.get("PREMIUM_AI_DAILY", "40"))
AI_COOLDOWN_SECONDS = int(os.environ.get("AI_COOLDOWN_SECONDS", "15"))


def require_ai_access(user: User) -> None:
    """Lanza 403 si el rol no puede usar funciones con IA (free)."""
    if user.role not in ("admin", "premium"):
        raise HTTPException(
            403, "Esta función usa IA y requiere una cuenta premium."
        )


def consume_ai_quota(user: User, db: Session) -> None:
    """
    Verifica y consume una unidad de cuota de IA. Llamar antes de la llamada a la
    LLM. admin = ilimitado. Lanza 403 (rol free) o 429 (tope diario o cooldown).
    """
    require_ai_access(user)
    if user.role == "admin":
        return  # ilimitado (incluye admin transitorio id=0 del modo local)

    now = datetime.now(timezone.utc)
    today = now.date()

    # Reset diario del contador
    if user.ai_calls_date != today:
        user.ai_calls_date = today
        user.ai_calls_today = 0

    # Cooldown anti-ráfaga (protege el TPM compartido de Groq)
    if user.last_ai_call_at is not None:
        last = user.last_ai_call_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed = (now - last).total_seconds()
        if elapsed < AI_COOLDOWN_SECONDS:
            wait = int(AI_COOLDOWN_SECONDS - elapsed) + 1
            raise HTTPException(429, f"Espera {wait} segundos antes de otra acción con IA.")

    # Tope diario
    if (user.ai_calls_today or 0) >= PREMIUM_AI_DAILY:
        raise HTTPException(
            429,
            f"Alcanzaste el límite diario de {PREMIUM_AI_DAILY} acciones con IA. Vuelve mañana.",
        )

    # Consumir
    user.ai_calls_today = (user.ai_calls_today or 0) + 1
    user.last_ai_call_at = now
    db.commit()
