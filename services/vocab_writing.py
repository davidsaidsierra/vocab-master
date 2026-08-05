"""
Motor DETERMINISTA del ejercicio "Escribir un texto" (repaso de vocabulario).

Cero llamadas a IA. Aquí se resuelve todo lo que se puede resolver con reglas,
para que la única llamada a Groq (ver services/groq.evaluate_vocab_writing) se
gaste solo en lo que necesita juicio semántico: si la palabra está BIEN usada.

Reparto:
    - ¿la palabra objetivo APARECE en el texto?  → aquí (tolerancia morfológica)
    - ¿está bien/naturalmente usada?             → IA
    - candidatos a error de ortografía           → aquí (58k headwords offline)
    - descartar falsos positivos de ortografía   → IA (misma llamada, lista corta)

El frontend necesita la MISMA detección para ir marcando en vivo qué palabras ya
se usaron. Para que las dos implementaciones no puedan divergir en la parte
difícil (la morfología), no se replica el algoritmo en JS: `match_spec()` exporta
las formas ya expandidas y el navegador solo comprueba pertenencia a un conjunto.
"""

import re
from typing import Any, Iterable

from sqlalchemy.orm import Session

# Un "token" es una palabra alfabética; se admiten apóstrofos y guiones internos
# (don't, thought-provoking). Los números y símbolos no se consideran palabras.
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'’\-]*")

# ── Sufijos ──────────────────────────────────────────────────────────────────
# FLEXIVOS: misma palabra, otra forma (help/helped/helping). Son los únicos que
# se usan para decidir si el usuario "usó" la palabra objetivo.
_INFLECTIONAL = ("s", "es", "ed", "d", "ing", "ies", "ied")
# GRADO: solo para adjetivos y adverbios (fast/faster/fastest). Fuera de ahí
# generan falsos positivos famosos: use→user, cat→cater, bet→better.
_DEGREE = ("er", "est", "ier", "iest")
# DERIVATIVOS: cambian de palabra. Solo valen para BUSCAR el lema en el
# diccionario (donde sobre-generar es inocuo), nunca para detectar uso.
_DERIVATIONAL = ("er", "est", "ly", "ier", "iest", "ily")

_LEMMA_SUFFIXES = tuple(dict.fromkeys(_INFLECTIONAL + _DERIVATIONAL))

# Palabras vacías: no identifican una frase multi-palabra ("To jump start your
# creativity" se reconoce por jump/start/creativity, no por to/your).
_FUNCTION_WORDS = {
    "a", "an", "the", "to", "of", "in", "on", "at", "for", "with", "by", "from",
    "my", "your", "his", "her", "its", "our", "their", "this", "that", "these",
    "those", "be", "is", "am", "are", "was", "were", "been", "being", "do",
    "does", "did", "have", "has", "had", "and", "or", "as", "it", "you", "i",
    "he", "she", "we", "they", "some", "any", "one",
}

# Contracciones y formas que el diccionario offline (FreeDict) no trae como
# headword. Sin esta lista, el corrector marcaría "don't" o "we're" como error.
_CONTRACTIONS = {
    "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll", "you'd",
    "he's", "he'll", "he'd", "she's", "she'll", "she'd", "it's", "it'll", "it'd",
    "we're", "we've", "we'll", "we'd", "they're", "they've", "they'll", "they'd",
    "that's", "there's", "here's", "who's", "what's", "let's", "isn't", "aren't",
    "wasn't", "weren't", "don't", "doesn't", "didn't", "haven't", "hasn't",
    "hadn't", "won't", "wouldn't", "can't", "cannot", "couldn't", "shouldn't",
    "mustn't", "mightn't", "needn't", "shan't", "ain't", "o'clock",
}

# Palabras funcionales muy frecuentes: se dan por buenas sin consultar nada.
_ALWAYS_OK = _FUNCTION_WORDS | _CONTRACTIONS | {
    "not", "no", "yes", "so", "but", "if", "then", "than", "when", "while",
    "because", "although", "though", "however", "also", "very", "just", "only",
    "more", "most", "less", "least", "much", "many", "few", "all", "both",
    "each", "every", "other", "another", "same", "such", "own", "about",
    "after", "before", "during", "between", "into", "onto", "over", "under",
    "up", "down", "out", "off", "again", "once", "there", "here", "where",
    "how", "why", "what", "which", "who", "whom", "whose", "will", "would",
    "can", "could", "shall", "should", "may", "might", "must", "me", "him",
    "us", "them", "myself", "yourself", "himself", "herself", "itself",
    "ourselves", "yourselves", "themselves", "mine", "yours", "hers", "ours",
    "theirs", "ok", "okay",
}


