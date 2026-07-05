"""
Nivel CEFR (A1–C2) por palabra, offline y determinista, vía `cefrpy`.

Sin IA y sin red: cefrpy trae su propia base SQLite (~172k palabras). Se usa para
etiquetar cada Word con su nivel y así poder filtrar/recomendar por nivel (p. ej.
"practicar solo mis palabras C1" o sugerir vocabulario al nivel de un examen).

Notas:
- Solo palabras SUELTAS. Frases/idioms ("make sure") devuelven None.
- El nivel depende del POS ("book" sustantivo=A1 vs verbo=B1). Si conocemos el
  part_of_speech (del lookup) afinamos; si no, usamos el promedio.
- Cobertura parcial: palabras fuera de la base devuelven None (se trata como
  "sin nivel", no es un error).
"""

from typing import Optional

try:
    from cefrpy import CEFRAnalyzer, POSTag
except ImportError:  # cefrpy es opcional: si falta, todo devuelve None sin romper
    CEFRAnalyzer = None  # type: ignore
    POSTag = None  # type: ignore

_analyzer: Optional["CEFRAnalyzer"] = None

# part_of_speech del lookup (texto libre en inglés) → etiqueta Penn de cefrpy.
_POS_MAP = {}
if POSTag is not None:
    _POS_MAP = {
        "noun": POSTag.NN,
        "verb": POSTag.VB,
        "adjective": POSTag.JJ,
        "adverb": POSTag.RB,
        "preposition": POSTag.IN,
        "pronoun": POSTag.PRP,
    }


def _get_analyzer():
    global _analyzer
    if _analyzer is None and CEFRAnalyzer is not None:
        _analyzer = CEFRAnalyzer()  # carga la base SQLite una sola vez
    return _analyzer


def level_for_word(word: str, pos: str | None = None) -> str | None:
    """
    Devuelve el nivel CEFR ('A1'..'C2') de una palabra, o None si no aplica
    (frase, palabra fuera de la base, o cefrpy no instalado).

    `pos` es opcional: si se pasa el part_of_speech en inglés ('noun', 'verb',
    ...) se usa el nivel específico de ese POS; si no, el promedio del término.
    """
    analyzer = _get_analyzer()
    if analyzer is None or not word:
        return None

    w = word.strip().lower()
    if not w or " " in w:  # solo palabras sueltas
        return None

    if pos and pos.lower() in _POS_MAP:
        lvl = analyzer.get_word_pos_level_CEFR(w, _POS_MAP[pos.lower()])
        if lvl:
            return str(lvl)

    lvl = analyzer.get_average_word_level_CEFR(w)
    return str(lvl) if lvl else None


def is_known_word(word: str) -> bool:
    """
    True si `word` está en la base de cefrpy (incluye formas conjugadas/
    plurales). Se usa como corrector ortográfico offline en
    `services/writing_metrics.py`: si no está, es candidata a typo.
    """
    analyzer = _get_analyzer()
    if analyzer is None or not word:
        return False
    w = word.strip().lower()
    if not w or " " in w:
        return False
    return bool(analyzer.is_word_in_database(w))
