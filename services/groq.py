"""
Groq client for contextual word lookup — used as a fallback when
Gemini hits its daily / per-minute quota.

Groq's free tier offers far higher limits than Gemini's (roughly
30 req/min, ~14k/day) and is fast enough for interactive lookups.

Requires env var:  GROQ_API_KEY   (get one at https://console.groq.com)
"""

import json
import os
from typing import Any

try:
    from groq import Groq
except ImportError:
    Groq = None  # type: ignore

from services.prompts import LOOKUP_PROMPT


_MODEL_NAME = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
_API_KEY = os.environ.get("GROQ_API_KEY", "")
_client: Any = None


def _ensure_client() -> Any:
    global _client
    if _client is not None:
        return _client
    if Groq is None:
        raise RuntimeError(
            "groq no está instalado. Ejecuta: pip install -r requirements.txt"
        )
    if not _API_KEY:
        raise RuntimeError(
            "Falta la variable de entorno GROQ_API_KEY. "
            "Obtén una gratis en https://console.groq.com"
        )
    _client = Groq(api_key=_API_KEY)
    return _client


def is_configured() -> bool:
    """Cheap check used by the orchestrator to decide if fallback is possible."""
    return bool(_API_KEY) and Groq is not None


def lookup_word(word: str) -> dict[str, Any]:
    """
    Call Groq and return the parsed lookup JSON for the given word.
    Same output shape as services.gemini.lookup_word.
    """
    client = _ensure_client()
    prompt = LOOKUP_PROMPT.format(word=word.strip())

    resp = client.chat.completions.create(
        model=_MODEL_NAME,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    text = (resp.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("Groq devolvió una respuesta vacía")

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Groq devolvió JSON inválido: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError("Groq no devolvió un objeto JSON")
    data.setdefault("word", word.strip().lower())
    data.setdefault("phonetic", "")
    data.setdefault("meanings", [])
    data.setdefault("common_phrases", [])
    return data
