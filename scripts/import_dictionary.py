"""
Import the offline EN→ES dictionary into the DictionaryEntry table.

Fuentes (descargadas a data/dict_sources/, ver PHASE_2_PLAN.md):
  - FreeDict eng-spa (TEI XML)         → traducciones (word → translation)
  - Google 10k English (1 word/línea)  → ranking de frecuencia (rank)

Híbrido: por cada headword de FreeDict se asigna su `rank` desde la lista de
frecuencia (NULL si no aparece). El rank ordena el autocompletado para que las
palabras comunes salgan primero.

Re-ejecutable: upsert por `word`. No borra nada.

Usage:
    python scripts/import_dictionary.py [tei_or_targz] [freq_list]
    Defaults:
        tei_or_targz = data/dict_sources/freedict-eng-spa.src.tar.xz
        freq_list    = data/dict_sources/google-10000-english-usa.txt
"""

import argparse
import lzma
import sys
import tarfile
import xml.etree.ElementTree as ET
from pathlib import Path

# Bootstrap: este script vive en scripts/, así que la raíz es su padre.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Cargar .env antes de importar database.connection (que lee DATABASE_URL al importarse).
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

from database.connection import SessionLocal, init_db
from database.models import DictionaryEntry

TRANSLATION_MAX = 500  # debe coincidir con DictionaryEntry.translation


def _local(tag: str) -> str:
    """Quita el namespace de un tag ElementTree ('{ns}entry' → 'entry')."""
    return tag.rsplit("}", 1)[-1]


def _open_tei(path: Path):
    """Devuelve un file-object con el contenido TEI, sea .tei plano o .tar.xz."""
    if path.suffix == ".tei":
        return path.open("rb")
    if path.name.endswith(".tar.xz"):
        tar = tarfile.open(path, "r:xz")
        member = next((m for m in tar.getmembers() if m.name.endswith(".tei")), None)
        if member is None:
            raise ValueError(f"No se encontró ningún .tei dentro de {path}")
        return tar.extractfile(member)  # el tar queda abierto mientras se lee
    if path.name.endswith(".xz"):
        return lzma.open(path, "rb")
    raise ValueError(f"Formato no reconocido: {path} (esperaba .tei, .tar.xz o .xz)")


# ── Parsing ────────────────────────────────────────────────────────────────
def parse_tei(path: Path) -> dict[str, str]:
    """
    Devuelve {word_lc: 'trad1, trad2, ...'} a partir del TEI de FreeDict.
    Estructura por entrada:
        <entry><form><orth>WORD</orth></form>
               <sense><cit type="trans"><quote>TRAD</quote>...</cit>...</sense>...
    """
    acc: dict[str, list[str]] = {}
    f = _open_tei(path)
    try:
        for event, elem in ET.iterparse(f, events=("end",)):
            if _local(elem.tag) != "entry":
                continue
            # headword
            orth = None
            for form in elem:
                if _local(form.tag) == "form":
                    for child in form:
                        if _local(child.tag) == "orth" and child.text:
                            orth = child.text.strip()
                            break
                if orth:
                    break
            # traducciones: todos los <quote> dentro de <cit type="trans">
            trans: list[str] = []
            for cit in elem.iter():
                if _local(cit.tag) != "cit" or cit.get("type") != "trans":
                    continue
                for q in cit:
                    if _local(q.tag) == "quote" and q.text:
                        t = q.text.strip().lstrip("\\").strip()
                        if t:
                            trans.append(t)

            if orth and trans:
                key = orth.lower()
                bucket = acc.setdefault(key, [])
                for t in trans:
                    if t not in bucket:
                        bucket.append(t)

            elem.clear()  # liberar memoria (archivo de ~34 MB)
    finally:
        f.close()

    return {w: ", ".join(ts)[:TRANSLATION_MAX] for w, ts in acc.items()}


def parse_freq(path: Path) -> dict[str, int]:
    """Lista de frecuencia: una palabra por línea → {word_lc: rank} (rank=nº línea, 1=más común)."""
    ranks: dict[str, int] = {}
    with path.open("r", encoding="utf-8") as fh:
        rank = 0
        for line in fh:
            w = line.strip().lower()
            if not w:
                continue
            rank += 1
            ranks.setdefault(w, rank)  # primera aparición gana
    return ranks


# ── Upsert ─────────────────────────────────────────────────────────────────
def upsert_entries(translations: dict[str, str], ranks: dict[str, int]) -> tuple[int, int, int]:
    """Returns (inserted, updated, with_rank)."""
    init_db()  # crea dictionary_entries + migra columnas de words
    db = SessionLocal()
    inserted = updated = with_rank = 0
    try:
        existing = {row.word: row for row in db.query(DictionaryEntry).all()}
        for word, translation in translations.items():
            rank = ranks.get(word)
            if rank is not None:
                with_rank += 1
            row = existing.get(word)
            if row is None:
                db.add(DictionaryEntry(word=word, translation=translation, rank=rank))
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


# ── Main ───────────────────────────────────────────────────────────────────
def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    sources = PROJECT_ROOT / "data" / "dict_sources"
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("tei", nargs="?", default=str(sources / "freedict-eng-spa.src.tar.xz"),
                    help="TEI de FreeDict (.tei o .tar.xz)")
    ap.add_argument("freq", nargs="?", default=str(sources / "google-10000-english-usa.txt"),
                    help="Lista de frecuencia (una palabra por línea)")
    args = ap.parse_args()

    tei_path, freq_path = Path(args.tei), Path(args.freq)
    if not tei_path.is_file():
        print(f"ERROR: no existe el TEI {tei_path}", file=sys.stderr)
        return 1
    if not freq_path.is_file():
        print(f"ERROR: no existe la lista de frecuencia {freq_path}", file=sys.stderr)
        return 1

    print(f"Parseando TEI: {tei_path.name} ...")
    translations = parse_tei(tei_path)
    print(f"  {len(translations)} headwords con traducción.")

    print(f"Parseando frecuencia: {freq_path.name} ...")
    ranks = parse_freq(freq_path)
    print(f"  {len(ranks)} palabras con rango de frecuencia.")

    inserted, updated, with_rank = upsert_entries(translations, ranks)
    print()
    print("=" * 60)
    print(f"Imported {inserted} entries, updated {updated} ({with_rank} with frequency rank)")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
