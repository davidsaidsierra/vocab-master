// ── Repaso · "Escribir un texto" ─────────────────────────────────────────────
// Tarjeta autónoma que se monta al final de la página Review. Te da un tema y
// N palabras de tu propio repositorio (repartidas por categoría gramatical) y
// te pide un texto que las use: cada palabra bien usada sube su mastery.
//
// Todo el componente vive aquí: flashcards.js solo aporta el punto de montaje.
// Si esto falla, la página Review sigue funcionando igual (ver mount()).

import * as api from '../api.js';
import { toast } from '../utils/helpers.js';
import { getRole } from '../auth.js';

const DRAFT_KEY = 'vw_draft';       // borrador: "Practice Again" re-renderiza la página entera
const PER_TYPE_KEY = 'vw_per_type'; // última preferencia de palabras por tipo

// Estado a nivel de módulo: sobrevive a los re-render de flashcards.js, así que
// volver a montar no pide otra sesión ni cambia las palabras bajo los pies.
let state = null;
let cleanup = null;

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Detección de uso (sin morfología aquí) ───────────────────────────────────
// El servidor manda en `word.match` las formas ya expandidas
// (services/vocab_writing.match_spec), así que el navegador solo comprueba
// pertenencia y orden. Las reglas de sufijos viven en UN solo sitio, en Python.
function tokenize(text) {
    const out = [];
    const re = /[A-Za-z][A-Za-z'’\-]*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const n = m[0].toLowerCase().replace(/’/g, "'");
        if (n.includes('-')) {
            const partes = n.split('-').filter(p => p.length >= 2);
            if (partes.length) out.push(...partes);
            else out.push(n.replace(/-/g, ''));
        } else {
            out.push(n);
        }
    }
    return out;
}

function isUsed(match, tokens) {
    const groups = match?.groups || [];
    if (!groups.length) return false;
    const needed = match.needed || groups.length;
    const maxGap = match.max_gap ?? 2;
    const sets = groups.map(g => new Set(g));

    if (groups.length === 1) return tokens.some(t => sets[0].has(t));

    let best = 0;
    for (let start = 0; start < tokens.length; start++) {
        if (!sets[0].has(tokens[start])) continue;
        let found = 1, cursor = start;
        for (let g = 1; g < sets.length; g++) {
            let hit = -1;
            for (let j = cursor + 1; j < Math.min(cursor + 2 + maxGap, tokens.length); j++) {
                if (sets[g].has(tokens[j])) { hit = j; break; }
            }
            if (hit < 0) break;
            found++; cursor = hit;
        }
        if (found > best) best = found;
        if (best === sets.length) break;
    }
    return best >= needed;
}

function allWords() {
    return (state?.session?.buckets || []).flatMap(b =>
        b.words.map(w => ({ ...w, pos: b.pos })));
}

