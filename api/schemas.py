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


# ── Lookup (AI-powered contextual translation) ─────────────
# Definidos antes de Words porque un Word puede guardar TODAS sus acepciones
# (meanings) y frases comunes tal como las devuelve el lookup.
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


# ── Words ───────────────────────────────────────────────────
class WordCreate(BaseModel):
    word: str
    translation: str
    definition: str | None = None
    example: str | None = None
    notes: str | None = None
    category_id: int | None = None
    difficulty: int = 3
    # Guardar-todo desde el lookup: todas las acepciones + frases + categoría.
    meanings: list[LookupMeaning] | None = None
    common_phrases: list[LookupPhrase] | None = None
    part_of_speech: str | None = None
    phonetic: str | None = None
    source_document_id: int | None = None

class WordUpdate(BaseModel):
    word: str | None = None
    translation: str | None = None
    definition: str | None = None
    example: str | None = None
    notes: str | None = None
    category_id: int | None = None
    difficulty: int | None = None
    synonyms: list[str] | None = None
    meanings: list[LookupMeaning] | None = None
    common_phrases: list[LookupPhrase] | None = None
    part_of_speech: str | None = None
    phonetic: str | None = None

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
    cefr_level: str | None = None
    synonyms: list[str] = []
    meanings: list[LookupMeaning] = []
    common_phrases: list[LookupPhrase] = []
    part_of_speech: str | None = None
    phonetic: str | None = None
    source_document_id: int | None = None
    mastery_level: float
    next_review: datetime
    ease_factor: float
    interval: int
    repetitions: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class QuickWordCreate(BaseModel):
    word: str
    translation: str | None = None  # si falta, se resuelve del diccionario offline
    category_id: int | None = None

class QuickWordOut(BaseModel):
    word: WordOut
    pending_count: int  # palabras con needs_enrichment=1 tras esta captura

class EnrichResult(BaseModel):
    id: int
    word: str
    translation: str
    definition: str | None = None
    example: str | None = None

class EnrichOut(BaseModel):
    enriched: list[EnrichResult] = []
    remaining_pending: int = 0

class SynonymBackfillOut(BaseModel):
    updated: int = 0            # palabras a las que se les generó sinónimos en esta tanda
    remaining: int = 0          # palabras que aún faltan por procesar

class LevelBackfillOut(BaseModel):
    updated: int = 0            # palabras a las que se les asignó nivel CEFR en esta pasada
    unresolved: int = 0         # palabras sin nivel posible (frases o fuera de la base)


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
    grammar_topic_slug: str | None = None  # if set, triggers KB-grounded V2 flow
    target_word_ids: list[int] = []
    target_words: list[str] = []
    user_text: str

class WritingError(BaseModel):
    original: str = ""
    fix: str = ""
    type: str = ""
    explanation_es: str = ""
    reference_quote: str = ""

class VocabularySuggestion(BaseModel):
    word: str
    reason_es: str = ""
    example_en: str = ""

class GrammarTopicUsage(BaseModel):
    used: str = "no"  # "yes" | "no" | "partial"
    variant_used: str = ""
    explanation_es: str = ""


# ── Métricas deterministas de escritura (services/writing_metrics.py, sin IA) ─
class WritingMetricsOut(BaseModel):
    word_count: int = 0
    sentence_count: int = 0
    errors_total: int = 0
    errors_by_type: dict[str, int] = {}
    errors_per_100: float = 0.0
    spelling_suspects: list[str] = []
    vocab_distribution: dict[str, float] = {}  # A1..C2 + "unknown", en % (suman ~100)
    advanced_pct: float = 0.0  # % de vocabulario B2+


class WritingSubmitOut(BaseModel):
    corrected: str
    errors: list[WritingError] = []
    words_used_correctly: list[str] = []
    grammar_used_correctly: bool = False  # derived from grammar_topic_usage; kept for back-compat
    grammar_topic_usage: GrammarTopicUsage = GrammarTopicUsage()
    grammar_feedback_es: str = ""
    encouragement_es: str = ""
    score: int = 0
    mastery_boosts: list[dict] = []  # [{word_id, word, old, new}]
    vocabulary_suggestions: list[VocabularySuggestion] = []
    daily_used: int = 0
    daily_limit: int = 10
    metrics: WritingMetricsOut = WritingMetricsOut()

class WritingHistoryItem(BaseModel):
    id: int
    created_at: datetime
    grammar_topic: str
    score: int = 0
    metrics: WritingMetricsOut = WritingMetricsOut()

class WritingHistoryOut(BaseModel):
    items: list[WritingHistoryItem] = []


# ── Dictionary (offline EN→ES) ──────────────────────────────
class DictSuggestion(BaseModel):
    word: str
    translation: str

class DictSuggestOut(BaseModel):
    suggestions: list[DictSuggestion] = []

class DictTranslateOut(BaseModel):
    word: str
    translation: str = ""
    found: bool = False


# ── Lector de PDF: documentos y anotaciones ─────────────────
class DocumentCreate(BaseModel):
    title: str
    content_hash: str          # sha256 del archivo (identifica el PDF local sin subirlo)
    num_pages: int | None = None

