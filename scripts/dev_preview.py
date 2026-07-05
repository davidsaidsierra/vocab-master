"""
Runner de PREVIEW local aislado (no toca Neon).

Levanta la app contra una SQLite de demo con unas palabras sembradas de varios
niveles CEFR, en modo local abierto (sin login), para revisar cambios de
frontend visualmente. NO es para producción.

Uso:  .venv\\Scripts\\python.exe scripts\\dev_preview.py   (o vía preview_start)
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Config ANTES de importar cualquier módulo que lea el entorno.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(ROOT, "data", "preview_demo.db")
os.environ["ALLOW_OPEN_MODE"] = "1"
os.environ.pop("JWT_SECRET", None)
os.environ.pop("API_KEY", None)

import json
from datetime import datetime, timedelta, timezone

from database.connection import init_db, SessionLocal
from database.models import Word, Category, WritingChallenge, ExamAttempt, ExamTaskResult
from services import cefr

# Historial de Writing Challenge: score subiendo, errores bajando (para ver el
# progreso en el dashboard). `metrics=None` a propósito -> prueba el backfill
# lazy de GET /writing/history (se calcula solo, sin IA, al leer).
_WRITING_HISTORY = [
    (9, "Present Simple", 40, 12, 6,
     "I has a probelm with my job becuase my boss dont like when I arrive late everyday."),
    (7, "Past Simple", 48, 10, 4,
     "Yesterday I go to the store and buyed some things for my house, it was a busy day."),
    (5, "Present Perfect", 55, 8, 3,
     "I have finish my homework already but I still need to practice more vocabulary everyday."),
    (3, "Comparatives", 62, 6, 2,
     "This project is more difficult than the previous one, but I am learning a lot from it."),
    (2, "Conditionals", 70, 4, 1,
     "If I had more time, I would practice writing every single day to improve my fluency."),
    (0, "Modal Verbs", 75, 3, 1,
     "I should have started this earlier, but I am determined to achieve significant progress now."),
]

# Historial de examenes TOEFL: banda subiendo con el tiempo.
_EXAM_HISTORY = [
    (8, 2.5, "Environmental science is important, but people dont allways understand how much plastic affect the ocean and animals."),
    (5, 3.0, "I believe that governments should take more responsibility for pollution, since individual actions alone are not enough to solve it."),
    (2, 3.5, "Although individual behavior matters, I contend that structural policies create the most significant and lasting impact on this issue."),
]


def _writing_correction(text: str, score: int, n_grammar: int, n_spelling: int) -> dict:
    errors = [{"original": "x", "fix": "y", "type": "grammar", "explanation_es": "err"} for _ in range(n_grammar)]
    errors += [{"original": "x", "fix": "y", "type": "spelling", "explanation_es": "err"} for _ in range(n_spelling)]
    return {
        "corrected": text,
        "errors": errors,
        "words_used_correctly": [],
        "grammar_used_correctly": True,
        "grammar_topic_usage": {"used": "yes", "variant_used": "", "explanation_es": ""},
        "grammar_feedback_es": "",
        "encouragement_es": "¡Sigue así!",
        "score": score,
        "vocabulary_suggestions": [],
    }


def _exam_evaluation(text: str, band_0_5: float) -> dict:
    return {
        "band": band_0_5,
        "criteria": {},
        "requirements_met": [],
        "corrected": text,
        "errors": [
            {"original": "x", "fix": "y", "type": "grammar", "explanation_es": "err"},
            {"original": "x", "fix": "y", "type": "spelling", "explanation_es": "err"},
        ],
        "word_count": len(text.split()),
        "feedback_es": "",
        "encouragement_es": "",
        "vocabulary_suggestions": [],
    }


def _seed_writing_and_exams() -> None:
    with SessionLocal() as db:
        if db.query(WritingChallenge).count() > 0 or db.query(ExamAttempt).count() > 0:
            return
        now = datetime.now(timezone.utc)
        for days_ago, topic, score, n_gram, n_spell, text in _WRITING_HISTORY:
            created = now - timedelta(days=days_ago)
            db.add(WritingChallenge(
                grammar_topic=topic,
                target_words=json.dumps([]),
                user_text=text,
                correction=json.dumps(_writing_correction(text, score, n_gram, n_spell), ensure_ascii=False),
                words_used_correctly=json.dumps([]),
                grammar_used_correctly=1,
                metrics=None,  # a proposito: prueba el lazy backfill
                created_at=created,
            ))
        for days_ago, band, text in _EXAM_HISTORY:
            created = now - timedelta(days=days_ago)
            attempt = ExamAttempt(
                exam="toefl", section="writing", mode="practice",
                section_band=band, started_at=created, submitted_at=created,
                created_at=created,
            )
            db.add(attempt)
            db.flush()
            band_0_5 = round((band - 1.0) / 5.0 * 5, 1)  # aprox inverso de _norm_to_band
            db.add(ExamTaskResult(
                attempt_id=attempt.id,
                task_type="email",
                user_response=text,
                evaluation=json.dumps(_exam_evaluation(text, band_0_5), ensure_ascii=False),
                raw_score=band_0_5,
                band=band,
                metrics=None,  # a proposito: prueba el lazy backfill
                created_at=created,
            ))
        db.commit()
        print(f"Sembrados {len(_WRITING_HISTORY)} writing challenges y {len(_EXAM_HISTORY)} intentos de examen (sin metrics, para probar el backfill lazy).")

# word, translation, category, example, synonyms (algunos sin sinónimos para
# probar también el botón "Generar sinónimos faltantes").
_DEMO = [
    ("happy", "feliz", "engineering", None, ["glad", "joyful", "cheerful", "content"]),
    ("water", "agua", None, None, []),
    ("achieve", "lograr", None, None, ["accomplish", "attain", "reach", "fulfill"]),
    ("thorough", "minucioso", None, None, ["meticulous", "exhaustive", "careful"]),
    ("bearing", "rodamiento", "engineering", "a ball bearing reduces friction", None),
    ("leverage", "apalancamiento", "engineering", None, None),
    ("cumbersome", "engorroso", None, "a cumbersome approval process", ["unwieldy", "clunky", "awkward"]),
    ("ubiquitous", "omnipresente", None, None, ["omnipresent", "pervasive", "widespread"]),
    ("serendipity", "serendipia", None, None, None),
    ("meticulous", "meticuloso", None, None, ["thorough", "precise", "fastidious"]),
]

# Palabras "viejas" (agregadas antes de la función de niveles): sin cefr_level,
# para poder probar el botón "Actualizar niveles". Una es una frase → no resoluble.
_LEGACY = [
    ("mindset", "mentalidad"),
    ("resilience", "resiliencia"),
    ("give up", "rendirse"),  # frase → cefrpy no le da nivel
]


def _seed() -> None:
    init_db()
    with SessionLocal() as db:
        if db.query(Word).count() == 0:
            cat = Category(name="Engineering", color="#0071e3", icon="🛠️")
            db.add(cat)
            db.flush()
            cat_id = cat.id
            for word, tr, cat_name, example, syns in _DEMO:
                db.add(Word(
                    word=word,
                    translation=tr,
                    example=example,
                    category_id=cat_id if cat_name == "engineering" else None,
                    cefr_level=cefr.level_for_word(word),
                    synonyms=json.dumps(syns) if syns is not None else None,
                    mastery_level=20.0,
                ))
            for word, tr in _LEGACY:
                db.add(Word(word=word, translation=tr, cefr_level=None, mastery_level=0.0))
            db.commit()
            print(f"Sembradas {len(_DEMO) + len(_LEGACY)} palabras de demo.")
    _seed_writing_and_exams()


if __name__ == "__main__":
    _seed()
    import uvicorn
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)