# ── Tokenización ─────────────────────────────────────────────────────────────
def count_words(text: str) -> int:
    """Palabras como las cuenta un procesador de texto: bloques sin espacios."""
    return len([t for t in re.split(r"\s+", (text or "").strip()) if t])


def tokens_with_pos(text: str) -> list[tuple[str, int]]:
    """[(token, offset)] — el offset sirve para detectar inicio de oración."""
    return [(m.group(0), m.start()) for m in _TOKEN_RE.finditer(text or "")]


def text_tokens(text: str) -> list[str]:
    """
    Tokens normalizados para comparar. Los compuestos con guion se PARTEN
    ("jump-started" → jump, started) y lo mismo se hace con la palabra objetivo,
    así "thought-provoking" guardado casa con "thought provoking" escrito, y
    "To jump start…" casa con "I jump-started…".
    """
    out: list[str] = []
    for tok, _ in tokens_with_pos(text):
        n = _norm(tok)
        if "-" in n:
            partes = [p for p in n.split("-") if len(p) >= 2]
            out.extend(partes or [n.replace("-", "")])
        else:
            out.append(n)
    return out


def _norm(token: str) -> str:
    """Minúsculas y apóstrofo tipográfico normalizado al recto."""
    return token.lower().replace("’", "'")


# ── Morfología ───────────────────────────────────────────────────────────────
def variants(word: str, pos: str | None = None, *, wide: bool = False) -> set[str]:
    """
    Formas FLEXIONADAS plausibles de `word` — las que cuentan como "la misma
    palabra" al detectar uso:
        variants("use")           → use, uses, used, using
        variants("stop")          → stop, stops, stopped, stopping
        variants("fast", "adjective") → …, faster, fastest

    Solo adjetivos y adverbios admiten grado (-er/-est). Sin esa distinción,
    "use" emparejaría con "user" y "bet" con "better".
    El guarda de longitud (>=3) evita que palabras cortas generen basura:
    "as" no debe emparejar con "a".

    `wide=True` admite además grado y -ly en cualquier categoría. Solo lo usa el
    corrector ortográfico, para comprobar que un token se puede RECONSTRUIR
    desde una base real del diccionario. Ahí conviene ser generoso con las
    formas válidas, pero respetando la ortografía: la raíz sin la -e final nunca
    toma -ly, y gracias a eso "definitly" NO se puede reconstruir desde
    "definite" y se detecta como errata.
    """
    w = _norm(word).strip("-'")
    out = {w}
    if len(w) < 3:
        return out

    # Cada raíz alterna admite solo los sufijos que la ortografía inglesa
    # permite: sin ese filtro salen formas imposibles ("uss", "stopps") que solo
    # engordan el payload que se le manda al navegador.
    con_grado = wide or (pos or "").lower() in ("adjective", "adverb")
    grado = ("er", "est") if con_grado else ()
    ly = ("ly",) if wide else ()
    termina_e = w.endswith("e")
    termina_cons_y = len(w) >= 2 and w.endswith("y") and w[-2] not in "aeiou"

    if termina_cons_y:
        base = ("ing",)                                # carry → carrying
    else:
        base = ("s",) + (("d",) if termina_e else ("ed", "ing"))
        if re.search(r"(s|x|z|ch|sh|o)$", w):
            base += ("es",)                            # watch → watches
        base += ly                                     # definite → definitely
        if not termina_e:
            base += grado

    stems: list[tuple[str, tuple[str, ...]]] = [(w, base)]
    if termina_e:
        # La -e solo cae ante sufijo que empieza por vocal; ante -ly se queda.
        stems.append((w[:-1], ("es", "ed", "ing") + grado))       # use → us + ing
    if w.endswith("y"):
        stems.append((w[:-1] + "i", ("es", "ed") + grado + ly))   # happy → happily
    # Consonante final doblada tras vocal simple: stop → stopp + ed/ing
    if len(w) >= 3 and w[-1] not in "aeiou" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        stems.append((w + w[-1], ("ed", "ing") + grado))

    for stem, sufs in stems:
        for suf in sufs:
            out.add(stem + suf)
    return out


