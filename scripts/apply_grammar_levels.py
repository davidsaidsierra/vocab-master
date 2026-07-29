"""
Aplica una clasificación de nivel CEFR + categoría a los 244 GrammarTopic,
hecha a mano (por Claude, no por Groq) basándose en el progreso curricular
CEFR estándar (Cambridge / British Council / EF) para cada punto gramatical,
usando el título de cada sección de knowledge_base_clean.md como referencia
(ya verificado contra el contenido real durante la sesión de auditoría).

Reemplaza el enfoque de scripts/classify_grammar_levels.py (que llama a Groq
en lotes) para esta pasada: no hay llamadas a IA, es instantáneo, y no está
sujeto a rate limits ni a fallos de conexión intermitentes.

Mismo patrón de seguridad que classify_grammar_levels.py: DATABASE_URL en .env
apunta a producción (Neon) incluso en dev local, así que el modo por defecto
es --dry-run (imprime diff + distribución final, guarda preview.json). Solo
con --commit escribe, y antes de escribir vuelca un backup.

Uso:
    python scripts/apply_grammar_levels.py --dry-run
    python scripts/apply_grammar_levels.py --commit
"""
import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from database.connection import SessionLocal, init_db
from database.models import GrammarTopic

OUTPUT_DIR = PROJECT_ROOT / "data" / "grammar_classification"