// ── Montaje ──────────────────────────────────────────────────────────────────
export async function mount(host) {
    if (!host) return;
    // La evaluación gasta IA, así que el backend la niega al rol `free` con un
    // 403. Se aplica el mismo criterio que el resto de la app (los enlaces con
    // data-requires-ai en index.html): si no hay IA, la tarjeta ni aparece —
    // mejor eso que dejar escribir 500 palabras para chocar contra un 403.
    const rol = getRole();
    if (rol && rol !== 'admin' && rol !== 'premium') { host.innerHTML = ''; return; }
    if (cleanup) { try { cleanup(); } catch { /* noop */ } cleanup = null; }

    host.innerHTML = `
        <section class="vw-card" id="vw-root">
            <div class="vw-head">
                <div>
                    <h3 class="vw-title">📝 Escribir un texto</h3>
                    <p class="vw-sub">Usa tu propio vocabulario en un texto real. Cada palabra bien usada sube su dominio.</p>
                </div>
                <div class="vw-scores" id="vw-history"></div>
            </div>
            <div class="vw-body" id="vw-body">
                <div class="vw-loading">Cargando palabras…</div>
            </div>
        </section>
    `;

    const root = host.querySelector('#vw-root');

    // ── Aislamiento de teclado (imprescindible) ──
    // flashcards.js registra un keydown en `document` (su onKeyDown) que, con
    // una sesión de repaso abierta, se traga el Espacio, el Enter y las
    // flechas: sin esto no se puede escribir un texto, y peor aún, las flechas
    // calificarían tarjetas. Ese listener está en fase de burbuja, así que
    // cortar la propagación en la raíz de esta tarjeta lo neutraliza sin tocar
    // ni una línea de flashcards.js. Escape sigue pasando (cierra el menú móvil).
    const stop = e => { if (e.key !== 'Escape') e.stopPropagation(); };
    ['keydown', 'keyup', 'keypress'].forEach(t => root.addEventListener(t, stop));

    cleanup = () => {
        ['keydown', 'keyup', 'keypress'].forEach(t => root.removeEventListener(t, stop));
    };

    try {
        if (!state) {
            const perType = parseInt(localStorage.getItem(PER_TYPE_KEY)) || 5;
            state = {
                session: null, perType, topics: null, result: null, loading: false,
                attempt: 1,        // 1 = primer envío; 2 = reintento tras ver el mapa
                mapa: null,        // HTML del texto con los fallos marcados
                scorePrevia: null, // nota del intento anterior, para comparar
                lastText: '',
            };
        }
        if (!state.session) {
            state.session = await api.vocabWriting.session(state.perType);
        }
        renderBody(root);
        loadHistory(root);
    } catch (err) {
        const body = root.querySelector('#vw-body');
        if (body) {
            body.innerHTML = `<div class="vw-error">No se pudo cargar el ejercicio: ${esc(err.message)}
                <button class="vw-btn vw-btn-ghost" id="vw-retry">Reintentar</button></div>`;
            body.querySelector('#vw-retry')?.addEventListener('click', () => { state = null; mount(host); });
        }
    }
}

async function loadHistory(root) {
    try {
        const h = await api.vocabWriting.history(5);
        const box = root.querySelector('#vw-history');
        if (!box || !h.items?.length) return;
        box.innerHTML = h.items.slice().reverse().map(it =>
            `<span class="vw-score-pill" style="--c:${scoreColor(it.score)}" title="${esc(it.topic)}">${it.score.toFixed(1)}</span>`
        ).join('');
    } catch { /* el historial es decorativo: si falla, se calla */ }
}

function scoreColor(score) {
    if (score >= 4.5) return 'var(--green)';
    if (score >= 3.5) return '#0071e3';
    if (score >= 2.5) return 'var(--orange)';
    return 'var(--red)';
}

// ── Vista del ejercicio ──────────────────────────────────────────────────────
function renderBody(root) {
    const body = root.querySelector('#vw-body');
    const s = state.session;
    const draft = localStorage.getItem(DRAFT_KEY) || '';

    body.innerHTML = `
        <div class="vw-topic">
            <div class="vw-topic-top">
                <span class="vw-area">${esc(s.topic.area)}</span>
                <button type="button" class="vw-btn vw-btn-ghost" id="vw-newtopic">🎲 Otro tema</button>
            </div>
            <p class="vw-topic-title">${esc(s.topic.title)}</p>
            <p class="vw-topic-hint">${esc(s.topic.hint_es)}</p>
        </div>

        <div class="vw-controls">
            <div class="vw-control">
                <label class="vw-label" for="vw-pertype">Palabras por categoría</label>
                <select class="vw-select" id="vw-pertype">
                    ${[3, 4, 5, 6].map(n =>
                        `<option value="${n}" ${n === s.per_type ? 'selected' : ''}>${n} · ${n * 7} en total</option>`
                    ).join('')}
                </select>
            </div>
            <button type="button" class="vw-btn vw-btn-ghost" id="vw-shuffle">🔄 Otras palabras</button>
            <p class="vw-meta">
                <strong>${s.total}</strong> palabras · debes usar al menos <strong>${s.required}</strong>
                <span class="vw-hint-inline">· pasa el mouse (o toca) para ver la traducción</span>
            </p>
        </div>

        <div class="vw-groups" id="vw-groups">
            ${s.buckets.map(renderBucket).join('')}
        </div>

        <div class="vw-progress-row">
            <div class="vw-progress"><div class="vw-progress-fill" id="vw-progress-fill"></div></div>
            <span class="vw-progress-label" id="vw-progress-label">0 / ${s.required} palabras usadas</span>
        </div>

        ${state.mapa ? mapaPanelHTML() : ''}

        <textarea class="vw-textarea" id="vw-textarea" rows="12" spellcheck="false"
            placeholder="Escribe tu texto en inglés sobre el tema de arriba, usando las palabras de la lista…">${esc(draft)}</textarea>

        <div class="vw-footer">
            <span class="vw-counter" id="vw-counter">0 / ${s.max_words} palabras</span>
            <div class="vw-footer-actions">
                <button type="button" class="vw-btn vw-btn-ghost" id="vw-clear">Limpiar</button>
                <button type="button" class="vw-btn vw-btn-primary" id="vw-submit">Evaluar texto</button>
            </div>
        </div>
        <p class="vw-note" id="vw-note"></p>
    `;

    wireBody(root);
}

