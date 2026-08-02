"""
Familias de palabras — la MATRIZ de una raíz léxica.

Dos ejes:
  - eje 1 (slot): la función gramatical → verb, noun_thing, noun_person,
    adjective, adverb, gerund, participle.
  - eje 2 (meanings): dentro de cada slot, TODAS las acepciones. `stay` como
    verbo es "quedarse", "alojarse" y "aplazar"; como sustantivo es "estancia"
    y "suspensión judicial".

Una celda puede estar vacía (`stay` no tiene adjetivo ni adverbio propios) y eso
es información válida: no se inventa nada para rellenar.

La matriz NO se guarda en una tabla aparte: vive en la palabra "cabeza"
(`Word.family`, `Word.family_root`, `Word.family_head`). Así la familia hereda
tal cual el SM-2 que ya lleva `Word` — la familia ES la unidad de repaso, y
`helper`/`helpful` cuentan como UNA sola palabra.

Todo este módulo es determinista y offline: sin IA, sin red. Las derivaciones
(help → helper/helpful) son léxicas y vienen del JSON curado; lo único que se
calcula aquí son las FLEXIONES (stay → stays/staying/stayed), que sí son regla.
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterable

# ── Slots de la matriz (orden de presentación) ──────────────────────────────
SLOTS: tuple[str, ...] = (
    "verb",
    "noun_thing",
    "noun_person",
    "adjective",
    "adverb",
    "gerund",
    "participle",
)

# Etiquetas en español (el frontend las reusa vía /api/words/family-slots).
SLOT_LABELS_ES: dict[str, str] = {
    "verb": "Verbo",
    "noun_thing": "Sustantivo (cosa)",
    "noun_person": "Sustantivo (persona)",
    "adjective": "Adjetivo",
    "adverb": "Adverbio",
    "gerund": "Gerundio (-ing)",
    "participle": "Participio (-ed)",
}

# Mapeo desde el `part_of_speech` de la lista cerrada del lookup al slot de la
# matriz. Sirve para colocar una palabra suelta en su celda al vincularla.
POS_TO_SLOT: dict[str, str] = {
    "verb": "verb",
    "noun": "noun_thing",
    "adjective": "adjective",
    "adverb": "adverb",
}


# ── Flexiones (esto SÍ es regla, se calcula) ────────────────────────────────
_VOWELS = "aeiou"

# Irregulares frecuentes: (past, participle). Solo los que de verdad aparecen;
# no pretende ser exhaustivo, y el JSON curado siempre puede sobrescribirlos.
IRREGULAR_VERBS: dict[str, tuple[str, str]] = {
    "be": ("was", "been"), "bear": ("bore", "borne"), "beat": ("beat", "beaten"),
    "become": ("became", "become"), "begin": ("began", "begun"), "bend": ("bent", "bent"),
    "bite": ("bit", "bitten"), "bleed": ("bled", "bled"), "blow": ("blew", "blown"),
    "break": ("broke", "broken"), "bring": ("brought", "brought"), "build": ("built", "built"),
    "buy": ("bought", "bought"), "catch": ("caught", "caught"), "choose": ("chose", "chosen"),
    "come": ("came", "come"), "cost": ("cost", "cost"), "cut": ("cut", "cut"),
    "do": ("did", "done"), "draw": ("drew", "drawn"), "drive": ("drove", "driven"),
    "eat": ("ate", "eaten"), "fall": ("fell", "fallen"), "feel": ("felt", "felt"),
    "find": ("found", "found"), "forget": ("forgot", "forgotten"), "get": ("got", "gotten"),
    "give": ("gave", "given"), "go": ("went", "gone"), "grow": ("grew", "grown"),
    "have": ("had", "had"), "hear": ("heard", "heard"), "hold": ("held", "held"),
    "keep": ("kept", "kept"), "know": ("knew", "known"), "lead": ("led", "led"),
    "leave": ("left", "left"), "lose": ("lost", "lost"), "make": ("made", "made"),
    "mean": ("meant", "meant"), "meet": ("met", "met"), "pay": ("paid", "paid"),
    "put": ("put", "put"), "read": ("read", "read"), "run": ("ran", "run"),
    "say": ("said", "said"), "see": ("saw", "seen"), "sell": ("sold", "sold"),
    "send": ("sent", "sent"), "set": ("set", "set"), "show": ("showed", "shown"),
    "sit": ("sat", "sat"), "sleep": ("slept", "slept"), "speak": ("spoke", "spoken"),
    "spend": ("spent", "spent"), "stand": ("stood", "stood"), "take": ("took", "taken"),
    "teach": ("taught", "taught"), "tell": ("told", "told"), "think": ("thought", "thought"),
    "understand": ("understood", "understood"), "undertake": ("undertook", "undertaken"),
    "wear": ("wore", "worn"), "win": ("won", "won"), "write": ("wrote", "written"),
    # Segunda tanda: irregulares que aparecen al generar familias con IA. Sin
    # ellos la regla produce engendros como "beated" o "sinked".
    "deal": ("dealt", "dealt"), "dig": ("dug", "dug"), "drink": ("drank", "drunk"),
    "fall": ("fell", "fallen"), "feed": ("fed", "fed"), "fight": ("fought", "fought"),
    "fly": ("flew", "flown"), "forbid": ("forbade", "forbidden"),
    "forgive": ("forgave", "forgiven"), "freeze": ("froze", "frozen"),
    "hang": ("hung", "hung"), "hide": ("hid", "hidden"), "hit": ("hit", "hit"),
    "hurt": ("hurt", "hurt"), "lay": ("laid", "laid"), "lend": ("lent", "lent"),
    "let": ("let", "let"), "light": ("lit", "lit"), "quit": ("quit", "quit"),
    "rid": ("rid", "rid"), "ride": ("rode", "ridden"), "ring": ("rang", "rung"),
    "rise": ("rose", "risen"), "seek": ("sought", "sought"), "shake": ("shook", "shaken"),
    "shine": ("shone", "shone"), "shoot": ("shot", "shot"), "shut": ("shut", "shut"),
    "sing": ("sang", "sung"), "sink": ("sank", "sunk"), "slide": ("slid", "slid"),
    "split": ("split", "split"), "spread": ("spread", "spread"),
    "steal": ("stole", "stolen"), "stick": ("stuck", "stuck"),
    "strike": ("struck", "struck"), "swear": ("swore", "sworn"),
    "sweep": ("swept", "swept"), "swim": ("swam", "swum"), "swing": ("swung", "swung"),
    "throw": ("threw", "thrown"), "wake": ("woke", "woken"), "weave": ("wove", "woven"),
    "wind": ("wound", "wound"), "withdraw": ("withdrew", "withdrawn"),
}

# Verbos de una sílaba que NO doblan la consonante final aunque la regla CVC lo
# sugiera (la 'w', 'x', 'y' finales nunca doblan).
_NO_DOUBLE_END = "wxy"


# Verbos de más de una sílaba que SÍ doblan porque su última sílaba es tónica.
# No hay forma de detectar el acento con reglas, así que van en lista.
_STRESSED_END = {
    "admit", "begin", "commit", "compel", "control", "equip", "expel", "forget",
    "occur", "omit", "patrol", "permit", "prefer", "propel", "rebel", "refer",
    "regret", "submit", "transfer", "upset",
}


def _syllables(base: str) -> int:
    """Aproximación: cuántos grupos de vocales tiene la palabra."""
    return len(re.findall(r"[aeiouy]+", base))


def _is_cvc(base: str) -> bool:
    """
    Consonante-vocal-consonante final: stop → stopping, plan → planning.
    Solo dobla si la última sílaba es tónica; por eso las palabras de más de
    una sílaba quedan fuera salvo las de la lista (water → watering, NO
    waterring; pero prefer → preferring).
    """
    if len(base) < 3:
        return False
    a, b, c = base[-3], base[-2], base[-1]
    if not ((a not in _VOWELS) and (b in _VOWELS) and (c not in _VOWELS) and c not in _NO_DOUBLE_END):
        return False
    return _syllables(base) <= 1 or base in _STRESSED_END


def third_person(base: str) -> str:
    """stay→stays, watch→watches, study→studies."""
    if re.search(r"(s|x|z|ch|sh|o)$", base):
        return base + "es"
    if re.search(r"[^aeiou]y$", base):
        return base[:-1] + "ies"
    return base + "s"


def ing_form(base: str) -> str:
    """stay→staying, make→making, stop→stopping, lie→lying."""
    if base.endswith("ie"):
        return base[:-2] + "ying"
    if base.endswith("e") and not base.endswith("ee") and len(base) > 2:
        return base[:-1] + "ing"
    if _is_cvc(base):
        return base + base[-1] + "ing"
    return base + "ing"


def past_forms(base: str) -> tuple[str, str]:
    """Devuelve (pasado, participio). Consulta irregulares primero."""
    if base in IRREGULAR_VERBS:
        return IRREGULAR_VERBS[base]
    if base.endswith("e"):
        reg = base + "d"
    elif re.search(r"[^aeiou]y$", base):
        reg = base[:-1] + "ied"
    elif _is_cvc(base):
        reg = base + base[-1] + "ed"
    else:
        reg = base + "ed"
    return reg, reg


def verb_inflections(base: str) -> dict[str, str]:
    past, participle = past_forms(base)
    return {
        "third": third_person(base),
        "ing": ing_form(base),
        "past": past,
        "participle": participle,
    }


# Plurales irregulares frecuentes, varios de vocabulario técnico (analysis,
# matrix, index) que la regla general destrozaría.
IRREGULAR_PLURALS: dict[str, str] = {
    "analysis": "analyses", "axis": "axes", "basis": "bases", "child": "children",
    "criterion": "criteria", "datum": "data", "foot": "feet", "hypothesis": "hypotheses",
    "index": "indices", "man": "men", "matrix": "matrices", "medium": "media",
    "person": "people", "phenomenon": "phenomena", "radius": "radii",
    "thesis": "theses", "tooth": "teeth", "vertex": "vertices", "woman": "women",
}


def noun_plural(base: str) -> str:
    """stay→stays, box→boxes, city→cities, life→lives, analysis→analyses."""
    if base in IRREGULAR_PLURALS:
        return IRREGULAR_PLURALS[base]
    if re.search(r"(s|x|z|ch|sh)$", base):
        return base + "es"
    if re.search(r"[^aeiou]y$", base):
        return base[:-1] + "ies"
    if base.endswith("fe"):
        return base[:-2] + "ves"
    if base.endswith("f"):
        return base[:-1] + "ves"
    return base + "s"


def inflections_for(slot: str, form: str) -> dict[str, str]:
    """Flexiones que corresponden a cada slot. Celdas sin flexión → {}."""
    form = (form or "").strip().lower()
    if not form or " " in form:  # compuestos tipo "stay-at-home": sin flexión
        return {}
    if slot == "verb":
        return verb_inflections(form)
    if slot in ("noun_thing", "noun_person"):
        return {"plural": noun_plural(form)}
    return {}


# ── Normalización de la matriz ──────────────────────────────────────────────
def _clean_meaning(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Una acepción dentro de una celda. `translation_es` es lo único obligatorio."""
    tr = (raw.get("translation_es") or "").strip()
    if not tr:
        return None
    return {
        "translation_es": tr,
        "definition_en": (raw.get("definition_en") or "").strip() or None,
        "example_en": (raw.get("example_en") or "").strip() or None,
        "example_es": (raw.get("example_es") or "").strip() or None,
        "register": (raw.get("register") or "").strip() or None,  # formal/legal/informal…
    }