# section_number -> (level, category)
CLASSIFICATION: dict[int, tuple[str, str | None]] = {
    1: ("A1", "questions"), 2: ("A1", "questions"), 3: ("A1", "present tenses"),
    4: ("A1", "present tenses"), 5: ("A1", "present tenses"), 6: ("A1", "pronouns"),
    7: ("A1", "pronouns"), 8: ("A1", "articles"), 9: ("A1", "adjectives"),
    10: ("A1", "present tenses"), 11: ("A1", "questions"), 12: ("A1", "adverbs"),
    13: ("A1", "pronouns"), 14: ("A1", "possessives"), 15: ("A1", "prepositions"),
    16: ("A1", "modals"), 17: ("A1", "continuous tenses"), 18: ("A1", "imperative"),
    19: ("A1", "past tenses"), 20: ("A1", "past tenses"), 21: ("A2", "present tenses"),
    22: ("A1", "past tenses"), 23: ("A1", "past tenses"), 24: ("A1", "continuous tenses"),
    25: ("A1", "questions"), 26: ("A1", "present tenses"), 27: ("A1", "quantifiers"),
    28: ("A1", "quantifiers"), 29: ("A1", "quantifiers"), 30: ("A1", "prepositions"),
    31: ("A2", "comparison"), 32: ("A2", "future tenses"), 33: ("A2", "future tenses"),
    34: ("A2", "adjectives"), 35: ("A2", "articles"), 36: ("A1", "connectors"),
    37: ("A2", "quantifiers"), 38: ("A2", "future tenses"), 39: ("B1", "perfect tenses"),
    40: ("B1", "perfect tenses"), 41: ("B1", "relative clauses"), 42: ("A2", "pronouns"),
    43: ("A2", "comparison"), 44: ("A2", "comparison"), 45: ("A2", "quantifiers"),
    46: ("A2", "quantifiers"), 47: ("A2", "modals"), 48: ("A2", "modals"),
    49: ("B1", "conditionals"), 50: ("B1", "future tenses"), 51: ("A1", "pronouns"),
    52: ("A1", "prepositions"), 53: ("A2", "future tenses"), 54: ("B2", "perfect tenses"),
    55: ("B2", "perfect tenses"), 56: ("B1", "prepositions"), 57: ("B1", "past tenses"),
    58: ("B1", "past tenses"), 59: ("B1", "past tenses"), 60: ("B2", "passive"),
    61: ("B2", "modals"), 62: ("C1", "conditionals"), 63: ("A2", "quantifiers"),
    64: ("A2", "quantifiers"), 65: ("A2", "quantifiers"), 66: ("B1", "quantifiers"),
    67: ("B1", "quantifiers"), 68: ("B1", "adverbs"), 69: ("B1", "continuous tenses"),
    70: ("B1", "perfect tenses"), 71: ("A2", "conditionals"), 72: ("B1", "conditionals"),
    73: ("B1", "future tenses"), 74: ("C1", "conditionals"), 75: ("B2", "conditionals"),
    76: ("B2", "modals"), 77: ("B1", "modals"), 78: ("B1", None),
    79: ("B2", "passive"), 80: ("C1", "passive"), 81: ("B2", "passive"),
    82: ("B2", "reported speech"), 83: ("B2", "reported speech"), 84: ("B2", "connectors"),
    85: ("A2", "quantifiers"), 86: ("A2", "quantifiers"), 87: ("A2", "quantifiers"),
    88: ("A2", "quantifiers"), 89: ("A2", "continuous tenses"), 90: ("B1", "perfect tenses"),
    91: ("B2", "past tenses"), 92: ("B2", "past tenses"), 93: ("B1", "future tenses"),
    94: ("A2", None), 95: ("B2", "passive"), 96: ("A2", "modals"),
    97: ("B1", "passive"), 98: ("A2", "collocations"), 99: ("A1", "past tenses"),
    100: ("A2", "present tenses"), 101: ("A1", "present tenses"), 102: ("B2", "conditionals"),
    103: ("B2", "conditionals"), 104: ("B2", "conditionals"), 105: ("A1", None),
    106: ("A1", "possessives"), 107: ("B1", "present tenses"), 108: ("B1", "collocations"),
    109: ("B1", "reported speech"), 110: ("B1", "phrasal verbs"), 111: ("B1", "phrasal verbs"),
    112: ("B1", "phrasal verbs"), 113: ("B1", "adjectives"), 114: ("B1", None),
    115: ("B1", None), 116: ("B1", "prepositions"), 117: ("B1", "perfect tenses"),
    118: ("A1", "prepositions"), 119: ("B2", "connectors"), 120: ("B1", "phrasal verbs"),
    121: ("B1", "phrasal verbs"), 122: ("B1", "phrasal verbs"), 123: ("B1", "phrasal verbs"),
    124: ("B1", "phrasal verbs"), 125: ("B1", "phrasal verbs"), 126: ("B1", "collocations"),
    127: ("B1", "present tenses"), 128: ("B2", "modals"), 129: ("B1", "phrasal verbs"),
    130: ("B1", "adverbs"), 131: ("B2", "prepositions"), 132: ("C1", "connectors"),
    133: ("B1", "gerunds & infinitives"), 134: ("B2", "gerunds & infinitives"),
    135: ("B2", "gerunds & infinitives"), 136: ("B2", "future tenses"), 137: ("B1", "adjectives"),
    138: ("B2", "modals"), 139: ("B1", "collocations"), 140: ("A2", "modals"),
    141: ("B1", "pronouns"), 142: ("A2", "questions"), 143: ("A2", "connectors"),
    144: ("B1", "connectors"), 145: ("B1", "connectors"), 146: ("A2", "future tenses"),
    147: ("A2", "modals"), 148: ("B1", "past tenses"), 149: ("B1", "present tenses"),
    150: ("B1", "past tenses"), 151: ("B1", "perfect tenses"), 152: ("A1", "pronouns"),
    153: ("B1", "articles"), 154: ("B1", "pronouns"), 155: ("A2", "modals"),
    156: ("B1", "pronouns"), 157: ("B1", "adjectives"), 158: ("B1", "passive"),
    159: ("B1", "reported speech"), 160: ("B1", "reported speech"), 161: ("B1", "reported speech"),
    162: ("B1", "quantifiers"), 163: ("B1", "questions"), 164: ("B2", "adjectives"),
    165: ("B2", "prepositions"), 166: ("B1", "modals"), 167: ("B2", "subjunctive"),
    168: ("B1", "questions"), 169: ("B1", None), 170: ("B2", "comparison"),
    171: ("B2", "adjectives"), 172: ("B1", "adjectives"), 173: ("B2", "past tenses"),
    174: ("A2", "modals"), 175: ("B2", "comparison"), 176: ("B1", "past tenses"),
    177: ("B2", "adverbs"), 178: ("B1", "present tenses"), 179: ("B2", "connectors"),
    180: ("B2", "connectors"), 181: ("B1", "connectors"), 182: ("B1", "connectors"),
    183: ("B1", "reported speech"), 184: ("B2", "pronouns"), 185: ("B2", "pronouns"),
    186: ("B2", "pronouns"), 187: ("B2", "collocations"), 188: ("B2", "connectors"),
    189: ("B2", "modals"), 190: ("C1", "passive"), 191: ("B2", "gerunds & infinitives"),
    192: ("B1", "modals"), 193: ("B2", "gerunds & infinitives"), 194: ("B2", "gerunds & infinitives"),
    195: ("B2", "conditionals"), 196: ("B1", "future tenses"), 197: ("B2", "perfect tenses"),
    198: ("B2", "modals"), 199: ("B2", "future tenses"), 200: ("C1", "connectors"),
    201: ("C1", "connectors"), 202: ("C1", "connectors"), 203: ("B2", "relative clauses"),
    204: ("B1", "relative clauses"), 205: ("B1", "relative clauses"), 206: ("C1", "gerunds & infinitives"),
    207: ("B1", "possessives"), 208: ("B2", "prepositions"), 209: ("A2", "adverbs"),
    210: ("B1", "connectors"), 211: ("B1", "connectors"), 212: ("A2", "collocations"),
    213: ("B2", "gerunds & infinitives"), 214: ("B2", "connectors"), 215: ("A2", "collocations"),
    216: ("A1", "possessives"), 217: ("B2", "connectors"), 218: ("B1", "prepositions"),
    219: ("A2", "quantifiers"), 220: ("B1", "quantifiers"), 221: ("B2", "collocations"),
    222: ("B2", "collocations"), 223: ("B1", "prepositions"), 224: ("B2", "connectors"),
    225: ("B1", "pronouns"), 226: ("B1", "quantifiers"), 227: ("B2", "connectors"),
    228: ("A2", "collocations"), 229: ("B1", None), 230: ("C1", "gerunds & infinitives"),
    231: ("B2", "conditionals"), 232: ("B1", "prepositions"), 233: ("C1", "modals"),
    234: ("C1", "modals"), 235: ("B1", "present tenses"), 236: ("B1", "perfect tenses"),
    237: ("B1", "articles"), 238: ("C1", "subjunctive"), 239: ("C1", "conditionals"),
    240: ("C1", "modals"), 241: ("B2", "adjectives"), 242: ("C1", "conditionals"),
    243: ("B2", "perfect tenses"), 244: ("B2", "present tenses"),
}


