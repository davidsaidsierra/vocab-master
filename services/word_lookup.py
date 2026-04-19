"""
Orchestrator: tries Gemini first, falls back to Groq on quota / rate-limit
or any other Gemini failure, as long as GROQ_API_KEY is configured.
"""

from typing import Any

from services import gemini, groq


def _looks_like_quota_error(exc: BaseException) -> bool:
    """Heuristic — Gemini SDK raises different error classes depending on
    the failure mode; we match on the message so we don't have to import
    google.api_core just for this."""
    msg = str(exc).lower()
    return any(
        kw in msg
        for kw in ("quota", "rate", "429", "exhausted", "limit", "resource_exhausted")
    )


def lookup_word(word: str) -> tuple[dict[str, Any], str]:
    """
    Returns (data, source) where source is "gemini" or "groq".
    Raises the last error if both providers fail.
    """
    try:
        return gemini.lookup_word(word), "gemini"
    except Exception as exc:
        # Only fall back if Groq is actually configured — otherwise re-raise
        # so the user sees the real Gemini error instead of a misleading one.
        if not groq.is_configured():
            raise
        # For non-quota errors we still try Groq (second opinion is cheap),
        # but we keep the original error to re-raise if Groq also fails.
        gemini_exc = exc

    try:
        return groq.lookup_word(word), "groq"
    except Exception as groq_exc:
        # Prefer surfacing the quota error if that's what caused the fallback.
        if _looks_like_quota_error(gemini_exc):
            raise RuntimeError(
                f"Gemini sin cuota y Groq también falló: {groq_exc}"
            ) from groq_exc
        raise gemini_exc
