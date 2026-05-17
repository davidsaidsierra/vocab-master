// ── Writing Challenge — escribe un texto, IA lo corrige ─────
//
// Flujo:
//   1. Cliente elige aleatoriamente un topic de englishClass.WEEKS
//      (sin gastar Groq) y pide 3-5 palabras al backend.
//   2. Usuario escribe (max 150 palabras / ~1500 chars).
//   3. Submit → 1 sola llamada a Groq → corrección + boost de mastery
//      en palabras usadas correctamente.
//
// Rate-limited a 10 envíos/día por el backend.

import { writing as api, words as wordsApi } from '../api.js';
import { WEEKS } from './englishClass.js';
import { openPicker } from './grammarPicker.js';

const MAX_CHARS = 5000;
const STORAGE_KEY = 'vocabmaster_writing_state';

// ── Helpers ────────────────────────────────────────────────
function flattenTopics() {
    const all = [];
    for (const week of WEEKS) {
        for (const t of week.topics) {
            all.push({ ...t, weekLabel: week.label });
        }
    }
    return all;
}

function pickRandomTopic(exclude = null) {
    const all = flattenTopics();
    const pool = exclude ? all.filter(t => t.title !== exclude) : all;
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function topicToHint(topic) {
    if (!topic) return '';
    const examples = [];
    for (const g of (topic.groups || []).slice(0, 3)) {
        for (const it of (g.items || []).slice(0, 1)) {
            const plain = String(it.example || '').replace(/<[^>]+>/g, '');
            if (plain) examples.push(`- ${g.name}: ${plain}`);
        }
    }
    return [topic.intro || '', ...examples].filter(Boolean).join('\n');
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}
function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { return null; }
}
function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// ── State (per-render) ─────────────────────────────────────
let state = {
    topic: null,        // { icon, title, subtitle, intro, groups, weekLabel }
    topicSlug: null,    // si está set, submit dispara V2 flow (KB-grounded)
    words: [],          // [{ id, word, translation, mastery_level }]
    existingWordsLc: new Set(),  // lowercased words ya guardadas, para dedup de vocab suggestions
    dailyUsed: 0,
    dailyLimit: 10,
    text: '',
    loading: false,
    result: null,       // backend response after submit
    error: '',
};

