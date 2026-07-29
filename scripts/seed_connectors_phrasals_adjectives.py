"""
Carga manual y puntual de 3 listas de vocabulario de alta frecuencia
(conectores, phrasal verbs, adjetivos) pedidas por el usuario, insertadas
tal cual quedarían si se agregaran una por una desde la app.

Uso: python scripts/seed_connectors_phrasals_adjectives.py
No es un importador reutilizable: es un script de una sola vez, no forma
parte del pipeline de importación normal (ver scripts/import_*.py para eso).
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from database.connection import SessionLocal
from database.models import Category, Word
from services.ai_schemas import canonical_pos

OWNER_USER_ID = 1  # davidsaidsierragonzalez@gmail.com (admin)

# (word, translation_es, example_en, cefr_level, part_of_speech, difficulty)
CONNECTORS = [
    ("and", "y", "I like tea and coffee.", "A1", "conjunction", 1),
    ("also", "también", "She speaks French. She also speaks Italian.", "A1", "adverb", 1),
    ("too", "también", "I want to go too.", "A1", "adverb", 1),
    ("as well", "también / además", "He plays guitar as well.", "A2", "adverb", 2),
    ("besides", "además", "Besides being late, he forgot the tickets.", "B1", "preposition", 2),
    ("in addition", "además", "In addition, the report needs a summary.", "B1", "phrase", 2),
    ("moreover", "además / es más", "The plan is expensive. Moreover, it's risky.", "B2", "adverb", 3),
    ("furthermore", "además / asimismo", "Furthermore, the data supports our claim.", "B2", "adverb", 3),
    ("not only... but also", "no solo... sino también", "She is not only smart but also kind.", "B2", "phrase", 3),
    ("on top of that", "y encima de eso", "It was raining, and on top of that, we got lost.", "B2", "phrase", 3),
    ("but", "pero", "I wanted to go, but I was too tired.", "A1", "conjunction", 1),
    ("however", "sin embargo", "The plan sounds good. However, it's costly.", "B1", "adverb", 2),
    ("although", "aunque", "Although it was raining, we went out.", "A2", "conjunction", 2),
    ("even though", "aunque (énfasis)", "Even though he studied hard, he failed.", "B1", "conjunction", 2),
    ("though", "aunque", "It's a good idea, though it's expensive.", "B1", "conjunction", 2),
    ("yet", "sin embargo / aun así", "It's simple, yet very effective.", "B1", "conjunction", 2),
    ("on the other hand", "por otro lado", "On the other hand, renting is cheaper.", "B1", "phrase", 2),
    ("nevertheless", "no obstante", "The risk is high. Nevertheless, we'll proceed.", "B2", "adverb", 3),
    ("nonetheless", "no obstante", "It rained all week; nonetheless, they went camping.", "C1", "adverb", 4),
    ("despite", "a pesar de", "Despite the cost, they bought the house.", "B1", "preposition", 2),
    ("in spite of", "a pesar de", "In spite of the traffic, we arrived on time.", "B1", "phrase", 2),
    ("whereas", "mientras que", "He likes tea, whereas she prefers coffee.", "B2", "conjunction", 3),
    ("while", "mientras (que)", "While I cook, you can set the table.", "A2", "conjunction", 2),
    ("then again", "por otro lado / pensándolo bien", "Then again, maybe we should wait.", "B2", "phrase", 3),
    ("that said", "dicho esto", "That said, I still think we should try.", "C1", "phrase", 4),
    ("because", "porque", "I stayed home because I was sick.", "A1", "conjunction", 1),
    ("since", "ya que / dado que", "Since it's late, let's finish tomorrow.", "A2", "conjunction", 2),
    ("as", "ya que / como", "As it was raining, we cancelled the trip.", "B1", "conjunction", 2),
    ("so", "así que", "It was late, so we went home.", "A1", "conjunction", 1),
    ("therefore", "por lo tanto", "The tests failed; therefore, we need a new plan.", "B2", "adverb", 3),
    ("thus", "así, de este modo", "The bridge collapsed, thus closing the road.", "C1", "adverb", 4),
    ("hence", "por lo tanto", "The results were poor, hence the changes.", "C1", "adverb", 4),
    ("as a result", "como resultado", "He didn't study; as a result, he failed.", "B1", "phrase", 2),
    ("consequently", "consecuentemente", "Sales dropped; consequently, prices were cut.", "B2", "adverb", 3),
    ("due to", "debido a", "The flight was delayed due to the storm.", "B1", "preposition", 2),
    ("owing to", "debido a", "Owing to the delay, we missed the connection.", "C1", "preposition", 4),
    ("for this reason", "por esta razón", "For this reason, the meeting was postponed.", "B1", "phrase", 2),
    ("that's why", "por eso", "It was raining, that's why I brought an umbrella.", "A2", "phrase", 2),
    ("first", "primero", "First, wash the vegetables.", "A1", "adverb", 1),
    ("second", "segundo", "Second, chop the onions.", "A1", "adverb", 1),
    ("next", "luego / a continuación", "Next, add the salt.", "A1", "adverb", 1),
    ("then", "entonces / luego", "Then, mix everything together.", "A1", "adverb", 1),
    ("after that", "después de eso", "After that, we went straight home.", "A2", "phrase", 2),
    ("finally", "finalmente", "Finally, we reached the summit.", "A2", "adverb", 2),
    ("meanwhile", "mientras tanto", "Meanwhile, dinner was getting cold.", "B1", "adverb", 2),
    ("in the meantime", "mientras tanto", "In the meantime, please wait here.", "B1", "phrase", 2),
    ("eventually", "con el tiempo / finalmente", "Eventually, he got used to the new job.", "B1", "adverb", 2),
    ("subsequently", "posteriormente", "The company was fined and subsequently closed.", "C1", "adverb", 4),
    ("for example", "por ejemplo", "Some fruits, for example apples, are cheap here.", "A2", "phrase", 2),
    ("for instance", "por ejemplo", "Many cities, for instance Bogotá, are very crowded.", "B1", "phrase", 2),
    ("such as", "tal como / como", "Sports such as tennis require good reflexes.", "B1", "conjunction", 2),
    ("in other words", "en otras palabras", "He refused; in other words, he said no.", "B1", "phrase", 2),
    ("actually", "en realidad", "Actually, I didn't like the movie.", "A2", "adverb", 1),
    ("in fact", "de hecho", "In fact, the meeting was cancelled.", "B1", "phrase", 2),
    ("in conclusion", "en conclusión", "In conclusion, the project was a success.", "B1", "phrase", 2),
]

PHRASAL_VERBS = [
    ("wake up", "despertarse", "I wake up at 6 a.m. every day.", "A1", 1),
    ("get up", "levantarse", "He gets up early to go to the gym.", "A1", 1),
    ("sit down", "sentarse", "Please sit down and relax.", "A1", 1),
    ("stand up", "ponerse de pie", "Everyone stood up when she entered.", "A1", 1),
    ("turn on", "encender", "Can you turn on the lights?", "A1", 1),
    ("turn off", "apagar", "Turn off the TV before you leave.", "A1", 1),
    ("look for", "buscar", "I'm looking for my keys.", "A1", 1),
    ("look at", "mirar", "Look at this photo!", "A1", 1),
    ("listen to", "escuchar", "She listens to music while working.", "A1", 1),
    ("come in", "entrar", "Please come in and sit down.", "A1", 1),
    ("go out", "salir", "We go out for dinner on Fridays.", "A1", 1),
    ("put on", "ponerse (ropa)", "Put on your jacket, it's cold.", "A1", 1),
    ("take off", "quitarse (ropa) / despegar", "Take off your shoes before entering.", "A2", 2),
    ("come back", "volver", "She will come back next week.", "A1", 1),
    ("grow up", "crecer", "He grew up in a small town.", "A2", 2),
    ("give up", "rendirse", "Don't give up, you're almost there!", "B1", 2),
    ("find out", "averiguar / descubrir", "I need to find out what happened.", "B1", 2),
    ("look after", "cuidar de", "She looks after her younger brother.", "A2", 2),
    ("look forward to", "esperar con ganas", "I'm looking forward to the trip.", "B1", 2),
    ("pick up", "recoger", "Can you pick me up at 5?", "A2", 2),
    ("drop off", "dejar (a alguien) / entregar", "I'll drop off the kids at school.", "B1", 2),
    ("fill in", "rellenar (un formulario)", "Please fill in this form.", "B1", 2),
    ("fill out", "rellenar (un formulario)", "Fill out the application before Friday.", "B1", 2),
    ("get along with", "llevarse bien con", "I get along with my coworkers.", "B1", 2),
    ("get up to", "andar haciendo (travesuras)", "What have you been getting up to lately?", "B2", 3),
    ("hang out", "pasar el rato", "We hang out at the park on weekends.", "B1", 2),
    ("check in", "registrarse (hotel/vuelo)", "We checked in at the hotel at noon.", "A2", 2),
    ("check out", "dejar el hotel / revisar", "You have to check out by 11 a.m.", "A2", 2),
    ("run out of", "quedarse sin", "We ran out of milk this morning.", "B1", 2),
    ("set up", "montar / configurar", "It took an hour to set up the tent.", "B1", 2),
    ("bring up", "mencionar / criar", "She brought up an interesting point.", "B1", 2),
    ("come up with", "idear / se le ocurrió", "He came up with a great idea.", "B1", 2),
    ("deal with", "lidiar con", "I have to deal with this problem alone.", "B1", 2),
    ("figure out", "entender / resolver", "I can't figure out how this works.", "B1", 2),
    ("get over", "superar", "It took months to get over the flu.", "B1", 2),
    ("get through", "superar / lograr pasar", "We got through the exam somehow.", "B2", 3),
    ("go through", "pasar por / atravesar", "She went through a difficult time last year.", "B1", 2),
    ("keep up with", "mantener el ritmo de", "It's hard to keep up with all the news.", "B2", 3),
    ("look into", "investigar", "The police are looking into the case.", "B1", 2),
    ("make up", "inventar / reconciliarse", "He made up an excuse for being late.", "B1", 2),
    ("point out", "señalar", "She pointed out a mistake in the report.", "B2", 3),
    ("put off", "posponer", "We had to put off the meeting.", "B1", 2),
    ("put up with", "aguantar / tolerar", "I can't put up with this noise anymore.", "B2", 3),
    ("turn out", "resultar (ser)", "The party turned out to be a lot of fun.", "B1", 2),
    ("work out", "resolver / hacer ejercicio", "I work out at the gym every morning.", "A2", 2),
    ("carry out", "llevar a cabo", "The team carried out the plan perfectly.", "B2", 3),
    ("come across", "encontrarse con / topar con", "I came across an old photo yesterday.", "B2", 3),
    ("fall through", "fracasar (un plan)", "Our vacation plans fell through.", "C1", 4),
    ("get around to", "encontrar tiempo para", "I finally got around to fixing the door.", "C1", 4),
    ("hold off", "aplazar / contener", "Let's hold off on making a decision.", "C1", 4),
    ("play down", "minimizar (importancia)", "He tried to play down the mistake.", "C1", 4),
    ("rule out", "descartar", "We can't rule out bad weather tomorrow.", "B2", 3),
    ("stem from", "derivarse de / originarse en", "Her fear of dogs stems from a childhood incident.", "C1", 4),
    ("take on", "asumir (una tarea)", "She took on extra responsibilities at work.", "B2", 3),
    ("wear off", "desaparecer (efecto)", "The painkiller's effect wore off after a few hours.", "C1", 4),
]

ADJECTIVES = [
    ("good", "bueno", "This is a good book.", "A1", 1),
    ("bad", "malo", "That was a bad decision.", "A1", 1),
    ("big", "grande", "They live in a big house.", "A1", 1),
    ("small", "pequeño", "She has a small dog.", "A1", 1),
    ("happy", "feliz", "He looks very happy today.", "A1", 1),
    ("sad", "triste", "The ending of the movie was sad.", "A1", 1),
    ("easy", "fácil", "The test was easy.", "A1", 1),
    ("difficult", "difícil", "This exercise is difficult.", "A2", 2),
    ("hard", "difícil", "It was a hard decision to make.", "A2", 2),
    ("new", "nuevo", "I bought a new phone.", "A1", 1),
    ("old", "viejo", "This is an old building.", "A1", 1),
    ("beautiful", "hermoso", "The sunset was beautiful.", "A1", 1),
    ("ugly", "feo", "I think that painting is ugly.", "A2", 2),
    ("fast", "rápido", "He's a fast runner.", "A1", 1),
    ("slow", "lento", "The internet here is very slow.", "A1", 1),
    ("hot", "caliente", "Be careful, the soup is hot.", "A1", 1),
    ("cold", "frío", "It's very cold outside today.", "A1", 1),
    ("interesting", "interesante", "That was an interesting documentary.", "A2", 2),
    ("boring", "aburrido", "The lecture was really boring.", "A2", 2),
    ("expensive", "caro", "This restaurant is too expensive.", "A2", 2),
    ("cheap", "barato", "These shoes were pretty cheap.", "A2", 2),
    ("comfortable", "cómodo", "This chair is very comfortable.", "A2", 2),
    ("convenient", "conveniente", "It's more convenient to pay online.", "B1", 2),
    ("dangerous", "peligroso", "That road is dangerous at night.", "B1", 2),
    ("safe", "seguro", "This neighborhood is very safe.", "A2", 2),
    ("reliable", "confiable", "She's a reliable coworker.", "B1", 2),
    ("successful", "exitoso", "He built a successful business.", "B1", 2),
    ("confident", "seguro de sí mismo", "She felt confident about the interview.", "B1", 2),
    ("nervous", "nervioso", "I always get nervous before exams.", "A2", 2),
    ("exhausted", "agotado", "After the trip, we were exhausted.", "B1", 2),
    ("crowded", "lleno de gente / abarrotado", "The train was crowded this morning.", "B1", 2),
    ("efficient", "eficiente", "The new system is much more efficient.", "B1", 3),
    ("effective", "eficaz", "This treatment is very effective.", "B1", 3),
    ("consistent", "consistente", "Her performance has been consistent all year.", "B2", 3),
    ("flexible", "flexible", "My job has flexible hours.", "B1", 2),
    ("ambitious", "ambicioso", "He has ambitious plans for the company.", "B2", 3),
    ("reluctant", "reacio / renuente", "She was reluctant to accept the offer.", "C1", 4),
    ("overwhelming", "abrumador", "The support from fans was overwhelming.", "B2", 3),
    ("rewarding", "gratificante", "Teaching can be a very rewarding job.", "B2", 3),
    ("frustrating", "frustrante", "It's frustrating when the internet is slow.", "B1", 2),
    ("straightforward", "sencillo / directo", "The instructions were straightforward.", "B2", 3),
    ("sustainable", "sostenible", "We need more sustainable energy sources.", "B2", 3),
    ("significant", "significativo", "There was a significant improvement in sales.", "B2", 3),
    ("comprehensive", "integral / exhaustivo", "The report gives a comprehensive overview.", "C1", 4),
    ("inevitable", "inevitable", "The delay was inevitable given the weather.", "C1", 4),
    ("ambiguous", "ambiguo", "The instructions were ambiguous.", "C1", 4),
    ("meticulous", "meticuloso", "She is meticulous about every detail.", "C1", 4),
    ("pragmatic", "pragmático", "He took a pragmatic approach to the problem.", "C2", 5),
    ("resilient", "resiliente", "Children can be remarkably resilient.", "C1", 4),
    ("subtle", "sutil", "There was a subtle change in his tone.", "C1", 4),
    ("versatile", "versátil", "This tool is extremely versatile.", "C1", 4),
]


def get_or_create_category(db, name, color, icon):
    cat = (
        db.query(Category)
        .filter(Category.user_id == OWNER_USER_ID, Category.name == name)
        .first()
    )
    if cat:
        return cat
    cat = Category(user_id=OWNER_USER_ID, name=name, color=color, icon=icon)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def word_exists(db, word_text):
    return (
        db.query(Word)
        .filter(Word.user_id == OWNER_USER_ID, Word.word == word_text)
        .first()
        is not None
    )


def insert_words(db, rows, category, pos=None):
    """`pos` fijo para todas las filas si se pasa; si no, se toma de la fila
    (CONNECTORS trae su propio part_of_speech por variar entre filas)."""
    inserted = 0
    for row in rows:
        if pos is None:
            text, translation, example, level, row_pos, difficulty = row
        else:
            text, translation, example, level, difficulty = row
            row_pos = pos
        if word_exists(db, text):
            print(f"  - skip (ya existe): {text}")
            continue
        w = Word(
            user_id=OWNER_USER_ID,
            word=text,
            translation=translation,
            example=example,
            part_of_speech=canonical_pos(row_pos),
            category_id=category.id,
            difficulty=difficulty,
            cefr_level=level,
            source="manual",
        )
        db.add(w)
        inserted += 1
    db.commit()
    return inserted


def main():
    db = SessionLocal()
    try:
        cat_connectors = get_or_create_category(db, "Connectors", "#3b82f6", "🔗")
        cat_phrasals = get_or_create_category(db, "Phrasal Verbs", "#10b981", "🧩")
        cat_adjectives = get_or_create_category(db, "Adjectives", "#f59e0b", "🎨")

        print("Insertando conectores...")
        n1 = insert_words(db, CONNECTORS, cat_connectors)
        print(f"  {n1} conectores insertados.")

        print("Insertando phrasal verbs...")
        n2 = insert_words(db, PHRASAL_VERBS, cat_phrasals, "verb")
        print(f"  {n2} phrasal verbs insertados.")

        print("Insertando adjetivos...")
        n3 = insert_words(db, ADJECTIVES, cat_adjectives, "adjective")
        print(f"  {n3} adjetivos insertados.")

        print(f"\nTotal insertado: {n1 + n2 + n3}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
