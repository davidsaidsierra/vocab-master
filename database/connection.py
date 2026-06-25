import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    # Neon/PostgreSQL en la nube
    engine = create_engine(DATABASE_URL)
else:
    # SQLite local
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DB_PATH = os.path.join(BASE_DIR, "data", "vocab.db")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_word_columns():
    """
    Añade columnas nuevas a `words` si faltan (la tabla ya existe en bases de
    datos previas, así que create_all no las agrega). Idempotente y válido para
    SQLite y Postgres. No borra ni altera datos existentes.
    """
    insp = inspect(engine)
    if "words" not in insp.get_table_names():
        return  # tabla aún no creada; create_all la crea ya con las columnas
    existing = {c["name"] for c in insp.get_columns("words")}
    to_add = []
    if "needs_enrichment" not in existing:
        to_add.append("ADD COLUMN needs_enrichment INTEGER DEFAULT 0")
    if "source" not in existing:
        to_add.append("ADD COLUMN source VARCHAR(20) DEFAULT 'manual'")
    if not to_add:
        return
    with engine.begin() as conn:
        for clause in to_add:
            conn.execute(text(f"ALTER TABLE words {clause}"))


def init_db():
    from database.models import Word, Category, Review, WordLookup, WritingChallenge, GrammarTopic, DictionaryEntry  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_word_columns()
