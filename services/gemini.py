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


_PROMPT = """You are a Spanish-speaking English tutor for a Spanish student
learning English. The student asks for the full contextual meaning of the word
or phrase: "{word}"

Return a JSON object with this EXACT structure and nothing else:

{{
  "word": "the original word/phrase, lowercased",
  "phonetic": "IPA pronunciation (e.g. /ʃʊər/), empty string if unknown",
  "meanings": [
    {{
      "part_of_speech": "noun|verb|adjective|adverb|interjection|phrase|...",
      "translation_es": "traducción principal al español (1-3 palabras)",
      "definition_en": "short English definition (max 15 words)",
      "definition_es": "definición corta en español (max 15 palabras)",
      "examples": [
        {{
          "en": "Natural conversational English sentence using the word",
          "es": "Traducción natural al español de la frase"
        }}
      ]
    }}
  ],
  "common_phrases": [
    {{
      "phrase": "common phrase, idiom or collocation containing the word (e.g. 'make sure', 'for sure')",
      "meaning_es": "significado del phrase en español",
      "example_en": "example sentence using the phrase",
      "example_es": "traducción al español del ejemplo"
    }}
  ]
}}

Rules:
- Include ALL common distinct meanings. For example, for "sure" include:
  confirmation ("yes, of course"), certainty ("I am sure"), and the phrases
  "make sure", "for sure", "sure thing".
- Each meaning must have 1 to 2 REAL, natural, conversational example sentences
  — not literary or overly formal.
- `common_phrases` should list idioms and collocations (max 5).
- Spanish translations must be natural Spanish (Latin American / neutral).
- If the word has only one meaning, return only one item in `meanings`.
- Return ONLY valid JSON. Do not include markdown, code fences or any
  explanation text.
"""


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
    prompt = _PROMPT.format(word=word.strip())
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