// Convierte un GrammarTopic del KB al shape que esperan topicCardHTML / topicToHint.
// La intro se sintetiza de las primeras líneas del content_md (sin markdown ruidoso).
function kbTopicToCardShape(kb) {
    const stripped = String(kb.content_md || '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/^#+\s*/gm, '')
        .trim();
    const intro = stripped.split('\n').filter(l => l.trim()).slice(0, 2).join(' ').slice(0, 280);
    return {
        icon: '📚',
        title: kb.title,
        subtitle: [kb.category, kb.level].filter(Boolean).join(' · '),
        intro,
        groups: [],
        weekLabel: `Knowledge Base · Sección ${String(kb.section_number).padStart(3, '0')}`,
    };
}

// ── Render ─────────────────────────────────────────────────
function badgeColors(score) {
    if (score >= 85) return { bg: '#34c759', label: 'Excellent' };
    if (score >= 70) return { bg: '#0071e3', label: 'Great' };
    if (score >= 50) return { bg: '#ff9500', label: 'Good progress' };
    return { bg: '#ff3b30', label: 'Keep practicing' };
}

function topicCardHTML(t) {
    if (!t) return '<div class="wc-topic-card"><em>No grammar topic available.</em></div>';
    const groupChips = (t.groups || []).slice(0, 4).map(g =>
        `<span class="wc-chip" style="--wc-chip:${g.color || '#0071e3'}">${escapeHtml(g.name)}</span>`
    ).join('');
    return `
        <div class="wc-topic-card">
            <div class="wc-topic-head">
                <span class="wc-topic-icon">${t.icon || '📝'}</span>
                <div>
                    <div class="wc-topic-title">${escapeHtml(t.title)}</div>
                    <div class="wc-topic-sub">${escapeHtml(t.subtitle || '')}</div>
                </div>
            </div>
            ${t.intro ? `<p class="wc-topic-intro">${escapeHtml(t.intro)}</p>` : ''}
            ${groupChips ? `<div class="wc-chips">${groupChips}</div>` : ''}
            <div class="wc-week-label">${escapeHtml(t.weekLabel || '')}</div>
        </div>
    `;
}

function wordsCardHTML(words) {
    if (!words || !words.length) {
        return `
            <div class="wc-words-card">
                <h4>Target Words</h4>
                <p style="color:var(--text-secondary);font-size:0.9rem;margin:0">
                    Aún no tienes palabras guardadas. <a href="#/add" style="color:var(--accent)">Agrega algunas</a> para que aparezcan en los retos.
                </p>
            </div>
        `;
    }
    const items = words.map(w => `
        <div class="wc-word-item">
            <div>
                <strong>${escapeHtml(w.word)}</strong>
                <div class="wc-word-trans">${escapeHtml(w.translation)}</div>
            </div>
            <div class="wc-mastery" title="Mastery">
                <div class="wc-mastery-bar"><div style="width:${Math.max(0, Math.min(100, w.mastery_level || 0))}%"></div></div>
                <span>${Math.round(w.mastery_level || 0)}</span>
            </div>
        </div>
    `).join('');
    return `
        <div class="wc-words-card">
            <h4>Target Words <span class="wc-tag">úsalas todas</span></h4>
            ${items}
        </div>
    `;
}

function dailyCounterHTML() {
    const used = state.dailyUsed || 0;
    const limit = state.dailyLimit || 10;
    const left = Math.max(0, limit - used);
    const pct = Math.min(100, (used / limit) * 100);
    return `
        <div class="wc-daily">
            <div class="wc-daily-text">
                <strong>${used}/${limit}</strong> retos hoy · ${left} restantes
            </div>
            <div class="wc-daily-bar"><div style="width:${pct}%"></div></div>
        </div>
    `;
}

function resultHTML(r) {
    if (!r) return '';
    const { bg, label } = badgeColors(r.score || 0);
    const errorsHTML = (r.errors || []).map(e => `
        <div class="wc-error">
            <div class="wc-error-row">
                <span class="wc-err-tag">${escapeHtml(e.type || 'fix')}</span>
                <span class="wc-err-orig">${escapeHtml(e.original || '')}</span>
                <span class="wc-err-arrow">→</span>
                <span class="wc-err-fix">${escapeHtml(e.fix || '')}</span>
            </div>
            ${e.explanation_es ? `<div class="wc-err-exp">${escapeHtml(e.explanation_es)}</div>` : ''}
            ${e.reference_quote ? `<div class="wc-reference-quote">📖 ${escapeHtml(e.reference_quote)}</div>` : ''}
        </div>
    `).join('') || '<p style="color:var(--text-secondary);font-size:0.9rem;margin:0">¡Sin errores! 🎉</p>';

    const vocabSuggestionsHTML = (r.vocabulary_suggestions || []).map(v => {
        const exists = state.existingWordsLc.has(String(v.word || '').trim().toLowerCase());
        return `
            <div class="wc-vocab-item">
                <div class="wc-vocab-info">
                    <strong>${escapeHtml(v.word || '')}</strong>
                    ${v.reason_es ? `<div class="wc-vocab-reason">${escapeHtml(v.reason_es)}</div>` : ''}
                    ${v.example_en ? `<div class="wc-vocab-example">${escapeHtml(v.example_en)}</div>` : ''}
                </div>
                ${exists
                    ? `<span class="wc-vocab-saved">✓ ya guardada</span>`
                    : `<button class="btn-ghost wc-vocab-add" data-word="${escapeHtml(v.word || '')}" data-example="${escapeHtml(v.example_en || '')}">+ Agregar</button>`
                }
            </div>
        `;
    }).join('');

    const wordsUsed = (r.words_used_correctly || []).map(w =>
        `<span class="wc-chip wc-chip-ok">${escapeHtml(w)}</span>`
    ).join('') || '<span style="color:var(--text-tertiary);font-size:0.85rem">— ninguna —</span>';

    const gtu = r.grammar_topic_usage || { used: r.grammar_used_correctly ? 'yes' : 'no', variant_used: '', explanation_es: '' };
    const usageBadge = (() => {
        if (gtu.used === 'yes')     return '<span class="wc-pill wc-pill-ok">✓ usada</span>';
        if (gtu.used === 'partial') return '<span class="wc-pill wc-pill-partial">~ variante usada</span>';
        return '<span class="wc-pill wc-pill-warn">no usada</span>';
    })();
    const boosts = (r.mastery_boosts || []).map(b =>
        `<li><strong>${escapeHtml(b.word)}</strong>: ${Math.round(b.old)} → <strong style="color:#34c759">${Math.round(b.new)}</strong></li>`
    ).join('');

    return `
        <div class="wc-result">
            <div class="wc-score" style="--wc-score-bg:${bg}">
                <div class="wc-score-num">${r.score || 0}</div>
                <div class="wc-score-label">${label}</div>
            </div>

            <div class="wc-encourage">${escapeHtml(r.encouragement_es || '¡Sigue así!')}</div>

            <div class="wc-section">
                <h4>Texto corregido</h4>
                <div class="wc-corrected">${escapeHtml(r.corrected || '')}</div>
            </div>

            <div class="wc-section">
                <h4>Errores y correcciones</h4>
                <div class="wc-errors">${errorsHTML}</div>
            </div>

            <div class="wc-grid-2">
                <div class="wc-section">
                    <h4>Gramática objetivo ${usageBadge}</h4>
                    ${gtu.variant_used ? `<div class="wc-variant">Variante: <code>${escapeHtml(gtu.variant_used)}</code></div>` : ''}
                    ${gtu.explanation_es ? `<p class="wc-feedback">${escapeHtml(gtu.explanation_es)}</p>` : ''}
                    ${r.grammar_feedback_es && r.grammar_feedback_es !== gtu.explanation_es ? `<p class="wc-feedback">${escapeHtml(r.grammar_feedback_es)}</p>` : ''}
                </div>
                <div class="wc-section">
                    <h4>Palabras usadas correctamente</h4>
                    <div class="wc-chips">${wordsUsed}</div>
                </div>
            </div>

            ${boosts ? `
                <div class="wc-section wc-boosts">
                    <h4>📈 Mastery boost</h4>
                    <ul>${boosts}</ul>
                </div>
            ` : ''}

            ${vocabSuggestionsHTML ? `
                <div class="wc-section wc-vocab-suggestions">
                    <h4>💡 Vocabulario sugerido <span class="wc-tag">de tu texto</span></h4>
                    ${vocabSuggestionsHTML}
                </div>
            ` : ''}

            <div class="wc-actions">
                <button class="btn-secondary" id="wc-new-challenge">Nuevo reto</button>
            </div>
        </div>
    `;
}

function pageHTML() {
    const limitReached = state.dailyUsed >= state.dailyLimit;
    const submitDisabled = state.loading || !state.text.trim() || limitReached;

    return `
        <div class="page-enter" style="max-width:1100px;margin:0 auto">
            <div style="margin-bottom:1.5rem">
                <h2 class="text-2xl font-bold" style="margin-bottom:0.4rem">Writing Challenge</h2>
                <p style="color:var(--text-secondary);font-size:0.9rem">
                    Escribe un texto corto usando una estructura gramatical de tu clase y las palabras objetivo. La IA lo corrige y sube tu mastery por cada palabra usada correctamente.
                </p>
            </div>

            ${dailyCounterHTML()}

            <div class="wc-grid">
                ${topicCardHTML(state.topic)}
                ${wordsCardHTML(state.words)}
            </div>

            <div class="wc-write-card">
                <div class="wc-write-head">
                    <h4>Tu texto</h4>
                    <span class="wc-counter" id="wc-counter">${state.text.length}/${MAX_CHARS}</span>
                </div>
                <textarea id="wc-textarea" class="wc-textarea" placeholder="Escribe aquí (60–150 palabras). Trata de usar la estructura gramatical y las palabras objetivo..." maxlength="${MAX_CHARS}" ${state.loading ? 'disabled' : ''}>${escapeHtml(state.text)}</textarea>
                <div class="wc-actions">
                    <button id="wc-shuffle" class="btn-ghost" ${state.loading ? 'disabled' : ''}>🎲 Cambiar tema</button>
                    <button id="wc-pick"    class="btn-ghost" ${state.loading ? 'disabled' : ''}>📚 Elegir del KB</button>
                    <button id="wc-submit" class="btn-primary" ${submitDisabled ? 'disabled' : ''}>
                        ${state.loading ? 'Corrigiendo…' : (limitReached ? 'Límite diario alcanzado' : 'Corregir con IA')}
                    </button>
                </div>
                ${state.error ? `<div class="wc-error-msg">${escapeHtml(state.error)}</div>` : ''}
            </div>

            <div id="wc-result-mount">${resultHTML(state.result)}</div>
        </div>
    `;
}

// ── Mount + handlers ──────────────────────────────────────
let rootContainer = null;

function rerender() {
    if (!rootContainer) return;
    rootContainer.innerHTML = pageHTML();
    bindHandlers();
}

function bindHandlers() {
    const textarea = document.getElementById('wc-textarea');
    const counter  = document.getElementById('wc-counter');
    const submit   = document.getElementById('wc-submit');
    const shuffle  = document.getElementById('wc-shuffle');
    const newBtn   = document.getElementById('wc-new-challenge');

    if (textarea) {
        textarea.addEventListener('input', e => {
            state.text = e.target.value;
            if (counter) counter.textContent = `${state.text.length}/${MAX_CHARS}`;
            if (submit) {
                const limitReached = state.dailyUsed >= state.dailyLimit;
                submit.disabled = state.loading || !state.text.trim() || limitReached;
            }
            saveState({ topic: state.topic, words: state.words, text: state.text });
        });
    }

    if (submit) submit.addEventListener('click', onSubmit);
    if (shuffle) shuffle.addEventListener('click', onShuffle);
    if (newBtn)  newBtn.addEventListener('click', onNewChallenge);

    const pickBtn = document.getElementById('wc-pick');
    if (pickBtn) pickBtn.addEventListener('click', onPickFromKB);

    // "+ Agregar" en vocabulary suggestions
    document.querySelectorAll('.wc-vocab-add').forEach(btn => {
        btn.addEventListener('click', () => onAddVocab(btn));
    });
}

async function onPickFromKB() {
    try {
        const kbTopic = await openPicker();
        if (!kbTopic) return;
        state.topic = kbTopicToCardShape(kbTopic);
        state.topicSlug = kbTopic.slug;
        state.error = '';
        saveState({ topic: state.topic, topicSlug: state.topicSlug, words: state.words, text: state.text });
        rerender();
    } catch (err) {
        state.error = err && err.message ? err.message : 'Error al abrir el selector';
        rerender();
    }
}

async function onAddVocab(btn) {
    const word = btn.getAttribute('data-word') || '';
    const example = btn.getAttribute('data-example') || '';
    if (!word.trim()) return;
    btn.disabled = true;
    btn.textContent = 'Agregando…';
    try {
        await wordsApi.create({
            word: word.trim(),
            translation: '',  // el usuario podrá traducirla luego desde Words
            example: example || null,
            notes: 'Sugerencia automática desde Writing Challenge',
        });
        state.existingWordsLc.add(word.trim().toLowerCase());
        btn.outerHTML = `<span class="wc-vocab-saved">✓ guardada</span>`;
    } catch (err) {
        btn.disabled = false;
        btn.textContent = '+ Agregar';
        alert(err && err.message ? err.message : 'No se pudo guardar');
    }
}

async function onShuffle() {
    // Shuffle vuelve al flow V1: limpia el slug del KB para que submit no use V2.
    state.topic = pickRandomTopic(state.topic ? state.topic.title : null);
    state.topicSlug = null;
    state.error = '';
    saveState({ topic: state.topic, topicSlug: null, words: state.words, text: state.text });
    rerender();
}

async function onNewChallenge() {
    state.result = null;
    state.text = '';
    state.error = '';
    state.topic = pickRandomTopic(state.topic ? state.topic.title : null);
    state.topicSlug = null;
    clearState();
    rerender();
    await refreshWords();
}

async function onSubmit() {
    if (!state.text.trim()) return;
    state.loading = true;
    state.error = '';
    rerender();

    const payload = {
        grammar_topic: state.topic ? state.topic.title : 'General writing',
        grammar_hint: topicToHint(state.topic),
        target_word_ids: state.words.map(w => w.id),
        target_words: state.words.map(w => w.word),
        user_text: state.text.trim(),
    };
    if (state.topicSlug) payload.grammar_topic_slug = state.topicSlug;

    try {
        const result = await api.submit(payload);
        state.result = result;
        state.dailyUsed = result.daily_used || state.dailyUsed + 1;
        state.dailyLimit = result.daily_limit || state.dailyLimit;
        clearState();
    } catch (err) {
        state.error = err && err.message ? err.message : 'Error desconocido';
    } finally {
        state.loading = false;
        rerender();
        if (state.result) {
            const mount = document.getElementById('wc-result-mount');
            if (mount && mount.scrollIntoView) {
                mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
}

async function refreshWords() {
    try {
        const data = await api.words(4);
        state.words = data.words || [];
        state.dailyUsed = data.daily_used || 0;
        state.dailyLimit = data.daily_limit || 10;
    } catch (err) {
        state.error = err && err.message ? err.message : 'No se pudieron cargar las palabras';
    }
    rerender();
}

async function loadExistingWords() {
    // Carga las palabras del usuario una vez al montar, para marcar
    // "✓ ya guardada" en vocabulary_suggestions sin requerir backend dedup.
    try {
        const list = await wordsApi.list();
        const arr = Array.isArray(list) ? list : (list && list.words) || [];
        state.existingWordsLc = new Set(arr.map(w => String(w.word || '').trim().toLowerCase()));
    } catch (_) {
        state.existingWordsLc = new Set();
    }
}

export async function render(container) {
    rootContainer = container;
    state = {
        topic: null,
        topicSlug: null,
        words: [],
        existingWordsLc: new Set(),
        dailyUsed: 0,
        dailyLimit: 10,
        text: '',
        loading: false,
        result: null,
        error: '',
    };

    // Restaurar estado en progreso (topic + texto sin enviar) si existe
    const saved = loadState();
    if (saved && saved.topic) {
        state.topic = saved.topic;
        state.topicSlug = saved.topicSlug || null;
        state.text = saved.text || '';
        state.words = saved.words || [];
    } else {
        state.topic = pickRandomTopic();
    }

    rerender();
    await Promise.all([refreshWords(), loadExistingWords()]);
}
