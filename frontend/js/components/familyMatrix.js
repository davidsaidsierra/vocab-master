// ── Familia de palabras — la matriz slot × significados ─────
// Dos ejes: la fila es la función gramatical (verbo, sustantivo, adjetivo…) y
// dentro de cada fila van TODAS las acepciones de esa función. Las celdas
// vacías se muestran como vacías a propósito: que `stay` no tenga adjetivo es
// información real, no un hueco por llenar.

export const SLOT_LABELS = {
    verb: 'Verbo',
    noun_thing: 'Sustantivo (cosa)',
    noun_person: 'Sustantivo (persona)',
    adjective: 'Adjetivo',
    adverb: 'Adverbio',
    gerund: 'Gerundio (-ing)',
    participle: 'Participio (-ed)',
};

const SLOT_ORDER = ['verb', 'noun_thing', 'noun_person', 'adjective', 'adverb', 'gerund', 'participle'];

const INFLECTION_LABELS = {
    third: '3ª pers.',
    ing: '-ing',
    past: 'pasado',
    participle: 'participio',
    plural: 'plural',
};

// ── Acceso a las celdas (lo usa el repaso) ──────────────────
// El repaso pregunta por UNA casilla, no por la familia entera: "stay como
// verbo" es un ejercicio distinto de "stay como sustantivo", con su propia
// traducción y su propio ejemplo.

/** Slots que sí existen en esta familia, en orden de presentación. */
export function filledSlots(family) {
    const slots = family?.slots || {};
    return SLOT_ORDER.filter(s => slots[s]);
}

/** La celda de un slot (o null). */
export function cellFor(family, slot) {
    return (family?.slots || {})[slot] || null;
}

/** Traducciones de la celda unidas por coma — lo que el repaso da por válido. */
export function cellTranslation(cell) {
    const parts = [];
    for (const m of cell?.meanings || []) {
        for (const chunk of String(m.translation_es || '').split(',')) {
            const t = chunk.trim();
            if (t && !parts.includes(t)) parts.push(t);
        }
    }
    return parts.join(', ');
}

/** Primer ejemplo con frase de la celda: {en, es} o null. */
export function cellExample(cell) {
    for (const m of cell?.meanings || []) {
        if (m.example_en) return { en: m.example_en, es: m.example_es || '' };
    }
    return null;
}

/** Definición inglesa de la celda, si alguna acepción la trae. */
export function cellDefinition(cell) {
    for (const m of cell?.meanings || []) {
        if (m.definition_en) return m.definition_en;
    }
    return '';
}

// ── Generadores de ejercicio (fase 2) ───────────────────────
// Preguntas que solo existen porque hay matriz: pasar de una casilla a otra,
// elegir entre -ing y -ed, recordar una flexión irregular o un phrasal. Todo
// se deriva de datos ya guardados — sin IA y sin llamadas.

