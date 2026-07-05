"""
Backfill del nivel CEFR para palabras ya existentes que no lo tienen.

Offline y determinista (usa cefrpy, sin IA ni red). Idempotente: solo toca filas
con cefr_level NULL, así que se puede correr varias veces sin problema. Respeta
DATABASE_URL (SQLite local o Neon), igual que el resto de scripts.

Uso:
    # Local (SQLite):
    .venv\\Scripts\\python.exe scripts\\backfill_cefr.py

    # Contra Neon:
    $env:DATABASE_URL = "postgresql://..."; .venv\\Scripts\\python.exe scripts\\backfill_cefr.py
"""

import os
import sys

# Permite ejecutar el script directamente (añade la raíz del proyecto al path).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import SessionLocal, init_db
from database.models import Word
from services import cefr


def main() -> None:
    init_db()  # asegura que la columna cefr_level exista (migración idempotente)

    with SessionLocal() as db:
        pending = db.query(Word).filter(Word.cefr_level.is_(None)).all()
        total = len(pending)
        if total == 0:
            print("No hay palabras sin nivel CEFR. Nada que hacer.")
            return

        print(f"Calculando nivel CEFR para {total} palabra(s)...")
        assigned = 0
        by_level: dict[str, int] = {}
        for w in pending:
            lvl = cefr.level_for_word(w.word)
            if lvl:
                w.cefr_level = lvl
                assigned += 1
                by_level[lvl] = by_level.get(lvl, 0) + 1
        db.commit()

    print(f"Listo: {assigned}/{total} palabras etiquetadas "
          f"({total - assigned} sin nivel: frases o fuera de la base).")
    for lvl in ("A1", "A2", "B1", "B2", "C1", "C2"):
        if by_level.get(lvl):
            print(f"  {lvl}: {by_level[lvl]}")


if __name__ == "__main__":
    main()
