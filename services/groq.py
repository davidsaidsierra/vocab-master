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
    from groq import RateLimitError as _GroqRateLimit
except ImportError:
    Groq = None  # type: ignore
    _GroqRateLimit = None  # type: ignore


class AIRateLimitError(RuntimeError):
    """Groq devolvió 429 (límite de tasa/TPM). Reintentar en unos segundos."""


def _create(client: Any, **kwargs: Any) -> Any:
    """
    Envoltorio único de chat.completions.create: traduce el 429 de Groq a
    AIRateLimitError para que la API lo devuelva como un 429 amable en español.
    Mantiene el round-trip único (no reintenta aquí).
    """
    try:
        return client.chat.completions.create(**kwargs)
    except Exception as exc:  # noqa: BLE001
        if _GroqRateLimit is not None and isinstance(exc, _GroqRateLimit):
            raise AIRateLimitError(str(exc)) from exc
        raise

from services.prompts import (
    BATCH_ENRICH_PROMPT,
    LOOKUP_PROMPT,
    WRITING_CHALLENGE_PROMPT,
    WRITING_CHALLENGE_PROMPT_V2,
    TOEFL_EMAIL_GRADING_PROMPT,
    TOEFL_DISCUSSION_GRADING_PROMPT,
    TOEFL_QUESTION_GEN_PROMPT,
    INJECTION_GUARD,
    wrap_untrusted,
)
from services import ai_schemas


