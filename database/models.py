from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    color = Column(String(7), default="#8b5cf6")
    icon = Column(String(10), default="📚")
    created_at = Column(DateTime, default=_utcnow)

    words = relationship("Word", back_populates="category", lazy="selectin")


class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String(200), nullable=False)
    translation = Column(String(200), nullable=False)
    definition = Column(Text, nullable=True)
    example = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    difficulty = Column(Integer, default=3)          # 1-5
    mastery_level = Column(Float, default=0.0)       # 0-100
    next_review = Column(DateTime, default=_utcnow)
    ease_factor = Column(Float, default=2.5)         # SM-2
    interval = Column(Integer, default=0)            # days
    repetitions = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    category = relationship("Category", back_populates="words", lazy="selectin")
    reviews = relationship("Review", back_populates="word", cascade="all, delete-orphan", lazy="selectin")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
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
    grammar_topic = Column(String(200), nullable=False)
    target_words = Column(Text, nullable=False)        # JSON: ["word1", "word2", ...]
    user_text = Column(Text, nullable=False)
    correction = Column(Text, nullable=False)          # JSON: full Groq response
    words_used_correctly = Column(Text, nullable=True) # JSON: ["word1"]
    grammar_used_correctly = Column(Integer, default=0)  # 0/1 (bool)
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