function renderBucket(b) {
    if (!b.words.length) {
        return `<div class="vw-group">
            <div class="vw-group-head"><span>${b.icon} ${esc(b.label)}</span></div>
            <p class="vw-group-empty">Todavía no tienes palabras de esta categoría.</p>
        </div>`;
    }
    return `<div class="vw-group">
        <div class="vw-group-head">
            <span>${b.icon} ${esc(b.label)}</span>
            <span class="vw-group-count" data-pos="${b.pos}">0/${b.words.length}</span>
        </div>
        <div class="vw-group-grid">
            ${b.words.map(w => `
                <button type="button" class="vw-chip" data-id="${w.id}" draggable="false"
                        title="Pasa el mouse para ver la traducción">
                    <span class="vw-en">${esc(w.word)}</span>
                    <span class="vw-es">${esc(w.translations.join(' · '))}</span>
                    <span class="vw-tick">✓</span>
                </button>`).join('')}
        </div>
    </div>`;
}

function wireBody(root) {
    const s = state.session;
    const ta = root.querySelector('#vw-textarea');
    const counter = root.querySelector('#vw-counter');
    const fill = root.querySelector('#vw-progress-fill');
    const label = root.querySelector('#vw-progress-label');
    const submitBtn = root.querySelector('#vw-submit');
    const note = root.querySelector('#vw-note');

    // Mapa id→chip, construido UNA vez: el marcado en vivo solo alterna clases,
    // nunca re-renderiza (eso mataría el foco y el cursor del textarea).
    const chips = new Map();
    root.querySelectorAll('.vw-chip').forEach(el => chips.set(Number(el.dataset.id), el));
    const words = allWords();

    // ── Traducción en táctil: un solo listener delegado, no 42 ──
    const grid = root.querySelector('#vw-groups');
    grid.addEventListener('click', e => {
        const chip = e.target.closest('.vw-chip');
        if (!chip) return;
        const abierto = chip.classList.contains('is-open');
        grid.querySelectorAll('.vw-chip.is-open').forEach(c => c.classList.remove('is-open'));
        chip.classList.toggle('is-open', !abierto);
    });

    // ── Contador (síncrono) + detección (con respiro) ──
    let timer = null;
    function countWords(text) {
        const t = text.trim();
        return t ? t.split(/\s+/).length : 0;
    }
    function updateCounter() {
        const n = countWords(ta.value);
        counter.textContent = `${n} / ${s.max_words} palabras`;
        const excede = n > s.max_words;
        counter.classList.toggle('is-over', excede);
        submitBtn.disabled = excede || state.loading;
        return n;
    }
    function updateUsage() {
        const tokens = tokenize(ta.value);
        let usadas = 0;
        const porPos = {};
        for (const w of words) {
            const ok = isUsed(w.match, tokens);
            if (ok) {
                usadas++;
                porPos[w.pos] = (porPos[w.pos] || 0) + 1;
            }
            chips.get(w.id)?.classList.toggle('is-used', ok);
        }
        root.querySelectorAll('.vw-group-count').forEach(el => {
            const pos = el.dataset.pos;
            const total = words.filter(w => w.pos === pos).length;
            el.textContent = `${porPos[pos] || 0}/${total}`;
            el.classList.toggle('is-done', (porPos[pos] || 0) > 0);
        });
        const pct = s.required ? Math.min(100, (usadas / s.required) * 100) : 0;
        fill.style.width = `${pct}%`;
        fill.classList.toggle('is-full', usadas >= s.required);
        label.textContent = usadas >= s.required
            ? `${usadas} / ${s.required} ✓ mínimo cumplido`
            : `${usadas} / ${s.required} palabras usadas`;
    }

    ta.addEventListener('input', () => {
        updateCounter();
        localStorage.setItem(DRAFT_KEY, ta.value);
        clearTimeout(timer);
        timer = setTimeout(updateUsage, 160);
    });

    // ── Escribir a mano, no pegar ──
    // El objetivo del ejercicio es teclear la palabra (mecanizarla). Es un
    // badén, no un candado: quien quiera saltárselo puede, pero solo se
    // engañaría a sí mismo.
    ta.addEventListener('paste', e => {
        e.preventDefault();
        toast('Pegar no: la idea es escribirlo a mano ✍️', 'error');
    });
    ta.addEventListener('drop', e => e.preventDefault());

    updateCounter();
    updateUsage();

    root.querySelector('#vw-clear').addEventListener('click', () => {
        if (!ta.value.trim() || confirm('¿Borrar el texto escrito?')) {
            ta.value = '';
            localStorage.removeItem(DRAFT_KEY);
            updateCounter();
            updateUsage();
            ta.focus();
        }
    });

    // ── Otro tema: los 100 se piden una vez y se cachean ──
    root.querySelector('#vw-newtopic').addEventListener('click', async () => {
        try {
            if (!state.topics) state.topics = (await api.vocabWriting.topics()).topics;
            const pool = state.topics.filter(t => t.id !== s.topic.id);
            s.topic = pool[Math.floor(Math.random() * pool.length)] || s.topic;
            root.querySelector('.vw-area').textContent = s.topic.area;
            root.querySelector('.vw-topic-title').textContent = s.topic.title;
            root.querySelector('.vw-topic-hint').textContent = s.topic.hint_es;
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    root.querySelector('#vw-pertype').addEventListener('change', async e => {
        const n = parseInt(e.target.value) || 5;
        localStorage.setItem(PER_TYPE_KEY, String(n));
        state.perType = n;
        await reloadWords(root);
    });

    root.querySelector('#vw-shuffle').addEventListener('click', () => reloadWords(root));

    submitBtn.addEventListener('click', () => submit(root));

    if (s.daily_used >= s.daily_limit) {
        note.textContent = `Llegaste al límite de ${s.daily_limit} textos por hoy.`;
    }
}

async function reloadWords(root) {
    const body = root.querySelector('#vw-body');
    const texto = root.querySelector('#vw-textarea')?.value || '';
    body.classList.add('is-busy');
    try {
        const fresh = await api.vocabWriting.session(state.perType, state.session.topic.id);
        fresh.topic = state.session.topic;      // cambiar palabras no cambia el tema
        state.session = fresh;
        renderBody(root);
        const ta = root.querySelector('#vw-textarea');
        if (ta) { ta.value = texto; ta.dispatchEvent(new Event('input')); }
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        body.classList.remove('is-busy');
    }
}

// ── Envío y resultado ────────────────────────────────────────────────────────
async function submit(root) {
    const ta = root.querySelector('#vw-textarea');
    const btn = root.querySelector('#vw-submit');
    const note = root.querySelector('#vw-note');
    const texto = (ta?.value || '').trim();
    if (!texto) { ta?.focus(); return; }

    state.loading = true;
    btn.disabled = true;
    btn.textContent = 'Evaluando…';
    note.textContent = 'La IA está leyendo tu texto. Esto toma unos segundos.';

    try {
        const res = await api.vocabWriting.submit({
            topic: state.session.topic.title,
            topic_id: state.session.topic.id,
            per_type: state.session.per_type,
            word_ids: allWords().map(w => w.id),
            user_text: texto,
            attempt: state.attempt,
        });
        state.result = res;
        state.lastText = texto;
        state.mapa = mapaHTML(texto, res);
        localStorage.removeItem(DRAFT_KEY);
        // Primer intento: solo se marca DÓNDE falló, para poder volver a
        // intentarlo. Si ya es el reintento (o no hay nada que corregir), se
        // revela la corrección completa.
        const nadaQueCorregir = !res.spelling_errors.length
            && !res.words.some(w => w.status === 'wrong' || w.status === 'awkward');
        renderResult(root, res, state.attempt >= 2 || nadaQueCorregir);
        loadHistory(root);
    } catch (err) {
        note.textContent = '';
        toast(err.message, 'error');
        btn.textContent = 'Evaluar texto';
        btn.disabled = false;
    } finally {
        state.loading = false;
    }
}

// ── Mapa de errores (segundo intento) ────────────────────────────────────────
// Marca DÓNDE estuvo cada fallo sobre el propio texto del usuario, sin decir
// cuál era la forma correcta: la idea es volver a intentarlo, no copiar la
// solución. La corrección completa se revela recién en el segundo intento.
function mapaHTML(texto, res) {
    const orto = new Set(res.spelling_errors.map(e => e.word.toLowerCase().replace(/’/g, "'")));
    const porVariante = new Map();          // forma flexionada → estado
    const matchPorId = new Map(allWords().map(w => [w.id, w.match]));
    for (const w of res.words) {
        if (w.status !== 'wrong' && w.status !== 'awkward') continue;
        for (const grupo of (matchPorId.get(w.id)?.groups || [])) {
            for (const v of grupo) porVariante.set(v, w.status);
        }
    }
    const clase = tok => {
        const low = tok.toLowerCase().replace(/’/g, "'");
        if (orto.has(low)) return 'sp';
        if (porVariante.has(low)) return porVariante.get(low) === 'wrong' ? 'bad' : 'warn';
        for (const parte of low.split('-')) {
            if (parte.length >= 2 && porVariante.has(parte)) {
                return porVariante.get(parte) === 'wrong' ? 'bad' : 'warn';
            }
        }
        return null;
    };

    let out = '', last = 0, m;
    const re = /[A-Za-z][A-Za-z'’\-]*/g;
    while ((m = re.exec(texto)) !== null) {
        const cls = clase(m[0]);
        if (!cls) continue;
        out += esc(texto.slice(last, m.index)) + `<mark class="vw-mark vw-mark-${cls}">${esc(m[0])}</mark>`;
        last = m.index + m[0].length;
    }
    return out + esc(texto.slice(last));
}

function mapaPanelHTML() {
    return `<div class="vw-mapa">
        <div class="vw-mapa-head">
            <span>🔎 Dónde estuvieron los fallos — intento ${state.attempt - 1}</span>
            <span class="vw-legend">
                <i class="vw-mark vw-mark-bad">mal usada</i>
                <i class="vw-mark vw-mark-warn">forzada</i>
                <i class="vw-mark vw-mark-sp">ortografía</i>
            </span>
        </div>
        <div class="vw-mapa-text">${state.mapa}</div>
        <p class="vw-mapa-foot">Corrige tu texto abajo y vuelve a enviarlo. La corrección completa se muestra después de este intento.</p>
    </div>`;
}

const STATUS_META = {
    correct: { label: 'Bien usadas',        icon: '✓', cls: 'ok' },
    awkward: { label: 'Forzadas',           icon: '≈', cls: 'warn' },
    wrong:   { label: 'Mal usadas',         icon: '✗', cls: 'bad' },
    missing: { label: 'Sin usar',           icon: '·', cls: 'off' },
};

function cabeceraHTML(res) {
    const previa = state.scorePrevia != null
        ? `<span class="vw-score-prev" title="Nota del primer intento">antes ${state.scorePrevia.toFixed(1)}
             <b>${res.score > state.scorePrevia ? '↑' : res.score < state.scorePrevia ? '↓' : '='}</b></span>`
        : '';
    return `
        <div class="vw-result-head">
            <div class="vw-score" style="--c:${scoreColor(res.score)}">
                <span class="vw-score-num">${res.score.toFixed(1)}</span>
                <span class="vw-score-max">/ 5</span>
            </div>
            ${previa}
            <div class="vw-result-stats">
                <div class="vw-stat ${res.coverage_met ? 'ok' : 'bad'}">
                    <span class="vw-stat-num">${res.used_count}/${res.required}</span>
                    <span class="vw-stat-lbl">palabras usadas${res.coverage_met ? ' ✓' : ' — mínimo no alcanzado'}</span>
                </div>
                <div class="vw-stat ${res.spelling_errors.length ? 'warn' : 'ok'}">
                    <span class="vw-stat-num">${res.spelling_errors.length}</span>
                    <span class="vw-stat-lbl">errores de ortografía</span>
                </div>
                <div class="vw-stat">
                    <span class="vw-stat-num">${res.word_count}</span>
                    <span class="vw-stat-lbl">palabras escritas</span>
                </div>
            </div>
        </div>`;
}

// ── Resultado del PRIMER intento: dónde falló, no cómo se arregla ────────────
// Ni la ortografía correcta ni el comentario de la IA (que suele contener la
// forma buena) se muestran todavía. Se ve el mapa sobre el propio texto y la
// lista de palabras a revisar; con eso hay que volver a intentarlo.
function renderIntento(root, res) {
    const body = root.querySelector('#vw-body');
    const malas = res.words.filter(w => w.status === 'wrong');
    const forzadas = res.words.filter(w => w.status === 'awkward');
    const faltantes = res.words.filter(w => w.status === 'missing');
    const total = malas.length + forzadas.length + res.spelling_errors.length;

    const lista = (titulo, cls, items) => items.length ? `
        <div class="vw-res-group">
            <h4 class="vw-h4 ${cls}">${titulo} <span>(${items.length})</span></h4>
            <div class="vw-boost-list">
                ${items.map(w => `<span class="vw-chip-flat ${cls}">${esc(w.word || w)}</span>`).join('')}
            </div>
        </div>` : '';

    body.innerHTML = `
        <div class="vw-result">
            ${cabeceraHTML(res)}
            <p class="vw-reason">${total
                ? `Encontré <strong>${total}</strong> ${total === 1 ? 'cosa' : 'cosas'} por corregir. Te marco <strong>dónde</strong>, no cómo: arréglalo tú y vuelve a enviarlo.`
                : 'No hay fallos de uso ni de ortografía. Revisa si te faltaron palabras por incluir.'}</p>

            <div class="vw-mapa">
                <div class="vw-mapa-head">
                    <span>🔎 Tu texto, con los fallos marcados</span>
                    <span class="vw-legend">
                        <i class="vw-mark vw-mark-bad">mal usada</i>
                        <i class="vw-mark vw-mark-warn">forzada</i>
                        <i class="vw-mark vw-mark-sp">ortografía</i>
                    </span>
                </div>
                <div class="vw-mapa-text">${state.mapa}</div>
            </div>

            ${lista('✗ Revisa cómo usaste estas', 'bad', malas)}
            ${lista('≈ Estas suenan forzadas', 'warn', forzadas)}
            ${lista('✎ Revisa la ortografía de', 'warn', res.spelling_errors)}
            ${lista('· No usaste', 'off', faltantes)}

            <div class="vw-result-actions">
                <button type="button" class="vw-btn vw-btn-primary" id="vw-retry">✍️ Intentar de nuevo</button>
                <button type="button" class="vw-btn vw-btn-ghost" id="vw-reveal">Ver la corrección completa</button>
                <button type="button" class="vw-btn vw-btn-ghost" id="vw-again">Empezar otro texto</button>
            </div>
        </div>
    `;

    body.querySelector('#vw-retry').addEventListener('click', () => {
        state.attempt = 2;
        state.scorePrevia = res.score;
        localStorage.setItem(DRAFT_KEY, state.lastText || '');
        renderBody(root);
        root.querySelector('#vw-textarea')?.focus();
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    body.querySelector('#vw-reveal').addEventListener('click', () => renderResult(root, res, true));
    body.querySelector('#vw-again').addEventListener('click', () => nuevoEjercicio(root));
}

function renderResult(root, res, revelar) {
    if (!revelar) return renderIntento(root, res);

    const body = root.querySelector('#vw-body');
    const grupos = ['correct', 'awkward', 'wrong', 'missing']
        .map(st => [st, res.words.filter(w => w.status === st)])
        .filter(([, ws]) => ws.length);

    const boosts = res.words.filter(w => w.mastery_new != null && w.mastery_new > (w.mastery_old ?? 0));

    body.innerHTML = `
        <div class="vw-result">
            ${cabeceraHTML(res)}

            ${res.score_reason_es ? `<p class="vw-reason">${esc(res.score_reason_es)}</p>` : ''}
            ${res.feedback_es ? `<p class="vw-feedback">${esc(res.feedback_es)}</p>` : ''}

            ${boosts.length ? `
                <div class="vw-boosts">
                    <h4 class="vw-h4">📈 Dominio que subió</h4>
                    <div class="vw-boost-list">
                        ${boosts.map(w => `
                            <span class="vw-boost">
                                ${esc(w.word)}
                                <em>${(w.mastery_old ?? 0).toFixed(0)} → ${w.mastery_new.toFixed(0)}</em>
                            </span>`).join('')}
                    </div>
                </div>` : ''}

            ${grupos.map(([st, ws]) => `
                <div class="vw-res-group">
                    <h4 class="vw-h4 ${STATUS_META[st].cls}">${STATUS_META[st].icon} ${STATUS_META[st].label} <span>(${ws.length})</span></h4>
                    <ul class="vw-res-list">
                        ${ws.map(w => `
                            <li class="vw-res-item ${STATUS_META[st].cls}">
                                <span class="vw-res-word">${esc(w.word)}</span>
                                ${w.comment_es ? `<span class="vw-res-note">${esc(w.comment_es)}</span>` : ''}
                                ${w.mastery_new == null && (st === 'correct' || st === 'awkward')
                                    ? '<span class="vw-res-note">ya la practicaste hoy — no vuelve a subir</span>' : ''}
                            </li>`).join('')}
                    </ul>
                </div>`).join('')}

            ${res.spelling_errors.length ? `
                <div class="vw-res-group">
                    <h4 class="vw-h4 warn">✎ Ortografía</h4>
                    <ul class="vw-res-list">
                        ${res.spelling_errors.map(e => `
                            <li class="vw-res-item warn">
                                <span class="vw-res-word"><s>${esc(e.word)}</s> → <strong>${esc(e.suggestion || '?')}</strong></span>
                                ${e.note_es ? `<span class="vw-res-note">${esc(e.note_es)}</span>` : ''}
                            </li>`).join('')}
                    </ul>
                </div>` : ''}

            ${res.encouragement_es ? `<p class="vw-cheer">${esc(res.encouragement_es)}</p>` : ''}

            <div class="vw-result-actions">
                <button type="button" class="vw-btn vw-btn-primary" id="vw-again">Escribir otro texto</button>
                <button type="button" class="vw-btn vw-btn-ghost" id="vw-seetext">Ver mi texto</button>
            </div>
            <pre class="vw-mytext" id="vw-mytext" hidden></pre>
        </div>
    `;

    const texto = state.lastText || '';
    body.querySelector('#vw-seetext').addEventListener('click', e => {
        const pre = body.querySelector('#vw-mytext');
        pre.hidden = !pre.hidden;
        e.target.textContent = pre.hidden ? 'Ver mi texto' : 'Ocultar mi texto';
    });
    body.querySelector('#vw-mytext').textContent = texto;

    body.querySelector('#vw-again').addEventListener('click', () => nuevoEjercicio(root));
}

// Empezar de cero: otro tema, otras palabras y el contador de intentos a 1.
async function nuevoEjercicio(root) {
    const host = root.parentElement;
    state.result = null;
    state.session = null;
    state.attempt = 1;
    state.mapa = null;
    state.scorePrevia = null;
    state.lastText = '';
    localStorage.removeItem(DRAFT_KEY);
    await mount(host);
    host?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