def _clean_cell(slot: str, raw: Any) -> dict[str, Any] | None:
    """Una celda de la matriz. Devuelve None si el slot no existe para esta raíz."""
    if not raw:
        return None
    form = (raw.get("form") or "").strip()
    if not form:
        return None
    meanings = [m for m in (_clean_meaning(x) for x in (raw.get("meanings") or [])) if m]
    if not meanings:
        return None
    # Las flexiones se calculan salvo que el JSON curado las traiga explícitas
    # (verbos irregulares raros, plurales latinos, etc.). Un `{}` explícito
    # significa "esta celda NO tiene flexiones" (knowledge, happiness) y se
    # respeta: no se recalcula.
    infl = raw.get("inflections")
    if not isinstance(infl, dict):
        infl = inflections_for(slot, form)
        # Sustantivo incontable → no hay plural que mostrar.
        if slot.startswith("noun") and all(
            "incontable" in (m.get("register") or "").lower()
            or "uncountable" in (m.get("register") or "").lower()
            for m in meanings
        ):
            infl.pop("plural", None)
    # `variants`: otras palabras que ocupan la MISMA celda — sobre todo los
    # negativos (helpful/helpless, reliable/unreliable) y los compuestos
    # (in-depth, groundbreaking). Son palabras distintas del diccionario, pero
    # de la misma familia y la misma función gramatical, así que colapsan aquí.
    variants = [
        v.strip().lower()
        for v in (raw.get("variants") or [])
        if isinstance(v, str) and v.strip() and v.strip().lower() != form.lower()
    ]
    return {"form": form, "inflections": infl, "meanings": meanings, "variants": variants}


