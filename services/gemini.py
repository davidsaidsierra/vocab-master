"""
Gemini client for contextual word lookup.

Uses Google Gemini (free tier) to return structured JSON with
multiple meanings, translations, examples and common phrases
for an English word — all in one call.

Requires env var:  GEMINI_API_KEY
"""

import json
import os
from typing import Any

try:
    import google.generativeai as genai
except ImportError:
    genai = None  # type: ignore

from services.prompts import LOOKUP_PROMPT


_MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
_API_KEY = os.environ.get("GEMINI_API_KEY", "")
_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return
    if genai is None:
        raise RuntimeError(
            "google-generativeai no está instalado. "
            "Ejecuta: pip install -r requirements.txt"
        )
    if not _API_KEY:
        raise RuntimeError(
            "Falta la variable de entorno GEMINI_API_KEY. "
            "Obtén una gratis en https://aistudio.google.com/app/apikey"
        )
    genai.configure(api_key=_API_KEY)
    _configured = True


def lookup_word(word: str) -> dict[str, Any]:
    """
    Call Gemini and return the parsed lookup JSON for the given word.

    Raises:
        RuntimeError: if the API key is missing or Gemini returns an error.
        ValueError: if the response is not valid JSON.
    """
    _ensure_configured()

    model = genai.GenerativeModel(
        model_name=_MODEL_NAME,
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.3,
        },
    )
    prompt = LOOKUP_PROMPT.format(word=word.strip())
    resp = model.generate_content(prompt)

    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Gemini devolvió una respuesta vacía")

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini devolvió JSON inválido: {exc}") from exc

    # Minimal validation / normalization
    if not isinstance(data, dict):
        raise ValueError("Gemini no devolvió un objeto JSON")
    data.setdefault("word", word.strip().lower())
    data.setdefault("phonetic", "")
    data.setdefault("meanings", [])
    data.setdefault("common_phrases", [])
    return data
