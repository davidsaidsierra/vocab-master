from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    """
    Usuario de la app (multi-usuario, invite-only). Tres roles:
        - admin    acceso total, IA ilimitada, gestiona usuarios (solo el dueño).
        - premium  IA con tope diario (consume la cuota compartida de Groq).
        - free     funciones sin IA (vocabulario, repaso, diccionario offline...).

    `ai_calls_date` + `ai_calls_today` llevan la cuota diaria por usuario;
    `last_ai_call_at` sirve para el cooldown anti-ráfaga. Todo esto protege el
    free tier compartido de Groq (una sola GROQ_API_KEY para todos).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="free")  # admin | premium | free
    is_active = Column(Integer, default=1)                      # 0/1
    ai_calls_date = Column(Date, nullable=True)                 # día del contador de cuota
    ai_calls_today = Column(Integer, default=0)
    last_ai_call_at = Column(DateTime, nullable=True)           # cooldown anti-ráfaga
    created_at = Column(DateTime, default=_utcnow)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # dueño
    # OJO: la unicidad de `name` pasa a ser POR USUARIO (no global). El check se
    # hace a nivel de app; la constraint global heredada se elimina en la
    # migración (Postgres). Ver _migrate_user_columns().
    name = Column(String(100), nullable=False)
    color = Column(String(7), default="#8b5cf6")
    icon = Column(String(10), default="📚")
    created_at = Column(DateTime, default=_utcnow)

    words = relationship("Word", back_populates="category", lazy="selectin")


class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # dueño
    word = Column(String(200), nullable=False)
    translation = Column(String(200), nullable=False)
    definition = Column(Text, nullable=True)
    example = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    synonyms = Column(Text, nullable=True)          # JSON: ["glad","cheerful",...] (para el modo Synonym); NULL = sin generar
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    difficulty = Column(Integer, default=3)          # 1-5 (dificultad subjetiva del usuario)
    cefr_level = Column(String(2), nullable=True)    # A1..C2 (nivel objetivo, vía cefrpy); NULL si desconocido/frase
    mastery_level = Column(Float, default=0.0)       # 0-100
    next_review = Column(DateTime, default=_utcnow)
    ease_factor = Column(Float, default=2.5)         # SM-2
    interval = Column(Integer, default=0)            # days
    repetitions = Column(Integer, default=0)
    needs_enrichment = Column(Integer, default=0)    # 0/1 — captura rápida pendiente de IA
    source = Column(String(20), default="manual")    # manual | quick | ai
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    category = relationship("Category", back_populates="words", lazy="selectin")
    reviews = relationship("Review", back_populates="word", cascade="all, delete-orphan", lazy="selectin")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # dueño
    word_id = Column(Integer, ForeignKey("words.id"), nullable=False)
    quality = Column(Integer, nullable=False)  # 0-5 (SM-2 quality rating)
    reviewed_at = Column(DateTime, default=_utcnow)

    word = relationship("Word", back_populates="reviews")


class WritingChallenge(Base):
    """
    Each row is one Writing Challenge submission corrected by the AI.
    Used to enforce a daily quota (max 10/day) and to keep history.
    """
    __tablename__ = "writing_challenges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # dueño
    grammar_topic = Column(String(200), nullable=False)
    target_words = Column(Text, nullable=False)        # JSON: ["word1", "word2", ...]
    user_text = Column(Text, nullable=False)
    correction = Column(Text, nullable=False)          # JSON: full Groq response
    words_used_correctly = Column(Text, nullable=True) # JSON: ["word1"]
    grammar_used_correctly = Column(Integer, default=0)  # 0/1 (bool)
    metrics = Column(Text, nullable=True)              # JSON: services.writing_metrics (errores por tipo, vocab CEFR); NULL = se calcula lazy al leer /history
    created_at = Column(DateTime, default=_utcnow, index=True)


class WordLookup(Base):
    """
    Cache of AI-generated contextual lookups.
    One row per unique (lowercased) word/phrase.
    `data` stores the raw JSON returned by the Gemini service so we never
    need to call the AI twice for the same word.
    """
    __tablename__ = "word_lookups"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String(200), nullable=False, unique=True, index=True)
    data = Column(Text, nullable=False)  # JSON-encoded lookup payload
    source = Column(String(50), default="gemini")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class DictionaryEntry(Base):
    """
    Diccionario EN→ES local (offline), importado una sola vez vía
    scripts/import_dictionary.py desde FreeDict (traducciones) + una lista de
    frecuencia (rank). Alimenta el autocompletado por prefijo y la traducción
    rápida en la captura de palabras, SIN llamar a la IA.
    """
    __tablename__ = "dictionary_entries"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String(200), nullable=False, unique=True, index=True)  # headword EN, lowercased
    translation = Column(String(500), nullable=False)  # acepciones ES separadas por ", "
    rank = Column(Integer, nullable=True, index=True)  # frecuencia (1 = más común); NULL si desconocida
    created_at = Column(DateTime, default=_utcnow)


class DictionaryEntryEs(Base):
    """
    Diccionario ES→EN local (offline), importado vía
    scripts/import_dictionary_es.py desde FreeDict spa-eng (traducciones) + una
    lista de frecuencia ES (rank). Alimenta el autocompletado por prefijo y la
    traducción rápida en sentido Español→Inglés (modo práctica de exámenes),
    SIN llamar a la IA. Tabla separada de DictionaryEntry porque la unicidad va
    sobre la palabra fuente (aquí, el headword en español).
    """
    __tablename__ = "dictionary_entries_es"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String(200), nullable=False, unique=True, index=True)  # headword ES, lowercased
    translation = Column(String(500), nullable=False)  # acepciones EN separadas por ", "
    rank = Column(Integer, nullable=True, index=True)  # frecuencia (1 = más común); NULL si desconocida
    created_at = Column(DateTime, default=_utcnow)


class ExamQuestion(Base):
    """
    Banco reutilizable de preguntas de exámenes internacionales (de momento solo
    TOEFL Writing). Cada pregunta generada por IA se persiste aquí para poder
    repetirla o reutilizarla; también se siembra con las muestras oficiales.

    `payload` (JSON) varía según task_type:
      - build_sentence: {"sentences": [{context, scrambled:[...], answer, has_extra} x10]}
      - email:          {"scenario": str, "requirements": [str, str, str]}
      - academic_discussion: {"professor_prompt": str,
                              "student_responses": [{name, text}, {name, text}]}
    """
    __tablename__ = "exam_questions"

    id = Column(Integer, primary_key=True, index=True)
    exam = Column(String(30), nullable=False, default="toefl", index=True)
    section = Column(String(30), nullable=False, default="writing", index=True)
    task_type = Column(String(40), nullable=False, index=True)  # build_sentence | email | academic_discussion
    payload = Column(Text, nullable=False)        # JSON (ver docstring)
    source = Column(String(20), default="ai")     # seed | ai
    difficulty = Column(String(20), nullable=True)  # easy | medium | hard | NULL
    times_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow, index=True)


class ExamAttempt(Base):
    """
    Una sesión de examen: práctica (relajada, con ayudas) o simulación real
    (fiel y calificada). Agrupa los resultados por tarea (ExamTaskResult).
    """
    __tablename__ = "exam_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # dueño
    exam = Column(String(30), nullable=False, default="toefl", index=True)
    section = Column(String(30), nullable=False, default="writing")
    mode = Column(String(20), nullable=False)          # practice | simulation
    time_limit_seconds = Column(Integer, nullable=True)  # elegido por el usuario en práctica
    started_at = Column(DateTime, default=_utcnow)
    submitted_at = Column(DateTime, nullable=True)
    section_band = Column(Float, nullable=True)        # banda estimada 1.0–6.0 (CEFR)
    meta = Column(Text, nullable=True)                 # JSON libre
    created_at = Column(DateTime, default=_utcnow, index=True)

    results = relationship(
        "ExamTaskResult", back_populates="attempt",
        cascade="all, delete-orphan", lazy="selectin",
    )


class ExamTaskResult(Base):
    """
    Resultado de UNA tarea dentro de un intento. Guarda la respuesta del usuario
    y la evaluación completa (JSON de Groq para los ensayos, o resultado
    determinista para Build a Sentence), igual que WritingChallenge.correction.
    """
    __tablename__ = "exam_task_results"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("exam_attempts.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("exam_questions.id"), nullable=True)
    task_type = Column(String(40), nullable=False)
    user_response = Column(Text, nullable=False)   # ensayo, o JSON del orden (build_sentence)
    evaluation = Column(Text, nullable=False)       # JSON: respuesta Groq o resultado determinista
    raw_score = Column(Float, nullable=True)        # 0–10 (build_sentence) o 0–5 (rúbrica ensayo)
    band = Column(Float, nullable=True)             # 1.0–6.0 mapeado por tarea
    metrics = Column(Text, nullable=True)           # JSON: services.writing_metrics; solo para email/academic_discussion (NULL en build_sentence)
    created_at = Column(DateTime, default=_utcnow)

    attempt = relationship("ExamAttempt", back_populates="results")


class GrammarTopic(Base):
    """
    Sección del knowledge base de gramática (238 en total).
    Importada una vez vía scripts/import_grammar_kb.py y usada como
    reference_material en el prompt V2 del Writing Challenge.
    """
    __tablename__ = "grammar_topics"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(200), nullable=False, unique=True, index=True)
    section_number = Column(Integer, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    level = Column(String(10), nullable=True)       # A1/A2/B1/B2/C1 o NULL
    category = Column(String(100), nullable=True)   # "conditionals", "past tenses", ...
    content_md = Column(Text, nullable=False)
    keywords = Column(Text, nullable=True)          # space-separated, lowercased
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
