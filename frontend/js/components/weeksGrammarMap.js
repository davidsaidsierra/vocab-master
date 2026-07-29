// ── Mapeo WEEKS → Grammar KB ─────────────────────────────────
//
// Empareja cada título de tema de `WEEKS` (englishClass.js, la clase semanal
// real del usuario) con el slug del GrammarTopic del KB (244 secciones) más
// parecido. Esto permite que el "🎲 Cambiar tema" (aleatorio desde WEEKS)
// también dispare el flujo V2 (KB-grounded: reference_quote + example_en),
// en vez de caer siempre al V1 "delgado" — sin esto, V1 era la ruta POR
// DEFECTO porque el shuffle nunca seteaba grammar_topic_slug.
//
// Mapeo hecho a mano (WEEKS tiene solo 8 temas fijos — un matching difuso por
// IA no se justifica a esta escala; ver auditoría en PHASE_1_PLAN.md § Fase 2).
// Los temas sin match razonable en el KB se dejan SIN mapear a propósito: es
// mejor no citar (`reference_quote`) que citar contenido que no corresponde.
export const WEEKS_GRAMMAR_MAP = {
    'Modifying Comparatives & Superlatives': 'section-175-modifying-comparatives',
    'Advanced Comparative Structures': 'section-170-the-the-comparatives-cause-effect',
    'Narrative Tenses': 'section-057-narrative-tenses-past-simple-continuous-perfect',
    'Future in the Past': 'section-091-future-in-the-past',
    'Review of Future Tenses': 'section-197-future-perfect-simple-continuous',
    'Inversion with Negative Adverbials': 'section-132-inversion-after-negative-adverbials-formal',
    // Sin match razonable en el KB (queda como fallback V1 real):
    //   'Nominal Clauses' — familia de 5 subtipos, ninguna sección del KB los cubre juntos.
    //   'Near Future Idiomatic Expressions' — "be about to / on the verge of" no existe en el KB.
};

export function slugForWeeksTopic(topic) {
    if (!topic || !topic.title) return null;
    return WEEKS_GRAMMAR_MAP[topic.title] || null;
}
