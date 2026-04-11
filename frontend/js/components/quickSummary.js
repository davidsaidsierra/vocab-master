// ── Quick Summary — grammar reference (reusable, responsive) ─

const TENSES = {
    present: [
        {
            name: 'Present Simple',
            sub: 'Routines · Facts',
            color: '#0071e3',
            formula: 'S + V (s/es) + …',
            use: 'Habits, general truths, scheduled events.',
            example: 'She <strong>works</strong> from home every Monday.',
            es: 'Ella trabaja desde casa todos los lunes.',
        },
        {
            name: 'Present Continuous',
            sub: 'Right now · Temporary',
            color: '#34c759',
            formula: 'S + am/is/are + V-ing',
            use: 'Actions happening now or around this period.',
            example: 'I <strong>am studying</strong> for the exam this week.',
            es: 'Estoy estudiando para el examen esta semana.',
        },
        {
            name: 'Present Perfect',
            sub: 'Past with present link',
            color: '#af52de',
            formula: 'S + have/has + V3 (past participle)',
            use: 'Past actions with relevance to now; experiences.',
            example: 'They <strong>have visited</strong> Paris twice.',
            es: 'Han visitado París dos veces.',
        },
        {
            name: 'Present Perfect Continuous',
            sub: 'Duration up to now',
            color: '#ff9500',
            formula: 'S + have/has been + V-ing',
            use: 'Action that started in the past and continues now.',
            example: 'He <strong>has been working</strong> here for 5 years.',
            es: 'Ha estado trabajando aquí durante 5 años.',
        },
    ],
    past: [
        {
            name: 'Past Simple',
            sub: 'Finished past',
            color: '#0071e3',
            formula: 'S + V2 (regular -ed / irregular)',
            use: 'Completed actions at a specific past time.',
            example: 'We <strong>watched</strong> the movie last night.',
            es: 'Vimos la película anoche.',
        },
        {
            name: 'Past Continuous',
            sub: 'In progress in the past',
            color: '#34c759',
            formula: 'S + was/were + V-ing',
            use: 'Action in progress at a past moment; background.',
            example: 'I <strong>was reading</strong> when she called.',
            es: 'Estaba leyendo cuando ella llamó.',
        },
        {
            name: 'Past Perfect',
            sub: 'Past before past',
            color: '#af52de',
            formula: 'S + had + V3',
            use: 'An action completed before another past action.',
            example: 'She <strong>had left</strong> before I arrived.',
            es: 'Ella se había ido antes de que yo llegara.',
        },
        {
            name: 'Past Perfect Continuous',
            sub: 'Duration before past',
            color: '#ff9500',
            formula: 'S + had been + V-ing',
            use: 'Long action happening up to another past action.',
            example: 'They <strong>had been waiting</strong> for an hour.',
            es: 'Habían estado esperando durante una hora.',
        },
    ],
    future: [
        {
            name: 'Future with Will',
            sub: 'Decisions · Predictions',
            color: '#0071e3',
            formula: 'S + will + V',
            use: 'Spontaneous decisions, promises, predictions.',
            example: 'I <strong>will help</strong> you with that.',
            es: 'Te ayudaré con eso.',
        },
        {
            name: 'Future with Going to',
            sub: 'Plans · Intentions',
            color: '#34c759',
            formula: 'S + am/is/are going to + V',
            use: 'Planned future actions or evident predictions.',
            example: 'We <strong>are going to travel</strong> next month.',
            es: 'Vamos a viajar el próximo mes.',
        },
        {
            name: 'Future Continuous',
            sub: 'In progress in future',
            color: '#af52de',
            formula: 'S + will be + V-ing',
            use: 'Action that will be in progress at a future time.',
            example: 'At 8pm, I <strong>will be having</strong> dinner.',
            es: 'A las 8pm, estaré cenando.',
        },
    ],
};

