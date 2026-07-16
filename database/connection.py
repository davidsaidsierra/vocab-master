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
    if "cefr_level" not in existing:
        to_add.append("ADD COLUMN cefr_level VARCHAR(2)")
    if "synonyms" not in existing:
        to_add.append("ADD COLUMN synonyms TEXT")
    if "meanings" not in existing:
        to_add.append("ADD COLUMN meanings TEXT")
    if "common_phrases" not in existing:
        to_add.append("ADD COLUMN common_phrases TEXT")
    if "part_of_speech" not in existing:
        to_add.append("ADD COLUMN part_of_speech VARCHAR(20)")
    if "phonetic" not in existing:
        to_add.append("ADD COLUMN phonetic VARCHAR(60)")
    if "source_document_id" not in existing:
        to_add.append("ADD COLUMN source_document_id INTEGER")
    if not to_add:
        return
    with engine.begin() as conn:
        for clause in to_add:
            conn.execute(text(f"ALTER TABLE words {clause}"))


def _migrate_metrics_columns():
    """
    Añade la columna `metrics` (JSON de services.writing_metrics: errores por
    tipo, distribución de vocabulario CEFR) a writing_challenges y
    exam_task_results, si falta. Idempotente, no destructivo. El valor se
    calcula lazy (al leer /history) sobre datos que ya existen, así que no
    hace falta ningún backfill aquí.
    """
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    for table in ("writing_challenges", "exam_task_results"):
        if table not in tables:
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        if "metrics" not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN metrics TEXT"))


def _bootstrap_admin():
    """
    Crea el usuario admin desde env (ADMIN_EMAIL / ADMIN_PASSWORD) si aún no
    existe. Idempotente: no hace nada si ya hay un usuario con ese email.
    Sin esas env vars, no hace nada (p. ej. en una instalación que aún no migra).
    """
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        return
    from database.models import User
    from api.auth import hash_password  # import diferido: evita ciclo de imports
    with SessionLocal() as db:
        existing = db.query(User).filter(User.email == admin_email).one_or_none()
        if existing is not None:
            return
        db.add(User(
            email=admin_email,
            password_hash=hash_password(admin_password),
            role="admin",
            is_active=1,
        ))
        db.commit()


_USER_ID_TABLES = ["words", "categories", "reviews", "writing_challenges", "exam_attempts", "documents", "annotations"]


def _migrate_user_columns():
    """
    Añade `user_id` (nullable) a las tablas por-usuario si falta, suelta la
    constraint global UNIQUE de `categories.name` (Postgres) para permitir
    nombres por-usuario, y hace backfill de las filas existentes asignándolas al
    admin. Idempotente, válido SQLite y Postgres, no destructivo.
    """
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    present = [t for t in _USER_ID_TABLES if t in tables]

    # 1. Añadir columna user_id donde falte
    to_add = [
        t for t in present
        if "user_id" not in {c["name"] for c in insp.get_columns(t)}
    ]
    if to_add:
        with engine.begin() as conn:
            for t in to_add:
                conn.execute(text(f"ALTER TABLE {t} ADD COLUMN user_id INTEGER"))

    # 2. Soltar la UNIQUE global de categories.name (solo Postgres; en SQLite es
    #    parte del esquema y se deja, es dev de un solo usuario).
    if engine.dialect.name == "postgresql" and "categories" in tables:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key"
            ))

    # 3. Backfill: asignar filas huérfanas (user_id NULL) al admin, si existe.
    from database.models import User
    with SessionLocal() as db:
        admin = (
            db.query(User)
            .filter(User.role == "admin", User.is_active == 1)
            .order_by(User.id.asc())
            .first()
        )
        admin_id = admin.id if admin else None
    if admin_id is None:
        return
    with engine.begin() as conn:
        for t in present:
            conn.execute(
                text(f"UPDATE {t} SET user_id = :aid WHERE user_id IS NULL"),
                {"aid": admin_id},
            )


def init_db():
    from database.models import (  # noqa: F401
        User, Word, Category, Review, WordLookup, WritingChallenge, GrammarTopic,
        DictionaryEntry, DictionaryEntryEs, ExamQuestion, ExamAttempt, ExamTaskResult,
        Document, Annotation,
    )
    Base.metadata.create_all(bind=engine)
    _migrate_word_columns()
    _migrate_metrics_columns()
    _bootstrap_admin()
    _migrate_user_columns()
