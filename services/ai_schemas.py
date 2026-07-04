"""
Validación/normalización del JSON que devuelven los modelos de IA (Groq/Gemini).

Objetivo: forzar TIPOS correctos antes de que el dict de la IA circule por el
resto de la app. Si un modelo devuelve algo raro (un `score` como texto, `errors`
que no es una lista, un campo en `null`…), aquí se coacciona a un valor sano en
vez de reventar más adelante con un 500.

Diseño defensivo (importante en una app ya desplegada): los validadores son
TOLERANTES — coaccionan en lugar de rechazar — para NO introducir 502 nuevos por
pequeñas variaciones del modelo. Todos los campos tienen default. Lo único que se
garantiza es que el tipo de salida es el esperado.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator


# ── Coacciones auxiliares ────────────────────────────────────────────────────
def _to_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float, bool)):
        return str(v)
    return ""  # dict/list donde se espera texto → se descarta


def _to_int(v: Any) -> int:
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        try:
            return int(float(v.strip()))
        except (ValueError, TypeError):
            return 0
    return 0


def _to_bool(v: Any) -> bool:
    if isinstance(v, str):
        return v.strip().lower() in ("true", "yes", "1", "si", "sí")
    return bool(v)


def _to_list(v: Any) -> list:
    return v if isinstance(v, list) else []


def _to_str_list(v: Any) -> list[str]:
    if not isinstance(v, list):
        return []
    return [_to_str(x) for x in v if _to_str(x)]


def _to_dict(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def _to_dict_list(v: Any) -> list[dict]:
    """Lista de objetos: descarta cualquier elemento que no sea dict, para que un
    modelo que devuelva basura en la lista no rompa la validación."""
    if not isinstance(v, list):
        return []
    return [x for x in v if isinstance(x, dict)]


# ── Lookup ───────────────────────────────────────────────────────────────────
class _LookupExample(BaseModel):
    model_config = ConfigDict(extra="ignore")
    en: str = ""
    es: str = ""

    @field_validator("*", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)


class _LookupMeaning(BaseModel):
    model_config = ConfigDict(extra="ignore")
    part_of_speech: str = ""
    translation_es: str = ""
    definition_en: str = ""
    definition_es: str = ""
    examples: list[_LookupExample] = []

    @field_validator("part_of_speech", "translation_es", "definition_en", "definition_es", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)

    @field_validator("examples", mode="before")
    @classmethod
    def _l(cls, v):
        return _to_dict_list(v)


class _LookupPhrase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    phrase: str = ""
    meaning_es: str = ""
    example_en: str = ""
    example_es: str = ""

    @field_validator("*", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)


class LookupResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    word: str = ""
    phonetic: str = ""
    meanings: list[_LookupMeaning] = []
    common_phrases: list[_LookupPhrase] = []

    @field_validator("word", "phonetic", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)

    @field_validator("meanings", "common_phrases", mode="before")
    @classmethod
    def _l(cls, v):
        return _to_dict_list(v)


# ── Enriquecimiento por lote ─────────────────────────────────────────────────
class EnrichItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    word: str = ""
    translation_es: str = ""
    definition_en: str = ""
    example_en: str = ""
    notes_es: str = ""

    @field_validator("*", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)


class EnrichBatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    results: list[EnrichItem] = []

    @field_validator("results", mode="before")
    @classmethod
    def _l(cls, v):
        return _to_dict_list(v)


# ── Writing Challenge (V1 y V2 comparten forma) ──────────────────────────────
class WritingError(BaseModel):
    model_config = ConfigDict(extra="ignore")
    original: str = ""
    fix: str = ""
    type: str = ""
    explanation_es: str = ""
    reference_quote: str = ""

    @field_validator("*", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)


class VocabSuggestion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    word: str = ""
    reason_es: str = ""
    example_en: str = ""

    @field_validator("*", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)


class GrammarTopicUsage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    used: str = "no"  # yes | no | partial
    variant_used: str = ""
    explanation_es: str = ""

    @field_validator("*", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)

    @field_validator("used")
    @classmethod
    def _valid_used(cls, v: str) -> str:
        return v if v in ("yes", "no", "partial") else "no"


class WritingCorrection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    corrected: str = ""
    errors: list[WritingError] = []
    words_used_correctly: list[str] = []
    grammar_used_correctly: bool = False
    grammar_topic_usage: GrammarTopicUsage = GrammarTopicUsage()
    grammar_feedback_es: str = ""
    encouragement_es: str = "¡Sigue así!"
    score: int = 0
    vocabulary_suggestions: list[VocabSuggestion] = []

    @field_validator("corrected", "grammar_feedback_es", "encouragement_es", mode="before")
    @classmethod
    def _s(cls, v):
        return _to_str(v)

    @field_validator("errors", "vocabulary_suggestions", mode="before")
    @classmethod
    def _l(cls, v):
        return _to_dict_list(v)

    @field_validator("words_used_correctly", mode="before")
    @classmethod
    def _sl(cls, v):
        return _to_str_list(v)

    @field_validator("grammar_used_correctly", mode="before")
    @classmethod
    def _b(cls, v):
        return _to_bool(v)

    @field_validator("grammar_topic_usage", mode="before")
    @classmethod
    def _d(cls, v):
        return _to_dict(v)

    @field_validator("score", mode="before")
    @classmethod
    def _i(cls, v):
        return _to_int(v)


# ── Entrada única de validación ──────────────────────────────────────────────
def validate(model: type[BaseModel], data: Any) -> dict:
    """
    Valida `data` contra `model` y devuelve un dict limpio (tipos garantizados).
    Como los validadores son tolerantes, casi nunca lanza; si algo es
    estructuralmente imposible de coaccionar, se convierte en ValueError para que
    la capa API responda un 502 amable (ya mapeado en los routers).
    """
    if not isinstance(data, dict):
        raise ValueError("la IA no devolvió un objeto JSON")
    try:
        return model.model_validate(data).model_dump()
    except ValidationError as exc:
        raise ValueError(f"estructura inesperada del modelo de IA: {exc.error_count()} campo(s) inválido(s)") from exc
