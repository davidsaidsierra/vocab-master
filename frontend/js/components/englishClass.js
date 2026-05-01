// ── English Class — weekly summary of in-class topics ────────

const WEEKS = [
    {
        label: 'Week of April 13 – 17, 2026',
        topics: [
            // ── 1. Nominal Clauses ──────────────────────────
            {
                icon: '📚',
                title: 'Nominal Clauses',
                subtitle: 'Groups of words that act as a noun — subject or object',
                intro: 'A nominal clause is a group of words that functions as a noun, serving as the subject or object of a sentence.',
                groups: [
                    {
                        name: '-ing / Participle Clauses',
                        color: '#0071e3',
                        items: [
                            { role: 'As Subject',        example: '<strong>Wearing a uniform</strong> can help people feel part of the team.' },
                            { role: 'As Object',         example: "I don't enjoy <strong>wearing formal clothes</strong>." },
                            { role: 'After a Preposition', example: "I'm excited about <strong>buying some new outfits</strong>." },
                        ],
                    },
                    {
                        name: 'That-Clauses',
                        color: '#34c759',
                        items: [
                            { role: 'As Subject (rare)',  example: '<strong>That she won again this year</strong> is not surprising.' },
                            { role: 'As Object',          example: 'I explained <strong>that she would have to buy a new outfit</strong>.' },
                            { role: 'After an Adjective', example: "I'm worried <strong>that I won't fit in</strong>." },
                        ],
                    },
                    {
                        name: 'Question Clauses',
                        color: '#af52de',
                        items: [
                            { role: 'As Subject',         example: '<strong>What you wear</strong> is entirely up to you.' },
                            { role: 'As Object',          example: 'My appearance certainly affects <strong>how I feel</strong>.' },
                            { role: 'After a Preposition', example: 'Fiona felt embarrassed because of <strong>how she looked</strong>.' },
                        ],
                    },
                    {
                        name: 'Infinitive Clauses',
                        color: '#ff9500',
                        items: [
                            { role: 'As Subject (rare)',  example: '<strong>To spend so much money on clothes</strong> is totally unnecessary.' },
                            { role: 'As Object',          example: "It's a good idea <strong>to wear dress clothes for an interview</strong>." },
                            { role: 'After an Adjective', example: 'I was surprised <strong>to learn about the dress code</strong>.' },
                        ],
                    },
                    {
                        name: 'Introductory Phrases',
                        color: '#ff2d55',
                        items: [
                            { role: 'The fact that…',    example: '<strong>The fact that</strong> you got a high grade shows how hard you worked.' },
                            { role: 'The idea that…',    example: '<strong>The idea that</strong> we have to wear a uniform makes me mad.' },
                            { role: 'The problem of…',   example: '<strong>The problem of</strong> following trends is that they never end.' },
                        ],
                    },
                ],
            },

            // ── 2. Modifying Comparatives & Superlatives ────
            {
                icon: '📊',
                title: 'Modifying Comparatives & Superlatives',
                subtitle: 'Use modifiers to show the degree of difference (C1)',
                intro: 'At the C1 level, modifiers add precision to comparisons, indicating how big or small the difference between things really is.',
                groups: [
                    {
                        name: 'Big Differences',
                        color: '#0071e3',
                        tagline: 'way · far · much · significantly · a lot · a good deal',
                        items: [
                            { role: 'Example', example: 'This dress is <strong>way</strong> cheaper than I thought.' },
                            { role: 'Example', example: 'Mandarin is <strong>significantly</strong> harder than Spanish.' },
                        ],
                    },
                    {
                        name: 'Small Differences',
                        color: '#34c759',
                        tagline: 'slightly · a bit · a tad · marginally · a little',
                        items: [
                            { role: 'Example', example: 'The coffee is <strong>slightly</strong> colder than I prefer.' },
                            { role: 'Example', example: 'This route is <strong>a bit</strong> faster than the other.' },
                        ],
                    },
                    {
                        name: '(Almost) No Difference',
                        color: '#af52de',
                        tagline: 'nearly · roughly · more or less · just · exactly as… as',
                        items: [
                            { role: 'Example', example: 'He is <strong>nearly as tall as</strong> his brother.' },
                            { role: 'Example', example: "They're <strong>more or less</strong> the same price." },
                        ],
                    },
                    {
                        name: 'Superlative Emphasis',
                        color: '#ff9500',
                        tagline: 'by far — to highlight a superlative',
                        items: [
                            { role: 'Example', example: 'Mandarin is, <strong>by far</strong>, the most difficult language.' },
                        ],
                    },
                ],
            },

            // ── 3. Advanced Comparative Structures ──────────
            {
                icon: '🔗',
                title: 'Advanced Comparative Structures',
                subtitle: 'Showing relationship and intensity between ideas',
                intro: 'These structures link changes together or push a comparison further with specific verbs.',
                groups: [
                    {
                        name: 'The… the… (Double Comparison)',
                        color: '#0071e3',
                        tagline: 'Shows how one change causes another',
                        items: [
                            { role: 'Example', example: '<strong>The stronger</strong> I am, <strong>the better</strong> I feel!' },
                            { role: 'Example', example: '<strong>The more</strong> you practice, <strong>the easier</strong> it gets.' },
                        ],
                    },
                    {
                        name: 'More than + Verb',
                        color: '#34c759',
                        tagline: 'compensate for · fulfill · make up for · meet · double',
                        items: [
                            { role: 'Example', example: 'The benefits <strong>more than make up for</strong> the detriments.' },
                            { role: 'Example', example: 'Her work <strong>more than meets</strong> the requirements.' },
                        ],
                    },
                ],
            },
        ],
    },
    // ── Semana 2 ────────────────────────────────────────────
    {
        label: 'Week of April 20 – 24, 2026',
        topics: [
            // ── 1. Narrative Tenses ─────────────────────────
            {
                icon: '📖',
                title: 'Narrative Tenses',
                subtitle: 'Tiempos verbales para dar estructura y contexto a historias del pasado',
                intro: 'Se utilizan para dar estructura, contexto y detalle a las historias o anécdotas en el pasado.',
                groups: [
                    {
                        name: 'Past Simple',
                        color: '#0071e3',
                        tagline: 'Pasado Simple — eventos principales en orden cronológico',
                        items: [
                            { role: 'Uso',     example: 'Para los eventos principales de una historia en orden cronológico.' },
                            { role: 'Ejemplo', example: 'She <strong>opened</strong> the door, <strong>looked</strong> at us and <strong>went</strong> into her room.' },
                        ],
                    },
                    {
                        name: 'Past Continuous',
                        color: '#34c759',
                        tagline: 'Pasado Continuo — escenario o acción en progreso',
                        items: [
                            { role: 'Uso',     example: 'Para establecer el escenario al principio de una historia o describir una acción en progreso en un momento específico.' },
                            { role: 'Ejemplo', example: 'It <strong>was getting</strong> dark, and I <strong>was walking</strong> to the pub when…' },
                        ],
                    },
                    {
                        name: 'Past Perfect Simple',
                        color: '#af52de',
                        tagline: 'Pasado Perfecto Simple — acción anterior a otro evento pasado',
                        items: [
                            { role: 'Uso',     example: 'Para acciones que ocurrieron <em>antes</em> de otro evento pasado.' },
                            { role: 'Ejemplo', example: 'He noticed that I <strong>had cleaned</strong> the car.' },
                        ],
                    },
                    {
                        name: 'Past Perfect Continuous',
                        color: '#ff9500',
                        tagline: 'Pasado Perfecto Continuo — énfasis en la duración antes de otro evento',
                        items: [
                            { role: 'Uso',     example: 'Para enfatizar la duración de una acción que ocurría antes de otro evento pasado.' },
                            { role: 'Ejemplo', example: 'I <strong>had been waiting</strong> for him for an hour before he arrived.' },
                        ],
                    },
                ],
            },

            // ── 2. Future in the Past ───────────────────────
            {
                icon: '⏳',
                title: 'Future in the Past',
                subtitle: 'Futuro en el Pasado — planes, intenciones o predicciones hechas en el pasado',
                intro: 'Se utiliza para hablar de planes, intenciones o predicciones que se hicieron en un punto del pasado.',
                groups: [
                    {
                        name: 'Would',
                        color: '#0071e3',
                        tagline: 'Basado en "will" — predicciones o promesas desde el pasado',
                        items: [
                            { role: 'Uso',     example: 'Para predicciones o promesas desde una perspectiva pasada.' },
                            { role: 'Ejemplo', example: 'We thought he <strong>would win</strong> the election.' },
                        ],
                    },
                    {
                        name: 'Was / Were going to',
                        color: '#34c759',
                        tagline: 'Basado en "be going to" — planes o intenciones previas',
                        items: [
                            { role: 'Uso',     example: 'Para planes o intenciones previas, a menudo los que no se cumplieron.' },
                            { role: 'Ejemplo', example: 'We <strong>were going to have</strong> a drink, but the boss made us stay.' },
                        ],
                    },
                    {
                        name: 'Past Continuous',
                        color: '#af52de',
                        tagline: 'Basado en "present continuous" — arreglos ya programados',
                        items: [
                            { role: 'Uso',     example: 'Para arreglos o citas ya programadas en el pasado.' },
                            { role: 'Ejemplo', example: 'She <strong>was getting</strong> married soon and wanted me to be her bridesmaid.' },
                        ],
                    },
                    {
                        name: 'Would be + -ing',
                        color: '#ff9500',
                        tagline: 'Basado en "future continuous" — acción en progreso vista desde el pasado',
                        items: [
                            { role: 'Uso',     example: 'Para una acción que estaría en progreso en un momento del futuro visto desde el pasado.' },
                            { role: 'Ejemplo', example: "She told her mother that she <strong>wouldn't be going</strong> home that summer." },
                        ],
                    },
                    {
                        name: 'Would have + past participle',
                        color: '#ff2d55',
                        tagline: 'Basado en "future perfect" — acción esperada como terminada',
                        items: [
                            { role: 'Uso',     example: 'Para una acción que se esperaba que estuviera terminada en un punto específico.' },
                            { role: 'Ejemplo', example: 'He said he <strong>would have finished</strong> the book in two weeks.' },
                        ],
                    },
                ],
            },

            // ── 3. Expresiones Idiomáticas de Futuro Próximo ─
            {
                icon: '⚡',
                title: 'Near Future Idiomatic Expressions',
                subtitle: 'Expresiones Idiomáticas de Futuro Próximo — estructuras avanzadas',
                intro: 'Estructuras avanzadas para describir eventos que estaban a punto de suceder en el pasado.',
                groups: [
                    {
                        name: 'Was / Were about to + infinitive',
                        color: '#0071e3',
                        tagline: 'Estar a punto de',
                        items: [
                            { role: 'Ejemplo', example: 'I <strong>was about to confess</strong> what I had done.' },
                        ],
                    },
                    {
                        name: 'Was / Were on the brink/verge of + -ing',
                        color: '#34c759',
                        tagline: 'Estar al borde de / a punto de (énfasis en la inmediatez)',
                        items: [
                            { role: 'Ejemplo', example: 'I <strong>was on the verge of saying</strong> something, but I kept quiet.' },
                        ],
                    },
                    {
                        name: 'Was / Were due to + infinitive',
                        color: '#af52de',
                        tagline: 'Algo programado o previsto por horario',
                        items: [
                            { role: 'Ejemplo', example: 'He <strong>was due to leave</strong> the country on Saturday.' },
                        ],
                    },
                    {
                        name: 'Was / Were to + infinitive',
                        color: '#ff9500',
                        tagline: 'Obligaciones o eventos destinados a suceder',
                        items: [
                            { role: 'Ejemplo', example: 'The victim <strong>was to arrive</strong> home for his wedding on March 22.' },
                        ],
                    },
                ],
            },
        ],
    },

    // ── Semana 3 ────────────────────────────────────────────
    {
        label: 'Week of April 27 – May 1, 2026',
        topics: [
            // ── 1. Review of Future Tenses ──────────────────
            {
                icon: '🔮',
                title: 'Review of Future Tenses',
                subtitle: 'Repaso de Tiempos Futuros — planes, predicciones y estados futuros',
                intro: 'En este nivel, se espera que utilices los diferentes aspectos del futuro para hablar de planes, predicciones y estados futuros con precisión.',
                groups: [
                    {
                        name: 'Future Simple — will + base form',
                        color: '#0071e3',
                        tagline: 'Predicciones basadas en opiniones o decisiones instantáneas',
                        items: [
                            { role: 'Uso',     example: 'Predicciones basadas en opiniones o decisiones instantáneas.' },
                            { role: 'Ejemplo', example: 'I <strong>will eat</strong> dinner.' },
                        ],
                    },
                    {
                        name: 'Future Continuous — will be + -ing',
                        color: '#34c759',
                        tagline: 'Acciones en progreso en un momento específico del futuro',
                        items: [
                            { role: 'Uso',     example: 'Acciones que estarán en progreso en un momento específico del futuro.' },
                            { role: 'Ejemplo', example: 'He <strong>will be drinking</strong> tea.' },
                        ],
                    },
                    {
                        name: 'Future Perfect — will have + past participle',
                        color: '#af52de',
                        tagline: 'Acciones terminadas antes de un punto determinado en el futuro',
                        items: [
                            { role: 'Uso',     example: 'Acciones que habrán terminado antes de un punto determinado en el futuro.' },
                            { role: 'Ejemplo', example: 'With this solution, we <strong>will have reduced</strong> pollution by 2030.' },
                        ],
                    },
                    {
                        name: 'Future Perfect Continuous — will have been + -ing',
                        color: '#ff9500',
                        tagline: 'Duración de una acción hasta un punto en el futuro',
                        items: [
                            { role: 'Uso',     example: 'Para enfatizar la duración de una acción hasta un punto en el futuro.' },
                            { role: 'Ejemplo', example: 'They <strong>will have been watching</strong> TV.' },
                        ],
                    },
                ],
            },

            // ── 2. Inversion with Negative Adverbials ───────
            {
                icon: '🔄',
                title: 'Inversion with Negative Adverbials',
                subtitle: 'Inversión Negativa — estructura C1 para énfasis y formalidad',
                intro: 'Estructura de nivel C1 que invierte el orden sujeto–auxiliar después de frases negativas o restrictivas para añadir énfasis o formalidad. Estructura: Frase Negativa + Verbo Auxiliar + Sujeto + Verbo Principal.',
                groups: [
                    {
                        name: 'Hardly / Barely / Scarcely / No sooner',
                        color: '#0071e3',
                        tagline: 'Apenas / Ni bien',
                        items: [
                            { role: 'Ejemplo', example: '<strong>Hardly had I closed</strong> my eyes when the alarm went off.' },
                            { role: 'Ejemplo', example: '<strong>No sooner had the shop opened</strong> its doors than it went bankrupt.' },
                        ],
                    },
                    {
                        name: 'Only',
                        color: '#34c759',
                        tagline: 'Solo si / Solo cuando',
                        items: [
                            { role: 'Ejemplo', example: '<strong>Only when I sleep can I forget</strong> about the incident.' },
                            { role: 'Ejemplo', example: '<strong>Only now can I understand</strong> what really happened.' },
                        ],
                    },
                    {
                        name: 'Not only / Not since',
                        color: '#af52de',
                        tagline: 'No solo / Ni una vez',
                        items: [
                            { role: 'Ejemplo', example: '<strong>Not only did she pass</strong> the exam, but she also got the highest score.' },
                            { role: 'Ejemplo', example: '<strong>Not since I was a child have I had</strong> such a great time.' },
                        ],
                    },
                    {
                        name: 'Never / Rarely / Seldom / Little',
                        color: '#ff9500',
                        tagline: 'Nunca / Rara vez / Poco',
                        items: [
                            { role: 'Ejemplo', example: '<strong>Never have I seen</strong> such a breathtaking performance.' },
                            { role: 'Ejemplo', example: '<strong>Little did they know</strong> that their lives were about to change.' },
                        ],
                    },
                    {
                        name: 'Prohibición e Imposibilidad',
                        color: '#ff2d55',
                        tagline: 'Under no circumstances / In no way',
                        items: [
                            { role: 'Ejemplo', example: '<strong>Under no circumstances should you share</strong> your password.' },
                            { role: 'Ejemplo', example: '<strong>In no way does this decision reflect</strong> the opinions of the team.' },
                        ],
                    },
                ],
            },
        ],
    },
];

