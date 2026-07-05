"""
Métricas deterministas de escritura — SIN IA — inspiradas en el reporte de
LingoLeap: desglose de errores por tipo y distribución de vocabulario por
nivel CEFR. Se calculan a partir de datos que YA existen:

    - `correction`/`evaluation` (el JSON que la IA ya devolvió y que se
      persiste en WritingChallenge.correction / ExamTaskResult.evaluation)
      trae `errors[].type` → el desglose por tipo sale gratis y es
      retroactivo sobre el historial (cero llamadas nuevas de IA).
    - El texto del usuario, analizado 100% offline con cefrpy (nivel CEFR
      por palabra) y opcionalmente `dictionary_entries` (spell-check).

Este módulo NUNCA importa services.groq ni services.gemini.
"""

import re
from typing import Any

from services import cefr

_WORD_RE = re.compile(r"[A-Za-z']+")
_SENTENCE_SPLIT_RE = re.compile(r"[.!?]+")

_CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
_ADVANCED = {"B2", "C1", "C2"}
_ALL_LEVEL_KEYS = _CEFR_ORDER + ["unknown"]


def _tokenize(text: str) -> list[str]:
    return _WORD_RE.findall(text or "")


def _sentence_count(text: str) -> int:
    parts = [p for p in _SENTENCE_SPLIT_RE.split(text or "") if p.strip()]
    return len(parts) if parts else (1 if (text or "").strip() else 0)


def _errors_by_type(correction: dict[str, Any] | None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for e in (correction or {}).get("errors") or []:
        if not isinstance(e, dict):
            continue
        t = str(e.get("type") or "").strip().lower() or "other"
        counts[t] = counts.get(t, 0) + 1
    return counts


# Contracciones comunes que cefrpy no reconoce con apóstrofe (p. ej. "let's",
# "don't"): si la base es una palabra conocida, la contracción no es un typo.
_CONTRACTION_SUFFIXES = ("'s", "'t", "'re", "'ve", "'ll", "'d", "'m")


def _is_known(word_lc: str, db=None) -> bool:
    if cefr.is_known_word(word_lc):
        return True
    if "'" in word_lc:
        for suf in _CONTRACTION_SUFFIXES:
            if word_lc.endswith(suf) and len(word_lc) > len(suf):
                if cefr.is_known_word(word_lc[: -len(suf)]):
                    return True
    if db is not None:
        from database.models import DictionaryEntry
        return db.query(DictionaryEntry).filter(DictionaryEntry.word == word_lc).first() is not None
    return False


def _empty_vocab_distribution() -> dict[str, float]:
    return {k: 0.0 for k in _ALL_LEVEL_KEYS}


def compute_metrics(user_text: str, correction: dict[str, Any] | None, db=None) -> dict[str, Any]:
    """
    Calcula métricas deterministas para un texto + su corrección de IA ya
    almacenada. `db` (SQLAlchemy Session) es opcional: si se pasa, refuerza el
    spell-check con `dictionary_entries` además de cefrpy. Sin `db` sigue
    funcionando (solo cefrpy) — así los tests unitarios no necesitan DB.
    """
    text = user_text or ""
    tokens = _tokenize(text)
    word_count = len(tokens)
    sentence_count = _sentence_count(text)

    errors_by_type = _errors_by_type(correction)
    errors_total = sum(errors_by_type.values())
    errors_per_100 = round((errors_total / word_count) * 100, 1) if word_count else 0.0

    # ── Spelling suspects: palabras no reconocidas, saltando nombres propios ─
    # (heurística: cualquier token capitalizado en el original se salta, para
    # no marcar "China"/"India" como typo; el costo es no detectar typos que
    # coincidan con inicio de oración, aceptable para este propósito).
    spelling_suspects: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        if len(tok) < 3 or any(ch.isdigit() for ch in tok):
            continue
        if tok[0].isupper():
            continue
        lc = tok.lower()
        if lc in seen:
            continue
        seen.add(lc)
        if not _is_known(lc, db):
            spelling_suspects.append(lc)
    spelling_suspects = spelling_suspects[:15]

    # ── Distribución de vocabulario por nivel CEFR ──────────────────────────
    level_counts = {lvl: 0 for lvl in _CEFR_ORDER}
    unknown_count = 0
    for tok in tokens:
        lvl = cefr.level_for_word(tok.lower())
        if lvl in level_counts:
            level_counts[lvl] += 1
        else:
            unknown_count += 1

    if word_count:
        vocab_distribution = {lvl: round(level_counts[lvl] / word_count * 100, 1) for lvl in _CEFR_ORDER}
        vocab_distribution["unknown"] = round(unknown_count / word_count * 100, 1)
        advanced_pct = round(sum(level_counts[lvl] for lvl in _ADVANCED) / word_count * 100, 1)
    else:
        vocab_distribution = _empty_vocab_distribution()
        advanced_pct = 0.0

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "errors_total": errors_total,
        "errors_by_type": errors_by_type,
        "errors_per_100": errors_per_100,
        "spelling_suspects": spelling_suspects,
        "vocab_distribution": vocab_distribution,
        "advanced_pct": advanced_pct,
    }


def merge_metrics(metrics_list: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Agrega varias métricas (p. ej. las tareas de ensayo de un mismo intento de
    examen) en una sola, ponderando por word_count donde aplica.
    """
    metrics_list = [m for m in (metrics_list or []) if m]
    if not metrics_list:
        return {
            "word_count": 0, "sentence_count": 0, "errors_total": 0,
            "errors_by_type": {}, "errors_per_100": 0.0,
            "spelling_suspects": [], "vocab_distribution": _empty_vocab_distribution(),
            "advanced_pct": 0.0,
        }

    total_words = sum(m.get("word_count", 0) for m in metrics_list)
    total_sentences = sum(m.get("sentence_count", 0) for m in metrics_list)

    errors_by_type: dict[str, int] = {}
    for m in metrics_list:
        for t, n in (m.get("errors_by_type") or {}).items():
            errors_by_type[t] = errors_by_type.get(t, 0) + n
    errors_total = sum(errors_by_type.values())
    errors_per_100 = round((errors_total / total_words) * 100, 1) if total_words else 0.0

    suspects: list[str] = []
    seen: set[str] = set()
    for m in metrics_list:
        for w in m.get("spelling_suspects", []) or []:
            if w not in seen:
                suspects.append(w)
                seen.add(w)
    suspects = suspects[:15]

    vocab_distribution: dict[str, float] = {}
    for lvl in _ALL_LEVEL_KEYS:
        if total_words:
            weighted = sum(
                (m.get("vocab_distribution") or {}).get(lvl, 0.0) * m.get("word_count", 0)
                for m in metrics_list
            )
            vocab_distribution[lvl] = round(weighted / total_words, 1)
        else:
            vocab_distribution[lvl] = 0.0
    advanced_pct = round(sum(vocab_distribution.get(lvl, 0.0) for lvl in _ADVANCED), 1)

    return {
        "word_count": total_words,
        "sentence_count": total_sentences,
        "errors_total": errors_total,
        "errors_by_type": errors_by_type,
        "errors_per_100": errors_per_100,
        "spelling_suspects": suspects,
        "vocab_distribution": vocab_distribution,
        "advanced_pct": advanced_pct,
    }