def lemmas(token: str) -> set[str]:
    """
    Bases plausibles de un token flexionado — la dirección inversa de `variants`.
    Se usa SOLO para consultar el diccionario, que guarda headwords; aquí sí
    conviene sobre-generar (el error barato es dar una palabra por conocida):
        lemmas("running") → running, runn, run, runne…
        lemmas("happily") → happily, happi, happy, happil…
    """
    t = _norm(token).strip("-'")
    out = {t}
    if t.endswith("'s"):
        out.add(t[:-2])
        t = t[:-2]
        out.add(t)
    for suf in _LEMMA_SUFFIXES:
        if not t.endswith(suf) or len(t) - len(suf) < 3:
            continue
        base = t[: -len(suf)]
        out.add(base)
        out.add(base + "e")                    # using → use
        if suf in ("ies", "ied", "ier", "iest", "ily"):
            out.add(base + "y")                # happily → happy
        if len(base) >= 2 and base[-1] == base[-2]:
            out.add(base[:-1])                 # stopped → stop
    return out


def same_word(target: str, token: str, pos: str | None = None) -> bool:
    """¿`token` es `target` salvo flexión? (`pos` habilita el grado -er/-est)."""
    na, nb = _norm(target).strip("-'"), _norm(token).strip("-'")
    if na == nb:
        return True
    return nb in variants(na, pos) or na in variants(nb, pos)


# ── Detección de uso de las palabras objetivo ────────────────────────────────
def key_tokens(phrase: str) -> list[str]:
    """
    Tokens que identifican al objetivo.

    Para frases se prefieren los tokens de contenido (sin artículos ni
    posesivos), PERO solo si quedan al menos dos: si no, se exige la frase
    completa. Sin ese resguardo, "due to" se reduciría a "due" y cualquier
    "due date" contaría como usada — inflando la cobertura, que es justo la
    métrica que decide la nota.
    """
    toks = text_tokens(phrase)
    if len(toks) <= 1:
        return toks
    content = [t for t in toks if t not in _FUNCTION_WORDS]
    return content if len(content) >= 2 else toks


