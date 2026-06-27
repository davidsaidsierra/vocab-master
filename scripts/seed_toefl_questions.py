"""
Siembra el banco ExamQuestion con las preguntas de muestra OFICIALES del TOEFL
iBT Writing 2026 (de los PDFs de referencia):

  - email                escenario "Professor Kim" (sociología).
  - academic_discussion  "reviving extinct species" (Juan / Alice).
  - build_sentence       set de 10 frases: las 3 muestras oficiales + 7 originales
                         que cubren los grammar points del task.

Re-ejecutable: borra solo las filas source="seed" y vuelve a insertarlas. No toca
preguntas generadas por IA (source="ai") ni los intentos.

Usage:
    python scripts/seed_toefl_questions.py
"""

import json
import random
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

from database.connection import SessionLocal, init_db
from database.models import ExamQuestion


# ── Build a Sentence — 10 frases (3 oficiales + 7 originales) ────────────────
# Cada item: context (situación + stem fijo si aplica) y answer (la porción que
# el usuario ordena). El script genera `scrambled` barajando las palabras.
BUILD_SENTENCE = [
    # Oficiales (toeflresources)
    {"context": "Did Jason answer your questions?  No, ___",
     "answer": "he has not responded to my email"},
    {"context": "You just missed the bus to campus.",
     "answer": "can you tell me when the next one arrives"},
    {"context": "I still don't understand the requirements of the assignment.",
     "answer": "the email that the professor sent explains everything"},
    # Originales (cubren los grammar points del task)
    {"context": "Are you coming to the study group tonight?",
     "answer": "I will not be able to make it"},
    {"context": "She was shocked by the state of the lab.",
     "answer": "never had she seen such a mess"},
    {"context": "I can't find my keys anywhere.",
     "answer": "where did you put them this morning"},
    {"context": "He left the meeting without saying a word.",
     "answer": "I wonder why he left so early"},
    {"context": "You seem confused about the new software.",
     "answer": "could you tell me how this works"},
    {"context": "That novel kept me up all night.",
     "answer": "the book that I borrowed was fascinating"},
    {"context": "His reaction surprised everyone.",
     "answer": "not only did he apologize but he also paid"},
]


def _build_sentence_payload(seed: int = 42) -> dict:
    rng = random.Random(seed)
    sentences = []
    for item in BUILD_SENTENCE:
        words = item["answer"].split()
        scrambled = words[:]
        # baraja asegurando que NO quede en el orden correcto
        while scrambled == words and len(words) > 1:
            rng.shuffle(scrambled)
        sentences.append({
            "context": item["context"],
            "answer": item["answer"],
            "scrambled": scrambled,
            "has_extra": False,
        })
    return {"sentences": sentences}


# ── Write an Email — escenario oficial "Professor Kim" ──────────────────────
EMAIL_PAYLOAD = {
    "scenario": (
        "You are a student in Professor Kim's sociology class. Last week, you "
        "submitted your midterm essay via the class website. Yesterday, you "
        "checked your grade and were surprised to see it was much lower than you "
        "expected. When you opened the file that was graded, you realized it was "
        "an older draft of your essay, not the final version. You still have the "
        "correct final version saved on your computer. Write an email to Professor Kim."
    ),
    "requirements": [
        "Clearly explain the problem and how you noticed that the wrong version was graded.",
        "Ask if you can send the final version and have your grade changed.",
        "Ask when you can expect a reply.",
    ],
}


# ── Academic Discussion — tema oficial "reviving extinct species" ───────────
DISCUSSION_PAYLOAD = {
    "professor_prompt": (
        "Next, we'll be discussing the possibility of reviving extinct species. As "
        "new developments in genetic engineering are made, it seems more likely that "
        "at some point in the future, species that have been extinct for a long time "
        "might be revived and reintroduced into nature. What do you think? Should "
        "scientists bring back extinct species? Why or why not?"
    ),
    "student_responses": [
        {"name": "Juan", "text": (
            "I believe that scientists should be encouraged to bring back species, "
            "even if they have been extinct for a long time. Keep in mind that humans "
            "are the main reason why certain species of plants and animals no longer "
            "exist, so we almost have a responsibility to revive them if possible. "
            "Doing so could create richer and more vibrant ecosystems all over the planet."
        )},
        {"name": "Alice", "text": (
            "Personally, I'm concerned about the possible side effects of this "
            "possibility, so I don't support it. We don't know what will happen if a "
            "particular species is reintroduced, even in its original habitat. In fact, "
            "it could actually cause harm to the populations of other species. "
            "Therefore, I think the potential risks could outweigh the benefits."
        )},
    ],
}


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        deleted = db.query(ExamQuestion).filter(ExamQuestion.source == "seed").delete()
        rows = [
            ExamQuestion(
                exam="toefl", section="writing", task_type="build_sentence",
                payload=json.dumps(_build_sentence_payload(), ensure_ascii=False),
                source="seed", difficulty="medium",
            ),
            ExamQuestion(
                exam="toefl", section="writing", task_type="email",
                payload=json.dumps(EMAIL_PAYLOAD, ensure_ascii=False),
                source="seed", difficulty="medium",
            ),
            ExamQuestion(
                exam="toefl", section="writing", task_type="academic_discussion",
                payload=json.dumps(DISCUSSION_PAYLOAD, ensure_ascii=False),
                source="seed", difficulty="medium",
            ),
        ]
        db.add_all(rows)
        db.commit()
        print(f"Seed listo: {deleted} seed antiguas borradas, {len(rows)} insertadas.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    seed()
