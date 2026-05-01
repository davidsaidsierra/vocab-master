from pydantic import BaseModel
from datetime import datetime


# ── Categories ──────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str
    color: str = "#8b5cf6"
    icon: str = "📚"

class CategoryOut(BaseModel):
    id: int
    name: str
    color: str
    icon: str
    created_at: datetime
    word_count: int = 0

    class Config:
        from_attributes = True


# ── Words ───────────────────────────────────────────────────
class WordCreate(BaseModel):
    word: str
    translation: str
    definition: str | None = None
    example: str | None = None
    notes: str | None = None
    category_id: int | None = None
    difficulty: int = 3

class WordUpdate(BaseModel):
    word: str | None = None
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    notes: str | None = None
    category_id: int | None = None
    difficulty: int | None = None

class WordOut(BaseModel):
    id: int
    word: str
    translation: str
    definition: str | None
    example: str | None
    notes: str | None
    category_id: int | None
    category_name: str | None = None
    category_color: str | None = None
    category_icon: str | None = None
    difficulty: int
    mastery_level: float
    next_review: datetime
    ease_factor: float
    interval: int
    repetitions: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Reviews ─────────────────────────────────────────────────
class ReviewCreate(BaseModel):
    word_id: int
    quality: int  # 0-5

class ReviewOut(BaseModel):
    id: int
    word_id: int
    quality: int
    reviewed_at: datetime

    class Config:
        from_attributes = True


# ── Lookup (AI-powered contextual translation) ─────────────
class LookupExample(BaseModel):
    en: str
    es: str

class LookupMeaning(BaseModel):
    part_of_speech: str = ""
    translation_es: str = ""
    definition_en: str = ""
    definition_es: str = ""
    examples: list[LookupExample] = []

class LookupPhrase(BaseModel):
    phrase: str
    meaning_es: str = ""
    example_en: str = ""
    example_es: str = ""

class LookupOut(BaseModel):
    word: str
    phonetic: str = ""
    meanings: list[LookupMeaning] = []
    common_phrases: list[LookupPhrase] = []
    cached: bool = False  # true if served from DB cache
    source: str = "gemini"


# ── Writing Challenge ──────────────────────────────────────
class WritingChallengeWord(BaseModel):
    id: int
    word: str
    translation: str
    mastery_level: float

class WritingWordsOut(BaseModel):
    words: list[WritingChallengeWord]
    daily_used: int
    daily_limit: int

class WritingSubmitIn(BaseModel):
    grammar_topic: str
    grammar_hint: str = ""
    target_word_ids: list[int] = []
    target_words: list[str] = []
    user_text: str

class WritingError(BaseModel):
    original: str = ""
    fix: str = ""
    type: str = ""
    explanation_es: str = ""

class WritingSubmitOut(BaseModel):
    corrected: str
    errors: list[WritingError] = []
    words_used_correctly: list[str] = []
    grammar_used_correctly: bool = False
    grammar_feedback_es: str = ""
    encouragement_es: str = ""
    score: int = 0
    mastery_boosts: list[dict] = []  # [{word_id, word, old, new}]
    daily_used: int = 0
    daily_limit: int = 10
