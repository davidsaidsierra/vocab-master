"""
Genera el diccionario ES→EN invirtiendo el eng-spa que ya tenemos.

Para cada entrada EN→ES  (ej. house → "casa, hogar, morada"):
  - Divide las traducciones por ", " y limpia.
  - Por cada término español resultante crea/actualiza una fila en
    DictionaryEntryEs:  "casa" → "house",  "hogar" → "house", etc.
  - Si hay varias palabras EN para la misma palabra ES, se guarda la
    primera (orden de aparición, que tiende a ser la más común porque
    el TEI está ordenado alfabéticamente en inglés).
  - El `rank` se hereda del rango en inglés (lista Google 10k):
    si "house" tiene rank 80, "casa" y "hogar" también quedan rank 80.
    Cuando hay colisión se mantiene el mejor rank (número más bajo).

No descarga nada; usa data/dict_sources/freedict-eng-spa.src.tar.xz
y data/dict_sources/google-10000-english-usa.txt que ya están presentes.

Re-ejecutable: upsert por `word`. No borra nada.

Usage:
    python scripts/invert_dictionary.py
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

from scripts.import_dictionary import parse_tei, parse_freq
from database.connection import SessionLocal, init_db
from database.models import DictionaryEntryEs

SOURCES = PROJECT_ROOT / "data" / "dict_sources"
TEI_PATH  = SOURCES / "freedict-eng-spa.src.tar.xz"
FREQ_PATH = SOURCES / "google-10000-english-usa.txt"
TRANS_MAX = 500  # max chars para la columna translation


def build_inversion(
    translations: dict[str, str],
    ranks: dict[str, int],
) -> dict[str, tuple[str, int | None]]:
    """
    Devuelve { es_word: (en_headword, rank) }.
    Para cada EN headword y sus traducciones ES, genera la inversión.
    Cuando varias EN coinciden en la misma ES conserva el de mejor rank
    (rank más bajo = más frecuente). Si ambos sin rank, el primero.
    """
    inv: dict[str, tuple[str, int | None]] = {}
    for en_word, es_trans in translations.items():
        rank = ranks.get(en_word)           # rank del headword en inglés
        for part in es_trans.split(","):
            es = part.strip().lower()
            if not es or len(es) > 120:     # descartar frases muy largas
                continue
            if es not in inv:
                inv[es] = (en_word, rank)
            else:
                _, cur_rank = inv[es]
                # preferir el de menor rank (más frecuente)
                if rank is not None and (cur_rank is None or rank < cur_rank):
                    inv[es] = (en_word, rank)
    return inv


def upsert(inv: dict[str, tuple[str, int | None]]) -> tuple[int, int]:
    init_db()
    db = SessionLocal()
    inserted = updated = 0
    try:
        existing = {r.word: r for r in db.query(DictionaryEntryEs).all()}
        for es_word, (en_word, rank) in inv.items():
            translation = en_word[:TRANS_MAX]
            row = existing.get(es_word)
            if row is None:
                db.add(DictionaryEntryEs(word=es_word, translation=translation, rank=rank))
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
    return inserted, updated


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    if not TEI_PATH.is_file():
        print(f"ERROR: no existe {TEI_PATH}", file=sys.stderr)
        return 1

    print(f"Parseando TEI: {TEI_PATH.name} …")
    translations = parse_tei(TEI_PATH)
    print(f"  {len(translations)} headwords EN con traducción ES.")

    ranks: dict[str, int] = {}
    if FREQ_PATH.is_file():
        print(f"Parseando frecuencia: {FREQ_PATH.name} …")
        ranks = parse_freq(FREQ_PATH)
        print(f"  {len(ranks)} palabras con rango de frecuencia.")

    print("Invirtiendo EN→ES a ES→EN …")
    inv = build_inversion(translations, ranks)
    print(f"  {len(inv)} entradas ES únicas generadas.")

    print("Guardando en DictionaryEntryEs …")
    inserted, updated = upsert(inv)
    print()
    print("=" * 60)
    print(f"Insertadas: {inserted}   Actualizadas: {updated}")
    print("=" * 60)
    print("Ahora /api/dictionary/suggest?dir=es-en funcionará offline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