def validate_classification() -> None:
    expected = set(range(1, 245))
    got = set(CLASSIFICATION.keys())
    missing = expected - got
    extra = got - expected
    if missing:
        raise AssertionError(f"Faltan section_number en CLASSIFICATION: {sorted(missing)}")
    if extra:
        raise AssertionError(f"section_number inesperados en CLASSIFICATION: {sorted(extra)}")
    valid_levels = {"A1", "A2", "B1", "B2", "C1", "C2"}
    for n, (level, _cat) in CLASSIFICATION.items():
        if level not in valid_levels:
            raise AssertionError(f"Nivel inválido para sección {n}: {level!r}")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    validate_classification()

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="No-op explícito (ya es el default sin --commit).")
    ap.add_argument("--commit", action="store_true", help="Escribe los cambios en la DB.")
    args = ap.parse_args()

    init_db()
    db = SessionLocal()
    try:
        rows = db.query(GrammarTopic).order_by(GrammarTopic.section_number).all()
        if len(rows) != 244:
            print(f"AVISO: se esperaban 244 filas, se encontraron {len(rows)}. Continuando de todas formas.")

        changes = []
        print()
        print("=" * 95)
        print(f"{'#':<5} {'título':<45} {'nivel':<12} categoría")
        print("=" * 95)
        for r in rows:
            target = CLASSIFICATION.get(r.section_number)
            if target is None:
                continue
            new_level, new_category = target
            level_changed = new_level != r.level
            cat_changed = bool(new_category) and new_category != r.category
            if level_changed or cat_changed:
                changes.append({
                    "slug": r.slug, "section_number": r.section_number,
                    "old_level": r.level, "new_level": new_level,
                    "old_category": r.category, "new_category": new_category,
                })
                lvl_col = f"{r.level or '-'}->{new_level}" if level_changed else new_level
                cat_col = f"{r.category or '-'}->{new_category}" if cat_changed else (new_category or "-")
                print(f"{r.section_number:<5} {r.title[:45]:<45} {lvl_col:<12} {cat_col}")
        print("=" * 95)
        print(f"\n{len(changes)} cambio(s) propuesto(s) de {len(rows)} temas.\n")

        # Distribución proyectada.
        final_level = {r.slug: r.level for r in rows}
        for c in changes:
            final_level[c["slug"]] = c["new_level"]
        counts = Counter(final_level.values())
        print("Distribución de nivel PROYECTADA tras aplicar los cambios:")
        for lvl in ("A1", "A2", "B1", "B2", "C1", "C2", None):
            n = counts.get(lvl, 0)
            label = lvl or "(sin nivel)"
            print(f"  {label:<12} {n:>4}")
        print()

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        preview_path = OUTPUT_DIR / "preview_manual.json"
        preview_path.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Preview guardado en: {preview_path}")

        if not args.commit:
            print("\nModo dry-run: no se escribió nada en la base. Vuelve a correr con --commit para aplicar.")
            return 0

        if not changes:
            print("No hay cambios que aplicar.")
            return 0

        backup_rows = [{"slug": r.slug, "level": r.level, "category": r.category} for r in rows]
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = OUTPUT_DIR / f"backup_manual_{ts}.json"
        backup_path.write_text(json.dumps(backup_rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Backup de {len(backup_rows)} filas guardado en: {backup_path}")

        by_slug = {r.slug: r for r in rows}
        applied = 0
        for c in changes:
            row = by_slug.get(c["slug"])
            if row is None:
                continue
            row.level = c["new_level"]
            if c["new_category"]:
                row.category = c["new_category"]
            applied += 1
        db.commit()
        print(f"\nListo: {applied} fila(s) actualizada(s) en la base.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
