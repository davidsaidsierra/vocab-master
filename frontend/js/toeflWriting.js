// ── TOEFL Writing 2026 — datos estáticos (sin IA) ───────────
// Metadatos de las 3 tareas, conectores C1 por función y templates por tarea.
// Se usan en el modo "Practicar" como pistas. Fuente: rúbricas oficiales ETS +
// guías de toeflresources (PDFs de referencia del proyecto).

export const TASK_META = {
    build_sentence: {
        key: 'build_sentence',
        label: 'Build a Sentence',
        icon: '🧩',
        order: 1,
        time_min: 7,
        blurb: 'Ordena 10 frases (5–7 palabras). 1 punto por frase perfecta, 0 si hay cualquier error. Sin IA.',
        target_words: 0,
    },
    email: {
        key: 'email',
        label: 'Write an Email',
        icon: '✉️',
        order: 2,
        time_min: 7,
        words_hint: '130–140 palabras',
        blurb: 'Escribe un email respondiendo a un escenario e incluye los 3 elementos pedidos. Sé muy cortés.',
        target_words: 140,
    },
    academic_discussion: {
        key: 'academic_discussion',
        label: 'Write for an Academic Discussion',
        icon: '💬',
        order: 3,
        time_min: 10,
        words_hint: '120–130 palabras',
        blurb: 'Responde a la pregunta del profesor y aporta al debate con una opinión, un ejemplo y elaboración.',
        target_words: 130,
    },
};

export const TASK_ORDER = ['build_sentence', 'email', 'academic_discussion'];

// Conectores de alto nivel (C1+) agrupados por función.
export const CONNECTORS = [
    { fn: 'Contraste', items: ['however', 'nevertheless', 'on the other hand', 'whereas', 'while', 'even though', 'despite', 'in spite of'] },
    { fn: 'Resultado', items: ['therefore', 'consequently', 'as a result', 'thus', 'hence', 'for this reason'] },
    { fn: 'Adición', items: ['moreover', 'furthermore', 'in addition', 'besides', 'what is more', 'not only… but also'] },
    { fn: 'Concesión', items: ['admittedly', 'granted', 'it is true that…', 'although', 'while it may be argued that…'] },
    { fn: 'Ejemplo', items: ['for instance', 'for example', 'to illustrate', 'a case in point is…', 'such as'] },
    { fn: 'Énfasis / opinión', items: ['indeed', 'in fact', 'clearly', 'from my perspective', 'I would argue that…'] },
    { fn: 'Conclusión', items: ['in conclusion', 'to sum up', 'all things considered', 'on balance', 'ultimately'] },
];

// Frases de cortesía / hedging útiles para el email.
export const EMAIL_POLITENESS = [
    'Would it be possible to…?',
    'I was wondering whether…',
    'I would greatly appreciate it if…',
    'Please let me know when…',
    'Thank you in advance for your help.',
    'I apologize for any inconvenience.',
];

// Templates por tarea (estructura, no contenido).
export const TEMPLATES = {
    email: [
        'Dear [Name],',
        '',
        'I am writing regarding [reason / problem]. [Explain the situation clearly — required element 1].',
        '',
        'Would it be possible to [request — required element 2]? [Add a supporting detail or reason.]',
        '',
        'Finally, could you let me know [question — required element 3]?',
        '',
        'Thank you very much for your time and help.',
        '',
        'Best regards,',
        '[Your name]',
    ].join('\n'),
    academic_discussion: [
        'While [Student A] raises a fair point, I share [Student B]\'s view that [your position].',
        'There are two main reasons for this.',
        'First, [reason 1 with brief elaboration].',
        'For instance, [a concrete or hypothetical example].',
        'Moreover, [reason 2 / address a counterargument].',
        'Ultimately, [restate your opinion concisely].',
    ].join('\n'),
};