class DocumentUpdate(BaseModel):
    title: str | None = None
    last_page: int | None = None
    last_scroll: float | None = None
    num_pages: int | None = None

class DocumentOut(BaseModel):
    id: int
    title: str
    content_hash: str
    storage: str
    num_pages: int | None = None
    last_page: int
    last_scroll: float
    last_opened_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class AnnotationRect(BaseModel):
    x: float
    y: float
    width: float
    height: float

class AnnotationCreate(BaseModel):
    page: int
    kind: str = "highlight"  # highlight | note | bookmark
    selected_text: str | None = None
    note_text: str | None = None
    color: str | None = "#fde68a"
    rects: list[AnnotationRect] = []

class AnnotationUpdate(BaseModel):
    note_text: str | None = None
    color: str | None = None

class AnnotationOut(BaseModel):
    id: int
    document_id: int
    page: int
    kind: str
    selected_text: str | None
    note_text: str | None
    color: str | None
    rects: list[AnnotationRect] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ── Lookup contextual (desde el lector de PDF) ──────────────
# Igual que LookupOut pero para UN significado puntual, el que aplica en la
# oración seleccionada (no todas las acepciones del diccionario).
class ContextualLookupIn(BaseModel):
    word: str
    context: str  # la oración/fragmento donde aparece la palabra

class ContextualLookupOut(BaseModel):
    word: str
    context: str
    part_of_speech: str = ""
    sense_es: str = ""          # traducción/sentido EN ESE contexto
    explanation_es: str = ""    # por qué significa eso ahí (matiz, no el genérico)
    cached: bool = False
    source: str = "gemini"


# ── Grammar topics ──────────────────────────────────────────
class GrammarTopicSummary(BaseModel):
    id: int
    slug: str
    section_number: int
    title: str
    level: str | None = None
    category: str | None = None

    class Config:
        from_attributes = True

class GrammarTopicFull(GrammarTopicSummary):
    content_md: str
    keywords: str | None = None

class GrammarTopicsOut(BaseModel):
    topics: list[GrammarTopicSummary]

class GrammarCategoryCount(BaseModel):
    category: str | None = None
    count: int


# ── International Exams (TOEFL Writing) ──────────────────────
class ExamSectionMeta(BaseModel):
    key: str          # writing | reading | listening | speaking
    label: str
    available: bool = False  # implementado en la app

class ExamMeta(BaseModel):
    key: str          # toefl | cambridge | ielts
    name: str
    origin: str       # país de origen
    flag: str = ""    # emoji
    total_duration: str = ""
    description: str = ""
    sections: list[ExamSectionMeta] = []
    available: bool = False  # toefl=True; resto "Próximamente"

class ExamListOut(BaseModel):
    exams: list[ExamMeta] = []

class ExamQuestionOut(BaseModel):
    id: int
    exam: str
    section: str
    task_type: str
    payload: dict   # estructura según task_type (ver modelo ExamQuestion)
    source: str = "ai"
    difficulty: str | None = None

class ExamQuestionSetOut(BaseModel):
    """Set de una pregunta por cada tarea — usado por la simulación real."""
    questions: list[ExamQuestionOut] = []

class ExamAttemptCreateIn(BaseModel):
    mode: str                       # practice | simulation
    exam: str = "toefl"
    section: str = "writing"
    time_limit_seconds: int | None = None

class ExamAttemptOut(BaseModel):
    id: int
    exam: str
    section: str
    mode: str
    time_limit_seconds: int | None = None
    section_band: float | None = None
    cefr: str | None = None

class ExamGradeTaskIn(BaseModel):
    question_id: int | None = None
    task_type: str                  # build_sentence | email | academic_discussion
    user_response: str = ""         # ensayo (email/discussion)
    # build_sentence: orden elegido por el usuario, una lista de palabras por frase
    sentence_orders: list[list[str]] = []

class ExamTaskResultOut(BaseModel):
    id: int
    task_type: str
    raw_score: float | None = None
    band: float | None = None
    evaluation: dict = {}           # JSON de Groq (ensayo) o resultado determinista
    user_response: str = ""
    metrics: WritingMetricsOut | None = None  # solo email/academic_discussion; None en build_sentence

class ExamFinalizeOut(BaseModel):
    attempt_id: int
    section_band: float | None = None  # banda estimada 1.0–6.0
    cefr: str | None = None
    estimated: bool = True          # la banda de sección es estimada, no oficial ETS
    results: list[ExamTaskResultOut] = []

class ExamAttemptDetailOut(BaseModel):
    attempt: ExamAttemptOut
    results: list[ExamTaskResultOut] = []
    created_at: datetime | None = None
    submitted_at: datetime | None = None

class ExamHistoryItem(BaseModel):
    id: int
    exam: str
    section: str
    mode: str
    section_band: float | None = None
    cefr: str | None = None
    created_at: datetime
    submitted_at: datetime | None = None
    metrics: WritingMetricsOut | None = None  # agregado de las tareas de ensayo del intento

class ExamHistoryOut(BaseModel):
    attempts: list[ExamHistoryItem] = []
