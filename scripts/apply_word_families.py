"""
Aplica las matrices de familia curadas a las palabras que ya existen.

Las matrices de `data/word_families/*.json` están escritas A MANO (por Claude,
no por Groq): son datos léxicos, no se derivan con reglas, y así el backfill no
gasta ni una llamada de IA ni cuota. El script es 100% determinista y offline.

Qué hace, por cada usuario y por cada familia:
  1. Busca entre las palabras del usuario cuáles caen dentro de la familia
     (forma base o flexión: help, helper, helpful, helped, helping…).
  2. Elige la CABEZA — la que llevará la matriz y el progreso SM-2:
     preferencia por la palabra igual a la raíz; si no está, la más antigua
     (así se conserva el historial de repaso más largo).
  3. Absorbe las demás como miembros (family_head = 0). NADA se borra: la fila
     sigue ahí, solo deja de contar y de repasarse por separado.

Uso:
    .venv\\Scripts\\python.exe scripts\\apply_word_families.py --dry-run
    .venv\\Scripts\\python.exe scripts\\apply_word_families.py
    .venv\\Scripts\\python.exe scripts\\apply_word_families.py --create
    .venv\\Scripts\\python.exe scripts\\apply_word_families.py --db sqlite:///data/preview_demo.db

`--create` además crea la palabra cabeza cuando la familia no toca ninguna
palabra existente (útil para sembrar familias nuevas de una).
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FAMILIES_DIR = ROOT / "data" / "word_families"


def _load_matrices(word_family) -> list[dict]:
    """Lee todos los JSON del directorio (cada archivo: un objeto o una lista)."""
    matrices: list[dict] = []
    for path in sorted(FAMILIES_DIR.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        items = raw if isinstance(raw, list) else [raw]
        for item in items:
            try:
                matrices.append(word_family.normalize(item))
            except ValueError as exc:
                print(f"  ! {path.name}: {exc}")
    return matrices


def _naive(dt):
    """SQLite devuelve datetimes sin tz y los recién creados vienen con tz UTC;
    hay que normalizar antes de comparar o Python revienta."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _pick_head(candidates: list, root: str, matrix: dict, word_family):
    """
    La cabeza: la palabra igual a la raíz; si no, una forma base de la matriz
    (helpful, maintenance…); si no, una flexión. Un phrasal NUNCA es cabeza —
    'help out' no puede representar a toda la familia 'help'. A igualdad de
    categoría gana la más antigua, para conservar el historial de repaso.
    """
    exact = [w for w in candidates if (w.word or "").strip().lower() == root]
    if exact:
        return exact[0]

    bases = {
        cell["form"].lower()
        for cell in (matrix.get("slots") or {}).values() if cell
    }

    def rank(w):
        form = (w.word or "").strip().lower()
        slot = word_family.slot_of_form(matrix, form)
        if form in bases:
            tier = 0                       # forma base de una celda
        elif slot in ("phrasal", "expression"):
            tier = 2                       # phrasal: última opción
        else:
            tier = 1                       # flexión
        return (tier, w.created_at is None, _naive(w.created_at) or datetime.max, w.id or 0)

    return sorted(candidates, key=rank)[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Aplica las familias curadas a las palabras existentes.")
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra lo que haría")
    parser.add_argument("--create", action="store_true", help="Crear la cabeza si la familia no toca ninguna palabra")
    parser.add_argument("--db", help="DATABASE_URL a usar (por defecto, la del entorno o la SQLite local)")
    parser.add_argument("--user", type=int, help="Aplicar solo al repositorio de este user_id")
    args = parser.parse_args()

    if args.db:
        os.environ["DATABASE_URL"] = args.db
    else:
        # Sin --db se usa la base real (Neon en producción), igual que main.py.
        try:
            from dotenv import load_dotenv
            load_dotenv(ROOT / ".env")
        except ImportError:
            pass

    from database.connection import init_db, SessionLocal
    from database.models import Word
    from services import word_family, cefr

    init_db()
    matrices = _load_matrices(word_family)
    print(f"Familias curadas: {len(matrices)} ({FAMILIES_DIR})\n")

    created = absorbed = applied = 0
    with SessionLocal() as db:
        q = db.query(Word)
        if args.user is not None:
            q = q.filter(Word.user_id == args.user)
        all_words = q.all()
        # Agrupar por dueño: una familia se resuelve dentro del repositorio de
        # cada usuario, no entre usuarios distintos.
        by_owner: dict[int | None, list] = {}
        for w in all_words:
            by_owner.setdefault(w.user_id, []).append(w)

        for owner, words in by_owner.items():
            label = f"user_id={owner}" if owner is not None else "sin dueño"
            print(f"-- {label} - {len(words)} palabras")
            for matrix in matrices:
                root = matrix["root"]
                forms = word_family.absorbable_forms(matrix)
                hits = [w for w in words if (w.word or "").strip().lower() in forms]
                # Nunca robarle una palabra a otra familia: 'bore' es el pasado
                # de 'bear', pero también es la raíz de bore/boring/bored. Si ya
                # es cabeza de su propia familia, se respeta.
                hits = [w for w in hits if (word_family.loads(w.family) or {}).get("root", root) == root]

                # Un phrasal no puede representar a la familia: si lo único que
                # tienes de 'help' es 'help out', hace falta crear la cabeza
                # 'help' y colgarle el phrasal como miembro.
                real_heads = [
                    w for w in hits
                    if word_family.slot_of_form(matrix, (w.word or "").strip().lower())
                    not in ("phrasal", "expression")
                ]

                if not real_heads:
                    if not args.create:
                        if hits:
                            print(f"   ? {root}: solo tienes phrasals "
                                  f"({', '.join(w.word for w in hits)}); usa --create para armar la familia")
                        continue
                    head = Word(
                        user_id=owner,
                        word=root,
                        translation=word_family.summary_translation(matrix),
                        cefr_level=cefr.level_for_word(root),
                        source="manual",
                    )
                    if not args.dry_run:
                        db.add(head)
                        db.flush()
                    words.append(head)
                    hits = hits + [head]   # los phrasals sueltos quedan de miembros
                    real_heads = [head]
                    created += 1
                    print(f"   + {root}: creada la cabeza (solo había phrasals o nada)")

                head = _pick_head(real_heads, root, matrix, word_family)
                members = [w for w in hits if w is not head]

                print(f"   * {root}: cabeza '{head.word}'"
                      + (f" | absorbe: {', '.join(m.word for m in members)}" if members else ""))

                if args.dry_run:
                    applied += 1
                    absorbed += len(members)
                    continue

                head.family = word_family.dumps(matrix)
                head.family_root = root
                head.family_head = 1
                head.family_slot = word_family.slot_of_form(matrix, head.word)
                # La traducción es la de SU casilla, no el resumen de la familia
                # entera: con el resumen, el repaso aceptaba la traducción de
                # cualquier otra celda y el ejercicio dejaba de discriminar.
                own = word_family.cell_translation(matrix, head.family_slot)
                if own:
                    head.translation = own
                if not head.cefr_level:
                    head.cefr_level = cefr.level_for_word(head.word)
                applied += 1

                for m in members:
                    m.family_root = root
                    m.family_head = 0
                    m.family_slot = word_family.slot_of_form(matrix, (m.word or "").lower())
                    own_m = word_family.cell_translation(matrix, m.family_slot)
                    if own_m:
                        m.translation = own_m
                    absorbed += 1

        if not args.dry_run:
            db.commit()

    print(f"\n{'(dry-run) ' if args.dry_run else ''}"
          f"familias aplicadas: {applied} | cabezas creadas: {created} | palabras absorbidas: {absorbed}")
    print("Nada se borró: las palabras absorbidas siguen en la base, solo dejan de contar por separado.")


if __name__ == "__main__":
    main()
