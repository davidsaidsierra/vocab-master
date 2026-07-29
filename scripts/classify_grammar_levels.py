"""
Clasifica el nivel CEFR (y mejora la categoría) de los 244 GrammarTopic usando
el content_md real de cada sección — a diferencia de infer_level() en
import_grammar_kb.py, que solo mira el título y por eso deja ~95% de las filas
en NULL (ver auditoría: NULL=232, B1=9, C1=2, A1=1, cero en A2/B2/C2).

Job offline de una sola vez (no forma parte del pipeline de la app). Agrupa
6 temas por llamada a Groq (244/6 ≈ 41 llamadas) para no chocar con el límite
de TOKENS POR MINUTO del free tier (visto en prueba real: 8000 TPM — lotes más
grandes lo agotan en pocas llamadas). Pausa entre lotes + reintento con backoff
en 429.

IMPORTANTE (lección de una corrida fallida): el loop de clasificación completo
tarda varios minutos (41 lotes con pausas). Por eso este script NO mantiene una
sesión de DB abierta mientras habla con Groq — Neon cierra conexiones SSL
inactivas y la corrida anterior perdió el preview por esto. En cambio: abre la
DB, copia todo lo necesario a dicts planos, la cierra, clasifica con Groq (sin
DB), y solo reabre una sesión nueva al final para --commit.

SEGURIDAD: DATABASE_URL en .env apunta directo a producción (Neon) incluso en
dev local. Por eso el modo por defecto es --dry-run: llama a Groq, imprime un
diff y lo guarda en data/grammar_classification/preview.json (data/ ya está
en .gitignore) INMEDIATAMENTE después de calcularlo. Solo con --commit se
escribe en la base, y antes de escribir se vuelca un backup de las filas
actuales a data/grammar_classification/backup_<timestamp>.json.

Uso:
    # 1) Vista previa (no toca la DB), reclasifica solo las filas con level=NULL:
    python scripts/classify_grammar_levels.py --dry-run

    # 2) Reclasificar TODAS las filas (incluidas las 12 ya etiquetadas por título):
    python scripts/classify_grammar_levels.py --dry-run --reclassify-all

    # 3) Aplicar de verdad tras revisar el preview:
    python scripts/classify_grammar_levels.py --commit
    python scripts/classify_grammar_levels.py --commit --reclassify-all

    # Probar en un subconjunto pequeño primero:
    python scripts/classify_grammar_levels.py --dry-run --limit 24
"""
import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from database.connection import SessionLocal, init_db
from database.models import GrammarTopic
from services import groq as groq_service
from services.groq import AIRateLimitError

BATCH_SIZE = 6
BATCH_PAUSE_SECONDS = 12
MAX_RETRIES = 5
OUTPUT_DIR = PROJECT_ROOT / "data" / "grammar_classification"


def chunked(items, n):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def classify_all(targets: list[dict]) -> list[dict]:
    """Llama a Groq en lotes de BATCH_SIZE sobre dicts planos (sin DB).
    Devuelve una lista de dicts {slug, level, category, confidence, rationale}
    (si Groq omite un slug del lote, se rellena con level="" para que quede
    visible en vez de desaparecer silenciosamente)."""
    valid_slugs = {t["slug"] for t in targets}
    results: list[dict] = []
    batches = list(chunked(targets, BATCH_SIZE))
    for i, batch in enumerate(batches, 1):
        print(f"  Lote {i}/{len(batches)} ({len(batch)} temas)...", flush=True)
        payload = [{"slug": t["slug"], "title": t["title"], "content_md": t["content_md"]} for t in batch]
        items = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                items = groq_service.classify_grammar_topics_batch(payload)
                break
            except AIRateLimitError as exc:
                wait = 8 * attempt
                print(f"    Rate limit (intento {attempt}/{MAX_RETRIES}), esperando {wait}s... ({exc})", flush=True)
                time.sleep(wait)
        if items is None:
            raise RuntimeError(f"Lote {i} falló tras {MAX_RETRIES} reintentos por rate limit.")
        if i < len(batches):
            time.sleep(BATCH_PAUSE_SECONDS)
        got_slugs = set()
        for item in items:
            if item["slug"] in valid_slugs:
                results.append(item)
                got_slugs.add(item["slug"])
        for t in batch:
            if t["slug"] not in got_slugs:
                results.append({
                    "slug": t["slug"], "level": "", "category": "",
                    "confidence": "", "rationale": "(Groq no devolvió este slug)",
                })
    return results