// ── Helpers ────────────────────────────────────────────────
function itemRow(i) {
    return `
        <div class="qs-row">
            <strong>${i.role}</strong>
            <span>${i.example}</span>
        </div>
    `;
}

function groupCard(g) {
    const rows = g.items.map(itemRow).join('');
    const tagline = g.tagline
        ? `<div class="qs-sub" style="margin-top:-0.25rem">${g.tagline}</div>`
        : '';
    return `
        <div class="qs-card" style="--qs-accent:${g.color}">
            <h4>${g.name}</h4>
            ${tagline}
            <div style="margin-top:0.5rem">${rows}</div>
        </div>
    `;
}

function topicBlock(t) {
    return `
        <div class="qs-section">
            <div class="qs-section-header">
                <span class="qs-icon">${t.icon}</span>
                <div>
                    <h3>${t.title}</h3>
                    <p>${t.subtitle}</p>
                </div>
            </div>
            <p style="color:var(--text-secondary);font-size:0.9rem;margin:-0.5rem 0 1rem">${t.intro}</p>
            <div class="qs-grid">${t.groups.map(groupCard).join('')}</div>
        </div>
    `;
}

function weekBlock(w) {
    return `
        <div style="margin-bottom:2.5rem">
            <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:1.25rem;padding-bottom:0.5rem;border-bottom:1px solid var(--border)">
                <span style="font-size:1.2rem">🗓</span>
                <h3 style="font-size:1.05rem;font-weight:600;color:var(--text-secondary);margin:0">${w.label}</h3>
            </div>
            ${w.topics.map(topicBlock).join('')}
        </div>
    `;
}

// ── Render ─────────────────────────────────────────────────
export async function render(container) {
    container.innerHTML = `
        <div class="page-enter" style="max-width:1200px;margin:0 auto">
            <div style="margin-bottom:2rem">
                <h2 class="text-2xl font-bold" style="margin-bottom:0.4rem">English Class</h2>
                <p style="color:var(--text-secondary);font-size:0.9rem">
                    A weekly log of the grammar topics covered in class — organized by week, with examples and categories for quick review.
                </p>
            </div>
            ${WEEKS.map(weekBlock).join('')}
        </div>
    `;
}