def _clean_phrases(raw: Any) -> list[dict[str, Any]]:
    """Phrasal verbs y expresiones: filas aparte, NO son celdas de la matriz."""
    out = []
    for item in raw or []:
        phrase = (item.get("phrase") or "").strip()
        meaning = (item.get("meaning_es") or "").strip()
        if not phrase or not meaning:
            continue
        out.append({
            "phrase": phrase,
            "meaning_es": meaning,
            "example_en": (item.get("example_en") or "").strip() or None,
            "example_es": (item.get("example_es") or "").strip() or None,
        })
    return out


def normalize(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Valida y completa una matriz cruda (la del JSON curado o la que llegue por
    la API). Rellena flexiones, descarta celdas vacías, ordena los slots.
    Lanza ValueError si no hay raíz o si la matriz queda totalmente vacía.
    """
    root = (raw.get("root") or "").strip().lower()
    if not root:
        raise ValueError("La familia necesita una raíz (`root`).")

    slots_raw = raw.get("slots") or {}
    unknown = set(slots_raw) - set(SLOTS)
    if unknown:
        raise ValueError(f"Slots desconocidos: {', '.join(sorted(unknown))}")

    slots = {slot: _clean_cell(slot, slots_raw.get(slot)) for slot in SLOTS}
    phrasals = _clean_phrases(raw.get("phrasals"))
    expressions = _clean_phrases(raw.get("expressions"))

    if not any(slots.values()) and not phrasals and not expressions:
        raise ValueError(f"La familia '{root}' quedó vacía.")

    return {
        "root": root,
        "slots": slots,
        "phrasals": phrasals,
        "expressions": expressions,
        # Nota de contraste (p. ej. interesting=causa vs interested=siente).
        # Es justo el punto ciego de gramática formal, así que va explícito.
        "contrast_es": (raw.get("contrast_es") or "").strip() or None,
        "notes_es": (raw.get("notes_es") or "").strip() or None,
    }


# ── Consultas sobre una matriz ya normalizada ───────────────────────────────
def absorbable_forms(matrix: dict[str, Any]) -> set[str]:
    """
    Formas que SÍ colapsan dentro de la familia: las de las celdas y sus
    flexiones. Los phrasal verbs y expresiones quedan fuera a propósito —
    'give up' tiene significado propio y merece su propio repaso, aunque se
    muestre dentro de la familia de 'give'.
    """
    forms: set[str] = {matrix["root"]}
    for cell in (matrix.get("slots") or {}).values():
        if not cell:
            continue
        forms.add(cell["form"].lower())
        forms.update(v.lower() for v in (cell.get("inflections") or {}).values() if v)
        forms.update(cell.get("variants") or [])
    return {f for f in forms if f}


def all_forms(matrix: dict[str, Any]) -> set[str]:
    """
    TODAS las cadenas que pertenecen a esta familia: formas base, flexiones,
    phrasals y expresiones. Es lo que permite decidir, sin IA, que la palabra
    suelta "helpful" ya vive dentro de la familia "help".
    """
    forms: set[str] = {matrix["root"]}
    for cell in (matrix.get("slots") or {}).values():
        if not cell:
            continue
        forms.add(cell["form"].lower())
        forms.update(v.lower() for v in (cell.get("inflections") or {}).values() if v)
        forms.update(cell.get("variants") or [])
    for item in (matrix.get("phrasals") or []) + (matrix.get("expressions") or []):
        forms.add(item["phrase"].lower())
    return {f for f in forms if f}


def slot_of_form(matrix: dict[str, Any], form: str) -> str | None:
    """
    En qué celda cae una forma concreta (para etiquetar una palabra suelta).
    Primero se buscan las formas BASE y solo después las flexiones: 'known' es a
    la vez el participio de know y el adjetivo, y lo que interesa es el adjetivo.
    """
    form = (form or "").strip().lower()
    slots = matrix.get("slots") or {}
    for slot, cell in slots.items():
        if cell and (cell["form"].lower() == form or form in (cell.get("variants") or [])):
            return slot
    for slot, cell in slots.items():
        if cell and form in {v.lower() for v in (cell.get("inflections") or {}).values() if v}:
            return slot
    for item in matrix.get("phrasals") or []:
        if item["phrase"].lower() == form:
            return "phrasal"
    for item in matrix.get("expressions") or []:
        if item["phrase"].lower() == form:
            return "expression"
    return None


def summary_translation(matrix: dict[str, Any]) -> str:
    """
    Traducción resumen de la familia, para el campo `translation` de la palabra
    cabeza (el calificador del repaso separa por comas, así que unir así hace
    que cualquier acepción de cualquier slot cuente como respuesta válida).
    """
    parts: list[str] = []
    for slot in SLOTS:
        cell = (matrix.get("slots") or {}).get(slot)
        if not cell:
            continue
        for m in cell["meanings"]:
            for chunk in m["translation_es"].split(","):
                chunk = chunk.strip()
                if chunk and chunk not in parts:
                    parts.append(chunk)
    return ", ".join(parts)


def cell_translation(matrix: dict[str, Any], slot: str | None) -> str:
    """
    Traducciones de UNA celda, unidas por coma. Es lo que debe llevar el campo
    `translation` de la palabra: si se guarda el resumen de toda la familia, el
    repaso acepta como buena la traducción de cualquier otra casilla ("estancia"
    al preguntar por el verbo `stay`) y el ejercicio deja de discriminar.
    """
    cell = (matrix.get("slots") or {}).get(slot or "")
    if not cell:
        return ""
    parts: list[str] = []
    for m in cell["meanings"]:
        for chunk in m["translation_es"].split(","):
            chunk = chunk.strip()
            if chunk and chunk not in parts:
                parts.append(chunk)
    return ", ".join(parts)


def cell_example(matrix: dict[str, Any], slot: str | None) -> dict[str, str] | None:
    """Primer ejemplo (en/es) de la celda, para usarlo en la tarjeta de repaso."""
    cell = (matrix.get("slots") or {}).get(slot or "")
    for m in (cell or {}).get("meanings") or []:
        if m.get("example_en"):
            return {"en": m["example_en"], "es": m.get("example_es") or ""}
    return None


def filled_slots(matrix: dict[str, Any]) -> list[str]:
    return [s for s in SLOTS if (matrix.get("slots") or {}).get(s)]


def meaning_count(matrix: dict[str, Any]) -> int:
    return sum(
        len(cell["meanings"])
        for cell in (matrix.get("slots") or {}).values() if cell
    )


# ── Serialización ───────────────────────────────────────────────────────────
def dumps(matrix: dict[str, Any]) -> str:
    return json.dumps(matrix, ensure_ascii=False)


def loads(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def iter_forms(matrices: Iterable[dict[str, Any]]) -> dict[str, str]:
    """{forma → raíz} para todas las matrices dadas. Útil en los backfills."""
    index: dict[str, str] = {}
    for m in matrices:
        for f in all_forms(m):
            index.setdefault(f, m["root"])
    return index