def print_diff(targets_by_slug: dict, classifications: list[dict]) -> list[dict]:
    """Imprime la tabla diff y devuelve la lista de cambios propuestos
    (solo entradas donde level o category realmente cambian)."""
    changes = []
    print()
    print("=" * 100)
    print(f"{'slug':<45} {'nivel':<12} {'categoría':<28} conf.")
    print("=" * 100)
    for c in classifications:
        t = targets_by_slug.get(c["slug"])
        if t is None:
            continue
        old_level, new_level = t["level"] or "-", c["level"] or "(incierto)"
        old_cat, new_cat = t["category"] or "-", c["category"] or "-"
        level_changed = bool(c["level"]) and c["level"] != t["level"]
        cat_changed = bool(c["category"]) and c["category"] != t["category"]
        if level_changed or cat_changed:
            changes.append({
                "slug": c["slug"],
                "old_level": t["level"], "new_level": c["level"],
                "old_category": t["category"], "new_category": c["category"],
                "confidence": c["confidence"], "rationale": c["rationale"],
            })
            lvl_col = f"{old_level}->{new_level}" if level_changed else new_level
            cat_col = f"{old_cat}->{new_cat}" if cat_changed else new_cat
            print(f"{c['slug']:<45} {lvl_col:<12} {cat_col:<28} {c['confidence']}")
    print("=" * 100)
    print(f"\n{len(changes)} cambio(s) propuesto(s) de {len(classifications)} clasificado(s).\n")
    return changes


def print_level_audit(changes: list[dict], all_snapshot: dict) -> None:
    """Distribución final de niveles (aplicando los cambios propuestos sobre
    el snapshot completo) para detectar niveles casi vacíos (esperado en C2).
    Todo en memoria — no toca la DB."""
    final_level = {slug: v["level"] for slug, v in all_snapshot.items()}
    for c in changes:
        if c["new_level"]:
            final_level[c["slug"]] = c["new_level"]
    counts = Counter(final_level.values())
    print("Distribución de nivel PROYECTADA tras aplicar los cambios:")
    for lvl in ("A1", "A2", "B1", "B2", "C1", "C2", None):
        n = counts.get(lvl, 0)
        label = lvl or "(sin nivel)"
        flag = "  <-- casi vacío, revisar si el corpus realmente no cubre este nivel" if lvl and 0 <= n <= 3 else ""
        print(f"  {label:<12} {n:>4}{flag}")
    print()


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                     help="No-op explícito: dry-run ya es el comportamiento por defecto sin --commit.")
    ap.add_argument("--commit", action="store_true",
                     help="Escribe los cambios en la DB (default: dry-run, no toca nada).")
    ap.add_argument("--reclassify-all", action="store_true",
                     help="Reclasifica también las filas que ya tienen level (no solo las NULL).")
    ap.add_argument("--limit", type=int, default=None,
                     help="Solo procesar los primeros N temas (para pruebas rápidas).")
    args = ap.parse_args()

    init_db()

    # 1) Leer todo lo necesario y CERRAR la conexión antes del loop largo de Groq.
    db = SessionLocal()
    try:
        query = db.query(GrammarTopic).order_by(GrammarTopic.section_number)
        if not args.reclassify_all:
            query = query.filter(GrammarTopic.level.is_(None))
        rows = query.all()
        if args.limit:
            rows = rows[:args.limit]
        if not rows:
            print("Nada que clasificar (todas las filas ya tienen level; usa --reclassify-all para forzar).")
            return 0
        targets = [
            {"slug": r.slug, "title": r.title, "content_md": r.content_md,
             "level": r.level, "category": r.category}
            for r in rows
        ]
        all_snapshot = {
            r.slug: {"level": r.level, "category": r.category}
            for r in db.query(GrammarTopic).all()
        }
    finally:
        db.close()

    print(f"Clasificando {len(targets)} tema(s) ({'todas' if args.reclassify_all else 'solo NULL'})"
          f"{' [DRY-RUN]' if not args.commit else ' [COMMIT]'}...")

    # 2) Loop largo con Groq — sin ninguna sesión de DB abierta.
    classifications = classify_all(targets)

    # 3) Diff + preview — puro cálculo en memoria, se guarda de inmediato.
    targets_by_slug = {t["slug"]: t for t in targets}
    changes = print_diff(targets_by_slug, classifications)
    print_level_audit(changes, all_snapshot)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    preview_path = OUTPUT_DIR / "preview.json"
    preview_path.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Preview completo guardado en: {preview_path}")

    if not args.commit:
        print("\nModo dry-run: no se escribió nada en la base. "
              "Revisa el preview y vuelve a correr con --commit para aplicar.")
        return 0

    if not changes:
        print("No hay cambios que aplicar.")
        return 0

    # 4) Sesión NUEVA solo para el commit (conexión fresca, vida corta).
    db2 = SessionLocal()
    try:
        backup_rows = [{"slug": slug, **v} for slug, v in all_snapshot.items()]
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = OUTPUT_DIR / f"backup_{ts}.json"
        backup_path.write_text(json.dumps(backup_rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Backup de {len(backup_rows)} filas guardado en: {backup_path}")

        applied = 0
        for c in changes:
            row = db2.query(GrammarTopic).filter(GrammarTopic.slug == c["slug"]).one_or_none()
            if row is None:
                continue
            if c["new_level"]:
                row.level = c["new_level"]
            if c["new_category"]:
                row.category = c["new_category"]
            applied += 1
        db2.commit()
        print(f"\nListo: {applied} fila(s) actualizada(s) en la base.")
        return 0
    except Exception:
        db2.rollback()
        raise
    finally:
        db2.close()


if __name__ == "__main__":
    sys.exit(main())