# llama-3.3-70b-versatile fue deprecado por Groq (se apaga el 2026-08-16).
# gpt-oss-120b es el reemplazo recomendado por Groq, también en el free tier.
_MODEL_NAME = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
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

    resp = _create(
        client,
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

    data = ai_schemas.validate(ai_schemas.LookupResult, data)
    if not data.get("word"):
        data["word"] = word.strip().lower()
    return data


def enrich_words_batch(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Enriquece un lote de palabras de captura rápida en UNA sola llamada a Groq.

    `words`: lista de {"word": str, "translation": str} (traducción provisional).
    Devuelve una lista de dicts con: word, translation_es, definition_en,
    example_en, notes_es. Si el modelo omite alguna, se rellena con defaults.
    """
    if not words:
        return []

    client = _ensure_client()
    words_block = "\n".join(
        f'- {w.get("word", "").strip()} ({(w.get("translation") or "").strip() or "sin traducción"})'
        for w in words
    )
    prompt = BATCH_ENRICH_PROMPT.format(words_block=words_block)

    resp = _create(
        client,
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

    validated = ai_schemas.validate(ai_schemas.EnrichBatch, data)

    out: list[dict[str, Any]] = []
    for item in validated["results"]:
        out.append({
            "word": item["word"].strip().lower(),
            "translation_es": item["translation_es"].strip(),
            "definition_en": item["definition_en"].strip(),
            "example_en": item["example_en"].strip(),
            "notes_es": item["notes_es"].strip(),
            "synonyms_en": [s.strip().lower() for s in item["synonyms_en"] if s.strip()],
        })
    return out


def _call_json(prompt: str) -> dict[str, Any]:
    """Single Groq round-trip that returns a parsed JSON object. Shared helper."""
    client = _ensure_client()
    resp = _create(
        client,
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
    return data


def grade_toefl_email(
    *,
    scenario: str,
    requirements: list[str],
    user_text: str,
) -> dict[str, Any]:
    """Grade a TOEFL 2026 'Write an Email' task. Single round-trip."""
    requirements_block = "\n".join(f"- {r.strip()}" for r in requirements if r.strip())
    prompt = TOEFL_EMAIL_GRADING_PROMPT.format(
        injection_guard=INJECTION_GUARD,
        scenario=scenario.strip(),
        requirements_block=requirements_block or "(none)",
        user_text=wrap_untrusted(user_text.strip()),
    )
    data = _call_json(prompt)
    data.setdefault("band", 0)
    data.setdefault("criteria", {})
    data.setdefault("requirements_met", [])
    data.setdefault("corrected", user_text)
    data.setdefault("errors", [])
    data.setdefault("word_count", len(user_text.split()))
    data.setdefault("feedback_es", "")
    data.setdefault("encouragement_es", "¡Sigue así!")
    data.setdefault("vocabulary_suggestions", [])
    return data


def grade_toefl_discussion(
    *,
    professor_prompt: str,
    student_responses: list[dict[str, Any]],
    user_text: str,
) -> dict[str, Any]:
    """Grade a TOEFL 2026 'Write for an Academic Discussion' task. Single round-trip."""
    block = "\n\n".join(
        f'{(r.get("name") or "Student").strip()}: {(r.get("text") or "").strip()}'
        for r in student_responses
        if isinstance(r, dict)
    )
    prompt = TOEFL_DISCUSSION_GRADING_PROMPT.format(
        injection_guard=INJECTION_GUARD,
        professor_prompt=professor_prompt.strip(),
        student_responses_block=block or "(none)",
        user_text=wrap_untrusted(user_text.strip()),
    )
    data = _call_json(prompt)
    data.setdefault("band", 0)
    data.setdefault("rubric_justification_es", "")
    data.setdefault("matched_descriptors", [])
    data.setdefault("corrected", user_text)
    data.setdefault("errors", [])
    data.setdefault("word_count", len(user_text.split()))
    data.setdefault("feedback_es", "")
    data.setdefault("encouragement_es", "¡Sigue así!")
    data.setdefault("vocabulary_suggestions", [])
    return data


def generate_toefl_question(
    *,
    task_type: str,
    difficulty: str = "medium",
) -> dict[str, Any]:
    """
    Generate ONE new TOEFL Writing question for the given task_type. Single
    round-trip. Returns the `payload` dict to persist in ExamQuestion.
    """
    prompt = TOEFL_QUESTION_GEN_PROMPT.format(
        task_type=task_type,
        difficulty=difficulty,
    )
    return _call_json(prompt)


def correct_writing(
    *,
    grammar_topic: str,
    grammar_hint: str,
    target_words: list[str],
    user_text: str,
) -> dict[str, Any]:
    """
    Send a Writing Challenge submission to Groq and return the parsed JSON
    correction. Single round-trip; the prompt is intentionally compact to
    save tokens on the free tier.
    """
    client = _ensure_client()
    prompt = WRITING_CHALLENGE_PROMPT.format(
        injection_guard=INJECTION_GUARD,
        grammar_topic=grammar_topic.strip(),
        grammar_hint=grammar_hint.strip(),
        target_words=", ".join(target_words) if target_words else "(none)",
        user_text=wrap_untrusted(user_text.strip()),
    )

    resp = _create(
        client,
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

    data = ai_schemas.validate(ai_schemas.WritingCorrection, data)
    if not data.get("corrected"):
        data["corrected"] = user_text
    # V1 no emite grammar_topic_usage; se sintetiza desde el booleano para que
    # el frontend muestre el badge igual que en V2.
    if data["grammar_used_correctly"] and data["grammar_topic_usage"]["used"] == "no":
        data["grammar_topic_usage"]["used"] = "yes"
    return data


def correct_writing_v2(
    *,
    topic_title: str,
    topic_content_md: str,
    target_words: list[str],
    user_text: str,
) -> dict[str, Any]:
    """
    KB-grounded Writing Challenge correction. Single round-trip.
    Same shape as `correct_writing()` plus `reference_quote` per error and
    a top-level `vocabulary_suggestions` list.
    """
    client = _ensure_client()
    prompt = WRITING_CHALLENGE_PROMPT_V2.format(
        injection_guard=INJECTION_GUARD,
        topic_title=topic_title.strip(),
        reference_material=topic_content_md.strip(),
        target_words=", ".join(target_words) if target_words else "(none)",
        user_text=wrap_untrusted(user_text.strip()),
    )

    resp = _create(
        client,
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

    data = ai_schemas.validate(ai_schemas.WritingCorrection, data)
    if not data.get("corrected"):
        data["corrected"] = user_text
    # Back-compat: grammar_used_correctly = True si usó el tema (yes o partial).
    # El validador ya normalizó grammar_topic_usage.used a yes|no|partial.
    data["grammar_used_correctly"] = data["grammar_topic_usage"]["used"] in ("yes", "partial")
    return data
