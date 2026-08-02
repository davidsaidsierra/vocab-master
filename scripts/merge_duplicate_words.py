"""
Fusiona palabras duplicadas dentro del repositorio de un usuario.

Duplicado = la misma palabra guardada dos o más veces (a veces con distinta
mayúscula o distinta traducción: "Achieve"/"achieve", "aware"/"aware").

Qué hace con cada grupo:
  1. Elige la SUPERVIVIENTE: la que más repasos tiene (más repetitions); a
     igualdad, la más antigua. Así se conserva el mejor historial SM-2.
  2. FUSIONA el contenido de las demás en ella: une las traducciones sin
     repetir, y completa definición, ejemplo, notas, sinónimos, significados,
     nivel CEFR y categoría si a la superviviente le faltaban.
  3. REASIGNA los repasos (`reviews`) de las duplicadas a la superviviente,
     para no perder historial.
  4. Borra las filas duplicadas ya vaciadas de contenido único.

Antes de borrar, escribe un respaldo JSON con todas las filas afectadas.

Uso:
    .venv\\Scripts\\python.exe scripts\\merge_duplicate_words.py --user 1 --dry-run
    .venv\\Scripts\\python.exe scripts\\merge_duplicate_words.py --user 1
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

BACKUP_DIR = ROOT / "data" / "backups"


def _naive(dt):
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _merge_translations(a: str | None, b: str | None) -> str:
    """Une dos traducciones separadas por coma sin repetir (el calificador del
    repaso ya acepta cualquiera de las variantes separadas por coma)."""
    parts: list[str] = []
    for chunk in ((a or "") + "," + (b or "")).split(","):
        chunk = chunk.strip()
        if chunk and chunk.lower() not in {p.lower() for p in parts}:
            parts.append(chunk)
    return ", ".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fusiona palabras duplicadas.")
    parser.add_argument("--user", type=int, help="Solo el repositorio de este user_id")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra lo que haría")
    parser.add_argument("--db", help="DATABASE_URL a usar")
    args = parser.parse_args()

    if args.db:
        os.environ["DATABASE_URL"] = args.db
    else:
        try:
            from dotenv import load_dotenv
            load_dotenv(ROOT / ".env")
        except ImportError:
            pass

    from database.connection import init_db, SessionLocal
    from database.models import Word, Review

    init_db()

    with SessionLocal() as db:
        q = db.query(Word)
        if args.user is not None:
            q = q.filter(Word.user_id == args.user)
        words = q.all()

        groups: dict[tuple, list] = {}
        for w in words:
            groups.setdefault((w.user_id, (w.word or "").strip().lower()), []).append(w)
        dups = {k: v for k, v in groups.items() if len(v) > 1}

        if not dups:
            print("No hay duplicados.")
            return

        # Respaldo ANTES de tocar nada.
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        snapshot = [
            {"id": w.id, "user_id": w.user_id, "word": w.word, "translation": w.translation,
             "definition": w.definition, "example": w.example, "notes": w.notes,
             "synonyms": w.synonyms, "meanings": w.meanings, "common_phrases": w.common_phrases,
             "part_of_speech": w.part_of_speech, "cefr_level": w.cefr_level,
             "category_id": w.category_id, "mastery_level": w.mastery_level,
             "repetitions": w.repetitions, "interval": w.interval, "ease_factor": w.ease_factor,
             "created_at": str(w.created_at)}
            for group in dups.values() for w in group
        ]
        backup = BACKUP_DIR / "duplicados_antes_de_fusionar.json"
        if not args.dry_run:
            backup.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"Respaldo de {len(snapshot)} filas en {backup}\n")

        merged = deleted = reviews_moved = 0
        for (_, word_lc), group in sorted(dups.items(), key=lambda kv: kv[0][1]):
            # Superviviente: más repasos; a igualdad, la más antigua.
            group = sorted(
                group,
                key=lambda w: (-(w.repetitions or 0), _naive(w.created_at) or datetime.max, w.id),
            )
            keep, extras = group[0], group[1:]

            for other in extras:
                keep.translation = _merge_translations(keep.translation, other.translation)
                for field in ("definition", "example", "notes", "synonyms", "meanings",
                              "common_phrases", "part_of_speech", "cefr_level",
                              "category_id", "phonetic", "family_root", "family", "family_slot"):
                    if not getattr(keep, field, None) and getattr(other, field, None):
                        setattr(keep, field, getattr(other, field))
                # Si la que se borra era la cabeza de una familia, la
                # superviviente hereda la matriz Y el rol de cabeza; si no, la
                # familia quedaría con la matriz puesta pero invisible.
                if keep.family:
                    keep.family_head = 1
                if not args.dry_run:
                    n = (db.query(Review)
                           .filter(Review.word_id == other.id)
                           .update({Review.word_id: keep.id}, synchronize_session=False))
                    reviews_moved += n or 0
                    db.delete(other)
                deleted += 1

            merged += 1
            print(f"  * {word_lc}: se queda id={keep.id} (reps={keep.repetitions}) "
                  f"| se borran {', '.join(str(o.id) for o in extras)}")
            print(f"      traduccion fusionada: {keep.translation}")

        if not args.dry_run:
            db.commit()

    print(f"\n{'(dry-run) ' if args.dry_run else ''}grupos fusionados: {merged} | "
          f"filas borradas: {deleted} | repasos reasignados: {reviews_moved}")


if __name__ == "__main__":
    main()
