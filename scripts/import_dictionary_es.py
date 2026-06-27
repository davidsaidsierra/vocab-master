"""
Import the offline ES→EN dictionary into the DictionaryEntryEs table.

Fuentes (descargar a data/dict_sources/):
  - FreeDict spa-eng (TEI XML)          → traducciones (palabra_es → translation_en)
    https://freedict.org/  (paquete "spa-eng")
  - (opcional) lista de frecuencia ES   → ranking (una palabra por línea)

Mismo formato TEI que eng-spa, así que reutilizamos el parser de
import_dictionary.py (parse_tei / parse_freq). El headword aquí es español y las
traducciones son inglesas. Alimenta el autocompletado/traducción ES→EN del modo
práctica de exámenes (sin IA), vía /api/dictionary/...?dir=es-en.

Re-ejecutable: upsert por `word`. No borra nada.

Usage:
    python scripts/import_dictionary_es.py [tei_or_targz] [freq_list]
    Defaults:
        tei_or_targz = data/dict_sources/freedict-spa-eng.src.tar.xz
        freq_list    = data/dict_sources/es-frequency.txt   (opcional)
"""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

# Reutiliza el parser TEI/frecuencia del importador EN→ES (mismo formato FreeDict).
from scripts.import_dictionary import parse_tei, parse_freq  # noqa: E402
from database.connection import SessionLocal, init_db  # noqa: E402
from database.models import DictionaryEntryEs  # noqa: E402


def upsert_entries(translations: dict[str, str], ranks: dict[str, int]) -> tuple[int, int, int]:
    """Returns (inserted, updated, with_rank)."""
    init_db()  # crea dictionary_entries_es si falta
    db = SessionLocal()
    inserted = updated = with_rank = 0
    try:
        existing = {row.word: row for row in db.query(DictionaryEntryEs).all()}
        for word, translation in translations.items():
            rank = ranks.get(word)
            if rank is not None:
                with_rank += 1
            row = existing.get(word)
            if row is None:
                db.add(DictionaryEntryEs(word=word, translation=translation, rank=rank))
                inserted += 1
            else:
                row.translation = translation
                row.rank = rank
                updated += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return inserted, updated, with_rank


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    sources = PROJECT_ROOT / "data" / "dict_sources"
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("tei", nargs="?", default=str(sources / "freedict-spa-eng.src.tar.xz"),
                    help="TEI de FreeDict spa-eng (.tei o .tar.xz)")
    ap.add_argument("freq", nargs="?", default=str(sources / "es-frequency.txt"),
                    help="Lista de frecuencia ES (una palabra por línea); opcional")
    args = ap.parse_args()

    tei_path, freq_path = Path(args.tei), Path(args.freq)
    if not tei_path.is_file():
        print(f"ERROR: no existe el TEI {tei_path}", file=sys.stderr)
        print("Descarga el paquete FreeDict 'spa-eng' desde https://freedict.org/", file=sys.stderr)
        return 1

    print(f"Parseando TEI: {tei_path.name} ...")
    translations = parse_tei(tei_path)
    print(f"  {len(translations)} headwords (ES) con traducción.")

    ranks: dict[str, int] = {}
    if freq_path.is_file():
        print(f"Parseando frecuencia: {freq_path.name} ...")
        ranks = parse_freq(freq_path)
        print(f"  {len(ranks)} palabras con rango de frecuencia.")
    else:
        print(f"(sin lista de frecuencia en {freq_path.name}; rank quedará NULL)")

    inserted, updated, with_rank = upsert_entries(translations, ranks)
    print()
    print("=" * 60)
    print(f"Imported {inserted} entries, updated {updated} ({with_rank} with frequency rank)")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
