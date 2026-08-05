"""
Banco de 100 temas para el ejercicio "Escribir un texto" del repaso.

No usa IA ni base de datos: es una lista estática. El tema solo sirve para que el
usuario sepa DE QUÉ escribir; la evaluación no juzga el contenido del tema, sino
el uso del vocabulario objetivo (ver services/vocab_writing.py y api/vocab_writing.py).

Cada tema:
    id       int    estable, para poder repetir el mismo tema si se quiere
    area     str    agrupador en español (se muestra como etiqueta)
    title    str    el prompt, en inglés (el texto se escribe en inglés)
    hint_es  str    una línea en español: por dónde empezar
"""

import random
from typing import Any

TOPICS: list[dict[str, Any]] = [
    # ── Ingeniería mecánica / industrial ────────────────────────────────────
    {"id": 1, "area": "Ingeniería", "title": "Describe a mechanical failure you diagnosed and how you fixed it.",
     "hint_es": "Qué falló, cómo lo detectaste, qué probaste y qué aprendiste."},
    {"id": 2, "area": "Ingeniería", "title": "Explain how a preventive maintenance plan is built for a production line.",
     "hint_es": "Frecuencias, repuestos críticos, paradas programadas y costos."},
    {"id": 3, "area": "Ingeniería", "title": "Compare welding and bolting for joining two steel structures.",
     "hint_es": "Resistencia, costo, inspección y facilidad de desmontaje."},
    {"id": 4, "area": "Ingeniería", "title": "Explain to a client why a machine needs to be replaced instead of repaired.",
     "hint_es": "Argumenta con costos, disponibilidad y seguridad."},
    {"id": 5, "area": "Ingeniería", "title": "Describe the safety risks of a workshop and how you would reduce them.",
     "hint_es": "Riesgos concretos, controles y responsabilidad del equipo."},
    {"id": 6, "area": "Ingeniería", "title": "Explain how a heat exchanger works to someone with no technical background.",
     "hint_es": "Analogías sencillas, sin fórmulas."},
    {"id": 7, "area": "Ingeniería", "title": "Write a report about a project that went over budget and why.",
     "hint_es": "Causas, decisiones tomadas y qué harías distinto."},
    {"id": 8, "area": "Ingeniería", "title": "Argue whether automation always improves a manufacturing process.",
     "hint_es": "Ventajas, límites, impacto en las personas."},
    {"id": 9, "area": "Ingeniería", "title": "Describe the process of choosing a material for a part under high stress.",
     "hint_es": "Criterios, ensayos, compromisos entre peso y resistencia."},
    {"id": 10, "area": "Ingeniería", "title": "Explain what a tolerance is and why it matters in manufacturing.",
     "hint_es": "Ejemplo real de una pieza que no ensambló."},
    {"id": 11, "area": "Ingeniería", "title": "Describe how you would investigate an unexpected vibration in a pump.",
     "hint_es": "Hipótesis, mediciones, orden de las pruebas."},
    {"id": 12, "area": "Ingeniería", "title": "Explain the trade-offs between a cheap design and a durable one.",
     "hint_es": "Costo inicial vs. costo de ciclo de vida."},
    {"id": 13, "area": "Ingeniería", "title": "Write instructions for a technician who has never used a specific tool.",
     "hint_es": "Pasos claros, advertencias, qué hacer si algo sale mal."},
    {"id": 14, "area": "Ingeniería", "title": "Describe a time when a simulation did not match the real behavior.",
     "hint_es": "Supuestos del modelo y qué faltaba en él."},
    {"id": 15, "area": "Ingeniería", "title": "Explain why redundancy is used in critical systems.",
     "hint_es": "Ejemplos: aviación, hospitales, plantas de energía."},

    # ── Tecnología / software ───────────────────────────────────────────────
    {"id": 16, "area": "Tecnología", "title": "Explain a bug you spent hours chasing and how you finally found it.",
     "hint_es": "Síntoma, pistas falsas y el momento en que hizo clic."},
    {"id": 17, "area": "Tecnología", "title": "Argue whether artificial intelligence will replace junior engineers.",
     "hint_es": "Toma una postura y defiéndela con ejemplos."},
    {"id": 18, "area": "Tecnología", "title": "Describe an app you use every day and what you would improve in it.",
     "hint_es": "Qué te molesta, qué cambiarías y por qué."},
    {"id": 19, "area": "Tecnología", "title": "Explain why backups matter, using a story of data you once lost.",
     "hint_es": "Qué pasó, qué costó recuperarlo, qué cambiaste después."},
    {"id": 20, "area": "Tecnología", "title": "Compare working with a slow but reliable tool and a fast but buggy one.",
     "hint_es": "Cuál eliges y en qué contexto."},
    {"id": 21, "area": "Tecnología", "title": "Describe how you would teach a colleague to use a new software tool.",
     "hint_es": "Por dónde empezar y qué errores anticipar."},
    {"id": 22, "area": "Tecnología", "title": "Explain the risks of sharing personal data with online services.",
     "hint_es": "Casos concretos y hábitos de protección."},
    {"id": 23, "area": "Tecnología", "title": "Write about a technology that disappointed you after the hype.",
     "hint_es": "Qué prometía, qué entregó y por qué falló."},
    {"id": 24, "area": "Tecnología", "title": "Describe how remote work changed the way teams communicate.",
     "hint_es": "Lo que se ganó, lo que se perdió."},
    {"id": 25, "area": "Tecnología", "title": "Explain what makes documentation actually useful.",
     "hint_es": "Ejemplos de documentación buena y mala que hayas leído."},

    # ── Diseño ──────────────────────────────────────────────────────────────
    {"id": 26, "area": "Diseño", "title": "Describe an everyday object that is badly designed and redesign it.",
     "hint_es": "Qué falla, para quién, y tu propuesta."},
    {"id": 27, "area": "Diseño", "title": "Explain why simple designs are usually harder to achieve than complex ones.",
     "hint_es": "Qué hay que quitar y qué hay que decidir."},
    {"id": 28, "area": "Diseño", "title": "Compare form and function: which one should win when they conflict?",
     "hint_es": "Da un ejemplo donde la estética costó usabilidad."},
    {"id": 29, "area": "Diseño", "title": "Describe how you would design a workspace for deep concentration.",
     "hint_es": "Luz, ruido, mobiliario, interrupciones."},
    {"id": 30, "area": "Diseño", "title": "Explain how color and typography change the way a message is received.",
     "hint_es": "Ejemplos de marcas o señales que conozcas."},
    {"id": 31, "area": "Diseño", "title": "Write about a product whose packaging annoyed you.",
     "hint_es": "Qué costó abrirlo, qué se desperdició, cómo lo harías."},
    {"id": 32, "area": "Diseño", "title": "Describe how you would make a public space accessible to everyone.",
     "hint_es": "Rampas, señalización, altura, contraste, descanso."},
    {"id": 33, "area": "Diseño", "title": "Explain the role of prototypes before committing to a final design.",
     "hint_es": "Qué preguntas responde cada prototipo."},
    {"id": 34, "area": "Diseño", "title": "Argue whether user feedback should drive every design decision.",
     "hint_es": "Cuándo escuchar al usuario y cuándo no."},
    {"id": 35, "area": "Diseño", "title": "Describe the most beautiful piece of engineering you have ever seen.",
     "hint_es": "Por qué te impresionó: proporción, función, contexto."},

    # ── Educación ───────────────────────────────────────────────────────────
    {"id": 36, "area": "Educación", "title": "Describe the best teacher you ever had and what made them different.",
     "hint_es": "Métodos, actitud, un momento concreto."},
    {"id": 37, "area": "Educación", "title": "Explain how you would teach a difficult subject to a struggling student.",
     "hint_es": "Diagnóstico, ejemplos, ritmo, refuerzo."},
    {"id": 38, "area": "Educación", "title": "Argue whether exams measure real understanding.",
     "hint_es": "Ventajas, límites y alternativas."},
    {"id": 39, "area": "Educación", "title": "Describe how you learn best and how you discovered it.",
     "hint_es": "Prueba y error, hábitos, herramientas."},
    {"id": 40, "area": "Educación", "title": "Explain why learning a language as an adult is different from learning as a child.",
     "hint_es": "Ventajas del adulto, obstáculos, disciplina."},
    {"id": 41, "area": "Educación", "title": "Write about a subject you hated at school and now find useful.",
     "hint_es": "Qué cambió: tú, el contexto o el enfoque."},
    {"id": 42, "area": "Educación", "title": "Describe how universities should prepare students for real jobs.",
     "hint_es": "Brechas concretas entre la carrera y el trabajo."},
    {"id": 43, "area": "Educación", "title": "Explain the difference between memorizing and truly understanding.",
     "hint_es": "Un ejemplo donde memorizaste y no entendiste."},
    {"id": 44, "area": "Educación", "title": "Argue whether online courses can replace classroom learning.",
     "hint_es": "Disciplina, interacción, costo, acceso."},
    {"id": 45, "area": "Educación", "title": "Describe a skill you taught yourself without any formal class.",
     "hint_es": "Recursos, obstáculos y cómo supiste que ya lo dominabas."},

    # ── Trabajo / carrera ───────────────────────────────────────────────────
    {"id": 46, "area": "Trabajo", "title": "Write an email to your manager explaining a delay in a project.",
     "hint_es": "Causa, impacto, plan de recuperación, tono profesional."},
    {"id": 47, "area": "Trabajo", "title": "Describe a disagreement with a colleague and how you handled it.",
     "hint_es": "Postura de cada uno, cómo se resolvió."},
    {"id": 48, "area": "Trabajo", "title": "Explain what you look for when hiring someone for your team.",
     "hint_es": "Habilidades, actitud, señales de alerta."},
    {"id": 49, "area": "Trabajo", "title": "Describe your ideal work routine and why it works for you.",
     "hint_es": "Horarios, pausas, bloques de concentración."},
    {"id": 50, "area": "Trabajo", "title": "Write about a job interview that went badly and what you learned.",
     "hint_es": "Qué preguntaron, dónde te trabaste, cómo lo corregirías."},
    {"id": 51, "area": "Trabajo", "title": "Explain how you would negotiate a salary increase.",
     "hint_es": "Argumentos, evidencia, momento adecuado."},
    {"id": 52, "area": "Trabajo", "title": "Describe a meeting that wasted everyone's time and how to fix it.",
     "hint_es": "Agenda, participantes, decisiones, seguimiento."},
    {"id": 53, "area": "Trabajo", "title": "Argue whether it is better to be a specialist or a generalist.",
     "hint_es": "Toma postura según industria y etapa de carrera."},
    {"id": 54, "area": "Trabajo", "title": "Describe how you prioritize when everything is urgent.",
     "hint_es": "Criterios, comunicación y qué dejas fuera."},
    {"id": 55, "area": "Trabajo", "title": "Write about the moment you realized you wanted to change careers.",
     "hint_es": "Qué lo disparó y qué pasos diste."},
    {"id": 56, "area": "Trabajo", "title": "Explain how to give critical feedback without discouraging someone.",
     "hint_es": "Estructura, ejemplos concretos, seguimiento."},
    {"id": 57, "area": "Trabajo", "title": "Describe the culture of a company you would never work for.",
     "hint_es": "Señales, valores y consecuencias."},

    # ── Aeropuerto / viajes ─────────────────────────────────────────────────
    {"id": 58, "area": "Aeropuerto", "title": "Describe a time your flight was delayed or cancelled and what you did.",
     "hint_es": "Trámites, alternativas, cómo lo resolviste."},
    {"id": 59, "area": "Aeropuerto", "title": "Explain to a first-time traveler how to get through airport security.",
     "hint_es": "Documentos, líquidos, electrónicos, tiempos."},
    {"id": 60, "area": "Aeropuerto", "title": "Write a complaint about lost luggage and ask for compensation.",
     "hint_es": "Hechos, fechas, daño causado, petición clara."},
    {"id": 61, "area": "Aeropuerto", "title": "Describe the most stressful connection you have ever had.",
     "hint_es": "Tiempo, distancia, idioma, decisiones rápidas."},
    {"id": 62, "area": "Aeropuerto", "title": "Explain how you would help a tourist who is lost in a terminal.",
     "hint_es": "Direcciones, referencias visuales, a quién acudir."},
    {"id": 63, "area": "Aeropuerto", "title": "Compare traveling light with checking a large suitcase.",
     "hint_es": "Costo, tiempo, riesgo, comodidad."},
    {"id": 64, "area": "Viajes", "title": "Describe a trip that did not go as planned.",
     "hint_es": "Qué salió mal y qué rescataste de la experiencia."},
    {"id": 65, "area": "Viajes", "title": "Explain how traveling changed the way you see your own country.",
     "hint_es": "Comparaciones concretas, no clichés."},
    {"id": 66, "area": "Viajes", "title": "Write a review of a hotel that did not meet your expectations.",
     "hint_es": "Hechos específicos, tono firme pero educado."},
    {"id": 67, "area": "Viajes", "title": "Describe how you would spend 24 hours in a city you love.",
     "hint_es": "Itinerario realista, con horarios y transporte."},
    {"id": 68, "area": "Viajes", "title": "Explain the hardest part of communicating in a foreign language abroad.",
     "hint_es": "Situación real, malentendido, cómo saliste."},

    # ── Negocios / dinero ───────────────────────────────────────────────────
    {"id": 69, "area": "Negocios", "title": "Describe a business idea you would start with limited money.",
     "hint_es": "Cliente, problema, costos, primer paso."},
    {"id": 70, "area": "Negocios", "title": "Explain why a small company can beat a large one in some markets.",
     "hint_es": "Velocidad, cercanía al cliente, nicho."},
    {"id": 71, "area": "Negocios", "title": "Write a proposal asking a client to approve extra work.",
     "hint_es": "Alcance, justificación, precio, beneficio."},
    {"id": 72, "area": "Negocios", "title": "Describe the worst customer service experience you have had.",
     "hint_es": "Qué falló en el proceso, no solo en la persona."},
    {"id": 73, "area": "Negocios", "title": "Explain how you decide whether something expensive is worth buying.",
     "hint_es": "Criterios, uso esperado, costo por uso."},
    {"id": 74, "area": "Negocios", "title": "Argue whether companies should be responsible for their environmental impact.",
     "hint_es": "Postura clara, ejemplos, contraargumento."},
    {"id": 75, "area": "Negocios", "title": "Describe how you would explain a technical product to a non-technical buyer.",
     "hint_es": "Beneficio antes que especificación."},
    {"id": 76, "area": "Negocios", "title": "Explain what you would do if a supplier failed you at the worst moment.",
     "hint_es": "Plan B, comunicación y relación a futuro."},

    # ── Vida diaria / ciudad ────────────────────────────────────────────────
    {"id": 77, "area": "Vida diaria", "title": "Describe your city to someone who has never been there.",
     "hint_es": "Clima, gente, transporte, qué sorprende."},
    {"id": 78, "area": "Vida diaria", "title": "Explain how public transport could be improved where you live.",
     "hint_es": "Problemas concretos y soluciones realistas."},
    {"id": 79, "area": "Vida diaria", "title": "Write about a habit you tried to build and failed.",
     "hint_es": "Por qué falló y qué cambiarías del sistema."},
    {"id": 80, "area": "Vida diaria", "title": "Describe a conversation that changed your mind about something.",
     "hint_es": "Qué pensabas antes y qué te movió."},
    {"id": 81, "area": "Vida diaria", "title": "Explain how you deal with a neighbor who makes too much noise.",
     "hint_es": "Enfoque, tono, escalamiento si no funciona."},
    {"id": 82, "area": "Vida diaria", "title": "Describe the last thing you repaired instead of throwing away.",
     "hint_es": "Proceso, herramientas y por qué valió la pena."},
    {"id": 83, "area": "Vida diaria", "title": "Explain what you would do with an unexpected free week.",
     "hint_es": "Prioridades reales, no la respuesta ideal."},
    {"id": 84, "area": "Vida diaria", "title": "Write about a family tradition and what it means to you.",
     "hint_es": "Origen, cómo se hace, por qué importa."},

    # ── Salud / bienestar ───────────────────────────────────────────────────
    {"id": 85, "area": "Salud", "title": "Describe how you recover after a very demanding week.",
     "hint_es": "Señales de agotamiento y qué te funciona."},
    {"id": 86, "area": "Salud", "title": "Explain why sleep is underestimated by people who work a lot.",
     "hint_es": "Efectos en el rendimiento y el estado de ánimo."},
    {"id": 87, "area": "Salud", "title": "Describe an injury or illness and how it changed your routine.",
     "hint_es": "Adaptaciones, límites y recuperación."},
    {"id": 88, "area": "Salud", "title": "Argue whether working from home is healthier than working at an office.",
     "hint_es": "Movimiento, aislamiento, límites entre casa y trabajo."},
    {"id": 89, "area": "Salud", "title": "Explain how you would convince a friend to start exercising.",
     "hint_es": "Argumentos que le importen a esa persona."},
    {"id": 90, "area": "Salud", "title": "Describe how stress shows up in your body and what you do about it.",
     "hint_es": "Señales tempranas y estrategias."},

    # ── Medio ambiente / energía ────────────────────────────────────────────
    {"id": 91, "area": "Medio ambiente", "title": "Explain whether electric cars are really better for the planet.",
     "hint_es": "Fabricación, energía usada, ciclo de vida."},
    {"id": 92, "area": "Medio ambiente", "title": "Describe how your daily habits affect the environment.",
     "hint_es": "Consumo real, sin culpa ni exageración."},
    {"id": 93, "area": "Medio ambiente", "title": "Argue who should pay for the energy transition.",
     "hint_es": "Gobiernos, empresas, consumidores: postura clara."},
    {"id": 94, "area": "Medio ambiente", "title": "Explain how water is wasted in a typical building and how to prevent it.",
     "hint_es": "Puntos de pérdida y medidas concretas."},
    {"id": 95, "area": "Medio ambiente", "title": "Describe a natural place that impressed you and why it must be protected.",
     "hint_es": "Detalle sensorial y amenaza real."},
    {"id": 96, "area": "Medio ambiente", "title": "Explain the difference between recycling and actually reducing waste.",
     "hint_es": "Por qué reciclar no basta."},

    # ── Cultura / opinión ───────────────────────────────────────────────────
    {"id": 97, "area": "Cultura", "title": "Describe a film or book that changed how you think.",
     "hint_es": "Idea central y qué te movió de tu lugar."},
    {"id": 98, "area": "Cultura", "title": "Explain a custom from your country that foreigners find strange.",
     "hint_es": "Origen, cómo funciona y qué confunde."},
    {"id": 99, "area": "Cultura", "title": "Argue whether social media makes people more or less connected.",
     "hint_es": "Postura, evidencia personal, contraargumento."},
    {"id": 100, "area": "Cultura", "title": "Describe an opinion you held strongly and later abandoned.",
     "hint_es": "Qué te convenció y qué costó cambiar de idea."},
]

_BY_ID = {t["id"]: t for t in TOPICS}


def all_topics() -> list[dict[str, Any]]:
    """Los 100 temas, en orden estable."""
    return TOPICS


def get_topic(topic_id: int) -> dict[str, Any] | None:
    return _BY_ID.get(topic_id)


def random_topic(exclude_id: int | None = None) -> dict[str, Any]:
    """Un tema al azar, evitando repetir el que ya se estaba mostrando."""
    pool = [t for t in TOPICS if t["id"] != exclude_id] or TOPICS
    return random.choice(pool)
