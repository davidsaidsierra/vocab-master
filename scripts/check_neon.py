"""Quick connection + state check for Neon (or any DATABASE_URL).

Usage:
    $env:DATABASE_URL = "postgresql://..."
    python scripts/check_neon.py
"""
import os
import sys
import sqlalchemy

sys.stdout.reconfigure(encoding="utf-8")

url = os.environ.get("DATABASE_URL")
if not url:
    print("ERROR: DATABASE_URL no está set en este shell.")
    sys.exit(1)

eng = sqlalchemy.create_engine(url)
with eng.connect() as c:
    ver = c.execute(sqlalchemy.text("SELECT version()")).scalar()
    print("Connected:", ver[:80])

    exists = c.execute(sqlalchemy.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='grammar_topics')"
    )).scalar()
    print("Table exists:", exists)

    if exists:
        n = c.execute(sqlalchemy.text("SELECT COUNT(*) FROM grammar_topics")).scalar()
        print("Rows:", n)