const _WORD_RE = w => new RegExp(`\\b${String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

/** Traducción corta de una celda, para dar como pista sin regalar la respuesta. */
function shortTranslation(cell) {
    const first = (cell?.meanings || [])[0]?.translation_es || '';
    return first.split(',')[0].replace(/\([^)]*\)/g, '').trim();
}

/**
 * Derivación: se da una casilla y se pide otra.
 *   "decide es el VERBO → ¿el sustantivo?"  → decision
 * Devuelve una lista de {from, to, given, answer, hint, ...} lista para usar.
 */
export function derivationItems(family) {
    const slots = filledSlots(family);
    if (slots.length < 2) return [];
    const out = [];
    for (const from of slots) {
        for (const to of slots) {
            if (from === to) continue;
            const a = cellFor(family, from), b = cellFor(family, to);
            if (!a || !b || a.form.toLowerCase() === b.form.toLowerCase()) continue;
            out.push({
                kind: 'derivation',
                given: a.form, givenSlot: from, targetSlot: to,
                answer: b.form,
                accepted: [b.form, ...(b.variants || [])],
                // Las otras casillas son las formas con las que se confunde:
                // si escribes 'decisive' cuando se pedía 'decision', es error.
                rivals: slots.filter(x => x !== to).map(x => cellFor(family, x).form),
                hint: shortTranslation(b),
                example: cellExample(b),
                note: family.notes_es || '',
            });
        }
    }
    return out;
}

/**
 * Contraste -ing / -ed: la frase de ejemplo con la forma tapada.
 *   "The lecture was _____ (interest)"  → interesting
 * Solo tiene sentido donde la familia trae nota de contraste.
 */
export function contrastItems(family) {
    if (!family?.contrast_es) return [];
    const out = [];
    for (const slot of filledSlots(family)) {
        const cell = cellFor(family, slot);
        const forms = [cell.form, ...(cell.variants || [])];
        // Solo cuenta como contraste si la MISMA casilla tiene las dos formas
        // rivales: una en -ing y otra en -ed. Sin las dos no hay nada que
        // elegir, y la nota de la familia hablaba de otra confusión distinta
        // (borrow/lend, respective/respectful) que este ejercicio no prueba.
        const hasIng = forms.some(f => /ing$/i.test(f));
        const hasEd  = forms.some(f => /ed$/i.test(f));
        if (!hasIng || !hasEd) continue;
        for (const m of cell.meanings || []) {
            if (!m.example_en) continue;
            // Cuál de las formas aparece en ESTA frase: esa es la respuesta.
            const hit = forms.find(f => _WORD_RE(f).test(m.example_en));
            if (!hit) continue;
            out.push({
                kind: 'contrast',
                sentence: m.example_en.replace(_WORD_RE(hit), '_____'),
                answer: hit,
                accepted: [hit],
                rivals: forms.filter(f => f !== hit),
                cue: family.root,
                // La traducción trae la forma inglesa entre paréntesis
                // ("agotado (exhausted, el que SIENTE)") — eso regalaría la
                // respuesta, así que se quitan todas las formas de la celda.
                hint: forms.reduce((t, f) => t.replace(_WORD_RE(f), ''), m.translation_es || '')
                          .replace(/\(\s*,?\s*/g, '(').replace(/\(\s*\)/g, '')
                          .replace(/\s{2,}/g, ' ').trim(),
                example: { en: m.example_en, es: m.example_es || '' },
                note: family.contrast_es,
            });
        }
    }
    // Con una sola frase no hay contraste que probar.
    return out.length >= 2 ? out : [];
}

/** Flexión irregular: "pasado de seek" → sought. */
export function inflectionItems(family) {
    const cell = cellFor(family, 'verb');
    if (!cell) return [];
    const infl = cell.inflections || {};
    const LABEL = { past: 'el pasado', participle: 'el participio', third: 'la 3ª persona', ing: 'la forma -ing' };
    const out = [];
    for (const key of ['past', 'participle']) {
        const v = infl[key];
        // Solo los irregulares: los regulares (-ed) no enseñan nada.
        if (!v || v.toLowerCase().endsWith('ed')) continue;
        if (key === 'participle' && v === infl.past) continue;   // no repetir
        out.push({
            kind: 'inflection',
            given: cell.form, ask: LABEL[key], answer: v, accepted: [v],
            rivals: Object.values(infl).filter(x => x && x !== v),
            hint: shortTranslation(cell),
            example: cellExample(cell),
            note: family.notes_es || '',
        });
    }
    return out;
}

/** Phrasal: se da el significado en español y se pide el phrasal. */
export function phrasalItems(family) {
    return (family?.phrasals || []).map(p => ({
        kind: 'phrasal',
        given: family.root, answer: p.phrase, accepted: [p.phrase],
        rivals: (family.phrasals || []).map(x => x.phrase).filter(x => x !== p.phrase),
        hint: p.meaning_es,
        example: p.example_en ? { en: p.example_en, es: p.example_es || '' } : null,
        note: '',
    }));
}

/**
 * ¿La familia contiene realmente esta palabra? El backend descarta las matrices
 * que no la contienen (pedir "treadmill" y recibir la familia de "tread" deja la
 * palabra sin casilla), así que el frontend usa la misma regla para no mostrar
 * como válida una matriz que luego no se va a guardar.
 */
export function familyHasWord(family, word) {
    const w = String(word || '').trim().toLowerCase();
    if (!w || !family) return false;
    if (String(family.root || '').toLowerCase() === w) return true;
    for (const cell of Object.values(family.slots || {})) {
        if (!cell) continue;
        if (String(cell.form).toLowerCase() === w) return true;
        if ((cell.variants || []).some(v => String(v).toLowerCase() === w)) return true;
        // Las flexiones vienen calculadas por el backend (beat → beats), así que
        // una palabra guardada en plural o en pasado también cuenta.
        if (Object.values(cell.inflections || {}).some(v => String(v).toLowerCase() === w)) return true;
    }
    return false;
}

/** Todas las preguntas posibles de una familia, por tipo. */
export function questionsFor(family, kind) {
    if (!family) return [];
    if (kind === 'derivation') return derivationItems(family);
    if (kind === 'contrast')   return contrastItems(family);
    if (kind === 'inflection') return inflectionItems(family);
    if (kind === 'phrasal')    return phrasalItems(family);
    return [];
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function inflectionsHTML(infl) {
    const entries = Object.entries(infl || {}).filter(([, v]) => v);
    if (!entries.length) return '';
    return `<div class="flex flex-wrap gap-1 mt-1">
        ${entries.map(([k, v]) => `
            <span class="badge" style="background:rgba(148,163,184,0.12);color:#94a3b8;font-size:0.65rem">
                ${esc(INFLECTION_LABELS[k] || k)}: ${esc(v)}
            </span>`).join('')}
    </div>`;
}

function meaningHTML(m) {
    return `
        <div class="mt-2 pl-3 border-l-2 border-brand-500/40">
            <p class="text-sm font-semibold text-brand-400">
                ${esc(m.translation_es)}
                ${m.register ? `<span class="text-xs text-slate-500 font-normal">· ${esc(m.register)}</span>` : ''}
            </p>
            ${m.definition_en ? `<p class="text-xs text-slate-400">${esc(m.definition_en)}</p>` : ''}
            ${m.example_en ? `<p class="text-sm text-slate-200 mt-1">"${esc(m.example_en)}"</p>` : ''}
            ${m.example_es ? `<p class="text-xs text-slate-500 italic">${esc(m.example_es)}</p>` : ''}
        </div>
    `;
}

// Marcador por casilla: cuántas veces la acertaste y cuántas la fallaste.
// Es el mapa de cobertura — deja ver que dominas el verbo pero fallas el
// adjetivo, algo que el progreso único de la familia no puede mostrar.
function statsHTML(st) {
    if (!st || (!st.ok && !st.fail)) return '';
    const total = (st.ok || 0) + (st.fail || 0);
    const pct = Math.round((st.ok || 0) / total * 100);
    const color = pct >= 80 ? '#34c759' : pct >= 50 ? '#f59e0b' : '#ff3b30';
    return `<span class="badge" style="background:${color}22;color:${color};font-size:0.65rem"
                  title="${st.ok || 0} aciertos / ${st.fail || 0} fallos">${pct}%</span>`;
}

function rowHTML(slot, cell, stats = {}) {
    const label = SLOT_LABELS[slot] || slot;
    if (!cell) {
        // Celda vacía explícita: la familia no tiene esa función gramatical.
        return `
            <div class="flex items-start gap-3 py-2 opacity-40">
                <div class="w-40 shrink-0 text-xs text-slate-500">${esc(label)}</div>
                <div class="text-xs text-slate-600">— no existe en esta familia —</div>
            </div>
        `;
    }
    return `
        <div class="flex items-start gap-3 py-3 border-t border-slate-700/40">
            <div class="w-40 shrink-0">
                <p class="text-xs text-slate-500">${esc(label)} ${statsHTML(stats[slot])}</p>
                <p class="text-base font-bold" style="color:var(--text-primary)">${esc(cell.form)}</p>
                ${(cell.variants || []).length ? `
                    <p class="text-xs mt-0.5" style="color:#4ade80" title="Otras palabras de la misma casilla (negativos, compuestos)">
                        ${cell.variants.map(esc).join(' · ')}
                    </p>` : ''}
                ${inflectionsHTML(cell.inflections)}
            </div>
            <div class="flex-1 min-w-0">
                ${(cell.meanings || []).map(meaningHTML).join('')}
            </div>
        </div>
    `;
}

function phrasesHTML(title, icon, items) {
    if (!items || !items.length) return '';
    return `
        <h4 class="text-sm font-semibold text-slate-300 mt-5 mb-2">${icon} ${title}</h4>
        <div class="space-y-2">
            ${items.map(p => `
                <div class="card" style="padding:0.75rem">
                    <div class="flex items-center justify-between gap-3 flex-wrap">
                        <span class="font-semibold text-slate-100 text-sm">${esc(p.phrase)}</span>
                        <span class="text-xs text-brand-400">${esc(p.meaning_es)}</span>
                    </div>
                    ${p.example_en ? `<p class="text-xs text-slate-400 mt-1">"${esc(p.example_en)}"</p>` : ''}
                    ${p.example_es ? `<p class="text-xs text-slate-500 italic">${esc(p.example_es)}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

/** HTML de la matriz completa. Reutilizable fuera del modal (repaso, etc.). */
export function familyMatrixHTML(family, stats = {}) {
    if (!family) return '';
    const slots = family.slots || {};
    return `
        ${family.contrast_es ? `
            <div class="p-3 rounded-lg mb-3" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25)">
                <p class="text-xs font-semibold text-amber-400 mb-1">⚠️ Contraste que suele fallar</p>
                <p class="text-xs text-slate-300">${esc(family.contrast_es)}</p>
            </div>` : ''}
        <div>${SLOT_ORDER.map(slot => rowHTML(slot, slots[slot], stats)).join('')}</div>
        ${phrasesHTML('Phrasal verbs', '🔗', family.phrasals)}
        ${phrasesHTML('Expresiones', '💬', family.expressions)}
        ${family.notes_es ? `
            <div class="p-3 rounded-lg mt-4" style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25)">
                <p class="text-xs text-slate-300">📌 ${esc(family.notes_es)}</p>
            </div>` : ''}
    `;
}

/**
 * Abre la matriz de una palabra en un modal.
 * @param {object} word - WordOut con `family` (la cabeza de la familia).
 */
export function openFamilyModal(word) {
    document.querySelector('.modal-overlay')?.remove();
    const family = word.family;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:760px;max-height:88vh;overflow-y:auto">
            <div class="flex items-start justify-between mb-4">
                <div>
                    <h3 class="text-xl font-bold text-slate-100">🧬 Familia: ${esc(family?.root || word.word)}</h3>
                    <p class="text-xs text-slate-500 mt-0.5">
                        Todas estas formas cuentan como <strong>una sola palabra</strong>; el progreso lo lleva la familia.
                        El porcentaje de cada casilla es tu acierto en ella: el repaso insiste en la más floja.
                    </p>
                </div>
                <button class="text-slate-500 hover:text-slate-300 text-xl" id="family-close">✕</button>
            </div>
            <div id="family-body">
                ${family
                    ? familyMatrixHTML(family, word.slot_stats || {})
                    : `<p class="text-slate-400 text-sm py-6 text-center">Esta palabra todavía no tiene familia.</p>`}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#family-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}