const MODALS = [
    { word: 'must',     use: 'Strong obligation / certainty', example: 'You <strong>must</strong> wear a helmet.' },
    { word: 'have to',  use: 'External obligation',           example: 'I <strong>have to</strong> work tomorrow.' },
    { word: 'should',   use: 'Advice / recommendation',       example: 'You <strong>should</strong> see a doctor.' },
    { word: 'ought to', use: 'Moral advice (formal)',         example: 'We <strong>ought to</strong> help them.' },
    { word: 'can',      use: 'Ability / permission',          example: 'She <strong>can</strong> speak French.' },
    { word: 'could',    use: 'Past ability / polite request', example: '<strong>Could</strong> you open the door?' },
    { word: 'may',      use: 'Possibility / formal permission', example: 'It <strong>may</strong> rain later.' },
    { word: 'might',    use: 'Weak possibility',              example: 'He <strong>might</strong> come tonight.' },
    { word: 'will',     use: 'Future / willingness',          example: 'I <strong>will</strong> call you.' },
    { word: 'would',    use: 'Polite requests / hypotheticals', example: '<strong>Would</strong> you like some tea?' },
    { word: 'shall',    use: 'Formal future / suggestions',   example: '<strong>Shall</strong> we begin?' },
    { word: 'need to',  use: 'Necessity',                     example: 'You <strong>need to</strong> rest.' },
];

const PHRASAL_VERBS = [
    { phrase: 'give up',     meaning: 'Quit / surrender',          example: "Don't <strong>give up</strong> on your dreams." },
    { phrase: 'look after',  meaning: 'Take care of',              example: 'She <strong>looks after</strong> her brother.' },
    { phrase: 'look forward to', meaning: 'Anticipate with pleasure', example: 'I <strong>look forward to</strong> seeing you.' },
    { phrase: 'turn on',     meaning: 'Activate / switch on',      example: '<strong>Turn on</strong> the lights, please.' },
    { phrase: 'turn off',    meaning: 'Deactivate',                example: '<strong>Turn off</strong> the TV before leaving.' },
    { phrase: 'pick up',     meaning: 'Collect / lift up',         example: "I'll <strong>pick you up</strong> at 7." },
    { phrase: 'put off',     meaning: 'Postpone',                  example: "Don't <strong>put off</strong> until tomorrow." },
    { phrase: 'find out',    meaning: 'Discover',                  example: 'I <strong>found out</strong> the truth.' },
    { phrase: 'get along',   meaning: 'Have good relationship',    example: 'They <strong>get along</strong> well.' },
    { phrase: 'run out of',  meaning: 'Finish supply',             example: 'We <strong>ran out of</strong> milk.' },
    { phrase: 'come up with', meaning: 'Invent / propose',         example: 'She <strong>came up with</strong> a great idea.' },
    { phrase: 'break down',  meaning: 'Stop working',              example: 'The car <strong>broke down</strong> on the road.' },
];

const CONNECTORS = [
    {
        title: 'Addition',
        color: '#0071e3',
        items: [
            { word: 'furthermore', use: 'Moreover, in addition', example: 'The plan is cheap; <strong>furthermore</strong>, it is fast.' },
            { word: 'moreover',    use: 'In addition (formal)',   example: '<strong>Moreover</strong>, sales increased 20%.' },
            { word: 'in addition', use: 'Plus, also',             example: '<strong>In addition</strong>, we offer free shipping.' },
            { word: 'besides',     use: 'Apart from that',        example: "It's late, and <strong>besides</strong>, I'm tired." },
        ],
    },
    {
        title: 'Contrast',
        color: '#ff9500',
        items: [
            { word: 'however',          use: 'But, on the other hand', example: 'I tried; <strong>however</strong>, I failed.' },
            { word: 'nevertheless',     use: 'Despite that',           example: 'It rained; <strong>nevertheless</strong>, we went out.' },
            { word: ‘on the other hand’, use: ‘In contrast’,           example: "On one hand it’s cheap; <strong>on the other hand</strong>, it’s slow." },
            { word: 'although',         use: 'Even though',            example: '<strong>Although</strong> it was cold, we walked.' },
        ],
    },
    {
        title: 'Cause & Effect',
        color: '#34c759',
        items: [
            { word: 'therefore',     use: 'For that reason',  example: 'It rained; <strong>therefore</strong>, the match was cancelled.' },
            { word: 'consequently',  use: 'As a result',      example: 'He overslept; <strong>consequently</strong>, he missed the bus.' },
            { word: 'as a result',   use: 'Because of that',  example: 'Sales dropped; <strong>as a result</strong>, we cut costs.' },
            { word: 'thus',          use: 'In this way',      example: 'She studied hard; <strong>thus</strong>, she passed.' },
        ],
    },
    {
        title: 'Emphasis',
        color: '#af52de',
        items: [
            { word: 'indeed',        use: 'In fact, truly',          example: "It is <strong>indeed</strong> a great honor." },
            { word: 'in fact',       use: 'Actually',                example: '<strong>In fact</strong>, he is the manager.' },
            { word: 'of course',     use: 'Naturally, certainly',    example: '<strong>Of course</strong> you can join us.' },
            { word: 'above all',     use: 'Most importantly',        example: '<strong>Above all</strong>, be honest.' },
        ],
    },
];

