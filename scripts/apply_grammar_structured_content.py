"""
Aplica contenido gramatical curado (structure/examples/usage_es) a los 244
GrammarTopic, generado offline por un workflow de agentes grounded en el
content_md real de cada sección (ver data/grammar_structured_content/generated.json).

Reemplaza, para la UI, el párrafo crudo de content_md (OCR de infografías) por:
- structure: fórmula gramatical limpia en inglés
- examples: exactamente 3 oraciones de ejemplo en inglés
- usage_es: 1 frase en español sobre para qué se usa

content_md NO se toca — sigue siendo la fuente de verdad para `reference_quote`
en el prompt V2 del Writing Challenge.

Mismo patrón de seguridad que apply_grammar_levels.py: DATABASE_URL en .env
apunta a producción (Neon) incluso en dev local. Por defecto --dry-run
(imprime muestra + guarda preview). Solo con --commit escribe, con backup
previo.

Uso:
    python scripts/apply_grammar_structured_content.py --dry-run
    python scripts/apply_grammar_structured_content.py --commit
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from database.connection import SessionLocal, init_db
from database.models import GrammarTopic

GENERATED_PATH = PROJECT_ROOT / "data" / "grammar_structured_content" / "generated.json"
OUTPUT_DIR = PROJECT_ROOT / "data" / "grammar_structured_content"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="No-op explícito (ya es el default sin --commit).")
    ap.add_argument("--commit", action="store_true", help="Escribe los cambios en la DB.")
    ap.add_argument("--sample", type=int, default=5, help="Cuántos ejemplos completos imprimir en el dry-run.")
    args = ap.parse_args()

    if not GENERATED_PATH.is_file():
        print(f"ERROR: no existe {GENERATED_PATH}. Corre primero el workflow de generación.", file=sys.stderr)
        return 1
    generated = json.loads(GENERATED_PATH.read_text(encoding="utf-8"))
    print(f"Cargados {len(generated)} temas generados desde {GENERATED_PATH}")

    init_db()
    db = SessionLocal()
    try:
        rows = db.query(GrammarTopic).order_by(GrammarTopic.section_number).all()
        by_slug = {r.slug: r for r in rows}

        missing_in_db = [g["slug"] for g in generated if g["slug"] not in by_slug]
        missing_in_gen = [r.slug for r in rows if r.slug not in {g["slug"] for g in generated}]
        if missing_in_db:
            print(f"AVISO: {len(missing_in_db)} slugs generados no existen en la DB: {missing_in_db[:5]}...")
        if missing_in_gen:
            print(f"AVISO: {len(missing_in_gen)} temas de la DB no tienen contenido generado: {missing_in_gen[:5]}...")

        print(f"\nMuestra de {min(args.sample, len(generated))} temas:\n")
        for g in generated[:args.sample]:
            row = by_slug.get(g["slug"])
            title = row.title if row else "(no encontrado en DB)"
            print("=" * 90)
            print(f"#{g['slug']}  —  {title}")
            print(f"  Gramática: {g['structure']}")
            for i, ex in enumerate(g["examples"], 1):
                print(f"  Ejemplo {i}: {ex}")
            print(f"  Uso: {g['usage_es']}")
        print("=" * 90)

        if not args.commit:
            print(f"\n{len(generated)} temas listos para aplicar. Modo dry-run: no se escribió nada en la base.")
            print("Vuelve a correr con --commit para aplicar.")
            return 0

        # Backup antes de escribir (reversible).
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        backup_rows = [
            {"slug": r.slug, "structure": r.structure, "examples": r.examples, "usage_es": r.usage_es}
            for r in rows
        ]
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = OUTPUT_DIR / f"backup_{ts}.json"
        backup_path.write_text(json.dumps(backup_rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Backup de {len(backup_rows)} filas guardado en: {backup_path}")

        applied = 0
        for g in generated:
            row = by_slug.get(g["slug"])
            if row is None:
                continue
            row.structure = g["structure"]
            row.examples = json.dumps(g["examples"], ensure_ascii=False)
            row.usage_es = g["usage_es"]
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