def _needed(keys: list[str]) -> int:
    """Cuántos tokens clave hay que encontrar: todos si son 2, el 70% si son más."""
    if len(keys) <= 2:
        return len(keys)
    return -(-len(keys) * 7 // 10)             # ceil(70%)


def _find_sequence(keys: list[str], tokens: list[str], pos: str | None = None) -> int:
    """
    Busca los tokens clave EN ORDEN dentro del texto, tolerando huecos cortos
    (para que "jump start your creativity" case con "I jump-started my
    creativity"). Devuelve cuántos se encontraron en la mejor ventana.
    """
    max_gap = 1 if len(keys) == 2 else 2       # tokens que pueden colarse en medio
    best = 0
    for start in range(len(tokens)):
        if not same_word(keys[0], tokens[start], pos):
            continue
        found, cursor = 1, start
        for target in keys[1:]:
            hit = None
            for j in range(cursor + 1, min(cursor + 2 + max_gap, len(tokens))):
                if same_word(target, tokens[j], pos):
                    hit = j
                    break
            if hit is None:
                break
            found += 1
            cursor = hit
        best = max(best, found)
        if best == len(keys):
            break
    return best


def match_spec(word: str, pos: str | None = None) -> dict[str, Any]:
    """
    La detección, exportada como datos para que el frontend la reproduzca sin
    reimplementar la morfología: por cada token clave, sus formas ya expandidas.

    {"groups": [["use","uses","used","using"], …], "needed": 1, "max_gap": 2}
    """
    keys = key_tokens(word)
    return {
        "groups": [sorted(variants(k, pos)) for k in keys],
        "needed": _needed(keys),
        "max_gap": 1 if len(keys) == 2 else 2,
    }


def detect_used(targets: Iterable[dict[str, Any]], user_text: str) -> dict[int, dict[str, Any]]:
    """
    ¿Cuáles de las palabras objetivo aparecen en el texto?

    `targets`: iterable de dicts con {"id", "word"} y opcionalmente {"pos"}.
    Devuelve {word_id: {"word": str, "found": bool}}.
    """
    toks = text_tokens(user_text)
    result: dict[int, dict[str, Any]] = {}
    for t in targets:
        word = str(t.get("word") or "").strip()
        wid = int(t.get("id") or 0)
        pos = t.get("pos")
        if not word:
            continue
        keys = key_tokens(word)
        if not keys:
            found = False
        elif len(keys) == 1:
            found = any(same_word(keys[0], tk, pos) for tk in toks)
        else:
            found = _find_sequence(keys, toks, pos) >= _needed(keys)
        result[wid] = {"word": word, "found": found}
    return result


# ── Ortografía determinista ──────────────────────────────────────────────────
def _is_sentence_start(text: str, offset: int) -> bool:
    """True si antes del token solo hay apertura de oración (., !, ?, salto…)."""
    i = offset - 1
    while i >= 0 and text[i] in " \t\"'“”‘’()[]-—…":
        i -= 1
    return i < 0 or text[i] in ".!?\n:;"


def _lookup_keys(token: str) -> set[str]:
    """Claves a buscar en el diccionario: el token, sus lemas y sus partes."""
    keys = lemmas(token)
    if "-" in token:                                     # thought-provoking
        for part in _norm(token).split("-"):
            if len(part) >= 2:
                keys |= lemmas(part)
    if "'" in _norm(token):                              # workers' → workers
        keys.add(_norm(token).split("'")[0])
    return {k for k in keys if k}


def _known_from_dictionary(db: Session, keys: set[str]) -> set[str]:
    """
    Una sola consulta (en lotes) contra `dictionary_entries`, que ya tiene índice
    único sobre `word`. Nunca se cargan las 58k filas: solo se preguntan las
    claves del texto, y solo las que cefrpy no resolvió ya en memoria.
    """
    from database.models import DictionaryEntry  # import diferido: evita ciclo

    known: set[str] = set()
    keys_list = sorted(keys)
    CHUNK = 800
    for i in range(0, len(keys_list), CHUNK):
        rows = (
            db.query(DictionaryEntry.word)
            .filter(DictionaryEntry.word.in_(keys_list[i : i + CHUNK]))
            .all()
        )
        known.update(r[0] for r in rows)
    return known


def spell_candidates(
    db: Session,
    user_text: str,
    own_words: Iterable[str] = (),
    limit: int = 25,
) -> list[str]:
    """
    Palabras del texto que no existen en el diccionario offline ni en el
    vocabulario propio → candidatas a error de ortografía.

    La autoridad es `dictionary_entries` (58k headwords de FreeDict), no cefrpy:
    medido sobre 22 erratas frecuentes, cefrpy da por buenas 7 ("enviroment",
    "wich", "untill", "succesful"…) porque es una base de NIVELES CEFR, no un
    diccionario ortográfico. FreeDict no acepta ninguna.

    FreeDict solo guarda lemas, así que para las formas flexionadas (occurred,
    carried, stopped) se prueban las bases posibles — pero aceptando el token
    únicamente si se puede RECONSTRUIR desde esa base. Sin esa verificación,
    "definitly" pasaría por quitarle "-ly" y encontrar "definite".

    Es un filtro, no un veredicto: ningún diccionario tiene nombres propios ni
    tecnicismos, así que la lista corta que sale de aquí se le pasa a la IA para
    que descarte los falsos positivos en la MISMA llamada que ya se hace.

    Heurísticas para no ensuciar la lista:
      - se ignoran palabras en mayúscula que no abren oración (nombres propios),
      - se ignoran siglas (todo en mayúsculas),
      - se ignoran tokens de una sola letra.
    """
    text = user_text or ""
    candidates: dict[str, None] = {}                     # dict = set con orden
    for tok, pos in tokens_with_pos(text):
        if len(tok) < 2:
            continue
        if tok.isupper() and len(tok) >= 2:              # NASA, CFD, ISO
            continue
        if tok[0].isupper() and not _is_sentence_start(text, pos):
            continue                                     # nombre propio
        low = _norm(tok)
        if low in _ALWAYS_OK:
            continue
        candidates.setdefault(low, None)

    if not candidates:
        return []

    # Vocabulario propio: cuenta como conocido (son palabras que el usuario ya
    # guardó y validó; muchas son frases, así que se parten en tokens).
    own: set[str] = set()
    for w in own_words:
        for tok, _ in tokens_with_pos(w or ""):
            own |= lemmas(tok)

    key_map = {tok: _lookup_keys(tok) for tok in candidates}
    all_keys: set[str] = set()
    for ks in key_map.values():
        all_keys |= ks
    conocidas = _known_from_dictionary(db, all_keys) | own

    def es_conocida(tok: str, keys: set[str]) -> bool:
        low = _norm(tok)
        if low in conocidas:                    # el token tal cual está en el diccionario
            return True
        for base in keys:
            # Base real del diccionario Y el token es una forma suya: así
            # "carried" pasa por "carry" pero "definitly" no pasa por "definite".
            if base in conocidas and low in variants(base, wide=True):
                return True
        return False

    unknown = [tok for tok, keys in key_map.items() if not es_conocida(tok, keys)]
    return unknown[:limit]