// ── Helpers ────────────────────────────────────────────────
function tenseCard(t) {
    return `
        <div class="qs-card" style="--qs-accent:${t.color}">
            <h4>${t.name}</h4>
            <div class="qs-sub">${t.sub}</div>
            <div class="qs-formula">${t.formula}</div>
            <p class="qs-use">${t.use}</p>
            <div class="qs-example">
                ${t.example}
                <em>${t.es}</em>
            </div>
        </div>
    `;
}

function modalCard(m) {
    return `
        <div class="qs-card" style="--qs-accent:#0071e3">
            <h4>${m.word}</h4>
            <p class="qs-use">${m.use}</p>
            <div class="qs-example">${m.example}</div>
        </div>
    `;
}

function phrasalCard(p) {
    return `
        <div class="qs-card" style="--qs-accent:#34c759">
            <h4>${p.phrase}</h4>
            <p class="qs-use">${p.meaning}</p>
            <div class="qs-example">${p.example}</div>
        </div>
    `;
}

function connectorCard(group) {
    const rows = group.items.map(i => `
        <div class="qs-row">
            <strong>${i.word}</strong>
            <span>${i.use}</span>
        </div>
    `).join('');
    const examples = group.items.map(i => `
        <div class="qs-example" style="margin-top:0.5rem">${i.example}</div>
    `).join('');
    return `
        <div class="qs-card" style="--qs-accent:${group.color}">
            <h4>${group.title}</h4>
            <div class="qs-sub">${group.items.length} connectors</div>
            ${rows}
            <div style="margin-top:0.75rem">${examples}</div>
        </div>
    `;
}

function section(icon, title, subtitle, html) {
    return `
        <div class="qs-section">
            <div class="qs-section-header">
                <span class="qs-icon">${icon}</span>
                <div>
                    <h3>${title}</h3>
                    <p>${subtitle}</p>
                </div>
            </div>
            ${html}
        </div>
    `;
}

// ── Render ─────────────────────────────────────────────────
export async function render(container) {
    container.innerHTML = `
        <div class="page-enter" style="max-width:1200px;margin:0 auto">
            <div style="margin-bottom:2rem">
                <h2 class="text-2xl font-bold" style="margin-bottom:0.4rem">Quick Summary</h2>
                <p style="color:var(--text-secondary);font-size:0.9rem">A clean, at-a-glance reference for English grammar — tenses, modals, phrasal verbs and connectors.</p>
            </div>

            ${section('⏱', 'Present Tenses', 'How to talk about now and recent past',
                `<div class="qs-grid">${TENSES.present.map(tenseCard).join('')}</div>`
            )}

            ${section('📜', 'Past Tenses', 'Talking about what already happened',
                `<div class="qs-grid">${TENSES.past.map(tenseCard).join('')}</div>`
            )}

            ${section('🚀', 'Future Tenses', 'Plans, predictions and decisions',
                `<div class="qs-grid">${TENSES.future.map(tenseCard).join('')}</div>`
            )}

            ${section('🛡', 'Modal Verbs', 'Obligation, ability, advice and possibility',
                `<div class="qs-grid">${MODALS.map(modalCard).join('')}</div>`
            )}

            ${section('🔗', 'Phrasal Verbs', 'Common verb + particle combinations',
                `<div class="qs-grid">${PHRASAL_VERBS.map(phrasalCard).join('')}</div>`
            )}

            ${section('🧩', 'Connectors', 'Link your ideas with clarity',
                `<div class="qs-grid">${CONNECTORS.map(connectorCard).join('')}</div>`
            )}
        </div>
    `;
}
