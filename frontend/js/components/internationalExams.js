// ── International Exams — TOEFL Writing (práctica + simulación) ─────────────
//
// Sección de primer nivel. Maneja sus sub-vistas con estado interno (sin tocar
// el router por hash). De momento solo TOEFL → sección Writing, con dos modos:
//   - Practicar:   relajado, con timer libre, pistas y captura de palabras ES↔EN.
//   - Simulación:  fiel al examen real (3 tareas con sus tiempos), calificado por
//                  la LLM según las rúbricas oficiales (1 llamada Groq por ensayo).

import { exams as api, words as wordsApi, dictionary as dictApi } from '../api.js';
import { toast } from '../utils/helpers.js';
import {
    TASK_META, TASK_ORDER, CONNECTORS, EMAIL_POLITENESS, TEMPLATES,
} from '../toeflWriting.js';

// ── Utilidades ──────────────────────────────────────────────
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function wordCount(t) {
    const m = String(t || '').trim().match(/\S+/g);
    return m ? m.length : 0;
}
function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
function bandColor(band) {
    if (band == null) return 'var(--text-tertiary)';
    if (band >= 5) return 'var(--green)';
    if (band >= 4) return 'var(--accent)';
    if (band >= 3) return 'var(--orange)';
    return 'var(--red)';
}

// ── Estado del módulo ───────────────────────────────────────
let root = null;
let state = null;
let timerId = null;

function resetState() {
    state = {
        view: 'landing',         // landing | toeflHome | practiceSetup | practiceTask | simIntro | simTask | simResults
        exams: [],
        // práctica
        practice: null,          // { taskType, question, attemptId, response, orders, timeLeft, limitSec, evaluation }
        // simulación
        sim: null,               // { attemptId, questions:[], idx, responses:{}, orders:{}, timeLeft, results, finalize, grading }
        loading: false,
        error: '',
    };
}

function clearTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
}

function rerender() {
    if (!root) return;
    clearTimer();
    root.innerHTML = viewHTML();
    bindHandlers();
}

// ════════════════════════════════════════════════════════════
//  VIEWS
// ════════════════════════════════════════════════════════════
function viewHTML() {
    switch (state.view) {
        case 'landing':       return landingHTML();
        case 'toeflHome':     return toeflHomeHTML();
        case 'practiceSetup': return practiceSetupHTML();
        case 'practiceTask':  return practiceTaskHTML();
        case 'simIntro':      return simIntroHTML();
        case 'simTask':       return simTaskHTML();
        case 'simResults':    return simResultsHTML();
        default:              return landingHTML();
    }
}

function headerHTML(title, subtitle, backTo) {
    return `
        <div class="ie-head">
            ${backTo ? `<button class="btn-ghost ie-back" data-back="${backTo}">← Volver</button>` : ''}
            <div>
                <h2 class="text-2xl font-bold" style="margin-bottom:0.2rem">${esc(title)}</h2>
                ${subtitle ? `<p style="color:var(--text-secondary);font-size:0.9rem;margin:0">${esc(subtitle)}</p>` : ''}
            </div>
        </div>`;
}

// ── Landing: tarjetas de exámenes ───────────────────────────
function landingHTML() {
    const cards = (state.exams || []).map(e => {
        const sections = (e.sections || []).map(s =>
            `<span class="ie-pill ${s.available ? 'ie-pill-on' : ''}">${esc(s.label)}</span>`
        ).join('');
        return `
            <div class="ie-exam-card ${e.available ? '' : 'ie-disabled'}" ${e.available ? `data-exam="${esc(e.key)}"` : ''}>
                <div class="ie-exam-top">
                    <span class="ie-flag">${esc(e.flag || '🌐')}</span>
                    ${e.available ? '' : '<span class="ie-soon">Próximamente</span>'}
                </div>
                <h3 class="ie-exam-name">${esc(e.name)}</h3>
                <div class="ie-exam-meta">
                    <span>📍 ${esc(e.origin)}</span>
                    <span>⏱️ ${esc(e.total_duration)}</span>
                </div>
                <p class="ie-exam-desc">${esc(e.description || '')}</p>
                <div class="ie-pills">${sections}</div>
                ${e.available ? '<div class="ie-exam-cta">Entrar →</div>' : ''}
            </div>`;
    }).join('');

    return `
        <div class="page-enter" style="max-width:1100px;margin:0 auto">
            ${headerHTML('International Exams', 'Practica exámenes internacionales de inglés. De momento: TOEFL — sección Writing.', '')}
            ${state.error ? `<div class="wc-error-msg">${esc(state.error)}</div>` : ''}
            <div class="ie-exam-grid">${cards || '<p>Cargando…</p>'}</div>
        </div>`;
}

// ── TOEFL home: elegir modo ─────────────────────────────────
function toeflHomeHTML() {
    return `
        <div class="page-enter" style="max-width:900px;margin:0 auto">
            ${headerHTML('TOEFL iBT — Writing', 'Tres tareas: Build a Sentence, Write an Email y Write for an Academic Discussion (~23 min).', 'landing')}
            <div class="ie-mode-grid">
                <div class="ie-mode-card" data-mode="practice">
                    <span class="ie-mode-icon">🛠️</span>
                    <h3>Practicar</h3>
                    <p>Elige una tarea, define tu tiempo, usa pistas (conectores y templates) y captura vocabulario ES↔EN. Calificación opcional.</p>
                    <div class="ie-mode-cta">Practicar →</div>
                </div>
                <div class="ie-mode-card ie-mode-real" data-mode="simulation">
                    <span class="ie-mode-icon">🎯</span>
                    <h3>Simulación real</h3>
                    <p>Las 3 tareas en orden, con los tiempos oficiales y sin ayudas. La IA califica según las rúbricas oficiales de ETS.</p>
                    <div class="ie-mode-cta">Comenzar simulación →</div>
                </div>
            </div>
        </div>`;
}

// ── Práctica: configuración ─────────────────────────────────
function practiceSetupHTML() {
    const taskCards = TASK_ORDER.map(k => {
        const m = TASK_META[k];
        return `
            <label class="ie-task-pick">
                <input type="radio" name="ie-task" value="${k}" ${k === 'email' ? 'checked' : ''}>
                <div class="ie-task-pick-body">
                    <span class="ie-task-icon">${m.icon}</span>
                    <div>
                        <div class="ie-task-label">${esc(m.label)}</div>
                        <div class="ie-task-blurb">${esc(m.blurb)}</div>
                    </div>
                </div>
            </label>`;
    }).join('');

    return `
        <div class="page-enter" style="max-width:760px;margin:0 auto">
            ${headerHTML('Practicar — TOEFL Writing', 'Elige una tarea y tu tiempo. En práctica las ayudas están activas.', 'toeflHome')}
            <div class="card" style="margin-bottom:1rem">
                <h4 style="margin:0 0 0.75rem">1. Elige la tarea</h4>
                <div class="ie-task-picks">${taskCards}</div>
            </div>
            <div class="card" style="margin-bottom:1rem">
                <h4 style="margin:0 0 0.75rem">2. Tu tiempo (minutos)</h4>
                <div class="ie-time-row">
                    ${[5, 7, 10, 15, 20].map(n => `<button class="ie-time-chip ${n === 10 ? 'active' : ''}" data-min="${n}">${n}</button>`).join('')}
                    <input type="number" id="ie-time-custom" class="form-input" min="1" max="60" placeholder="otro" style="width:90px">
                </div>
            </div>
            <button class="btn-primary" id="ie-start-practice">Comenzar práctica</button>
        </div>`;
}

// ── Pistas (panel lateral en práctica) ──────────────────────
function pistasHTML(taskType) {
    const connectors = CONNECTORS.map(c => `
        <div class="ie-conn-group">
            <div class="ie-conn-fn">${esc(c.fn)}</div>
            <div class="ie-conn-items">${c.items.map(w => `<span class="ie-conn-chip">${esc(w)}</span>`).join('')}</div>
        </div>`).join('');

    const tpl = TEMPLATES[taskType];
    const tplBlock = tpl ? `
        <details class="ie-pistas-section">
            <summary>📐 Template</summary>
            <pre class="ie-template">${esc(tpl)}</pre>
            <button class="btn-ghost ie-use-template" data-tpl="${taskType}">Usar como base ✍️</button>
        </details>` : '';

    const politeness = taskType === 'email' ? `
        <details class="ie-pistas-section">
            <summary>🤝 Cortesía (hedging)</summary>
            <div class="ie-conn-items">${EMAIL_POLITENESS.map(p => `<span class="ie-conn-chip">${esc(p)}</span>`).join('')}</div>
        </details>` : '';

    return `
        <div class="ie-pistas">
            <h4 style="margin:0 0 0.5rem">💡 Pistas</h4>
            <details class="ie-pistas-section" open>
                <summary>🔗 Conectores de alto nivel</summary>
                ${connectors}
            </details>
            ${politeness}
            ${tplBlock}
            <details class="ie-pistas-section">
                <summary>➕ Captura de vocabulario</summary>
                ${addWordWidgetHTML()}
            </details>
        </div>`;
}

function addWordWidgetHTML() {
    return `
        <div class="ie-addword">
            <div class="ie-dir-toggle">
                <button class="ie-dir active" data-dir="es-en">ES → EN</button>
                <button class="ie-dir" data-dir="en-es">EN → ES</button>
            </div>
            <div class="ie-addword-input">
                <input type="text" id="ie-aw-input" class="form-input" placeholder="Escribe una palabra y Enter…" autocomplete="off">
            </div>
            <div class="ie-aw-hint" id="ie-aw-hint"></div>
        </div>`;
}

// ── Práctica: tarea activa ──────────────────────────────────
function practiceTaskHTML() {
    const p = state.practice;
    const m = TASK_META[p.taskType];
    const timer = `<span class="ie-timer" id="ie-timer">${fmtTime(p.timeLeft)}</span>`;

    let taskBody;
    if (p.taskType === 'build_sentence') {
        taskBody = buildSentenceHTML(p.question, p.orders, p.evaluation);
    } else {
        taskBody = essayHTML(p.taskType, p.question, p.response);
    }

    const evalBlock = p.evaluation
        ? `<div id="ie-eval-mount">${evaluationHTML(p.taskType, p.evaluation, p.band, p.rawScore)}</div>`
        : '<div id="ie-eval-mount"></div>';

    return `
        <div class="page-enter" style="max-width:1100px;margin:0 auto">
            ${headerHTML(`Práctica — ${m.label}`, p.taskType === 'build_sentence' ? m.blurb : (m.words_hint ? `Objetivo: ${m.words_hint}` : ''), 'practiceSetup')}
            <div class="ie-task-bar">
                <span class="ie-mode-tag">Práctica</span>
                ${timer}
                <button class="btn-ghost" id="ie-new-question">🎲 Otra pregunta</button>
            </div>
            <div class="ie-practice-grid">
                <div class="ie-practice-main">
                    ${taskBody}
                    <div class="ie-actions">
                        <button class="btn-primary" id="ie-evaluate">${p.taskType === 'build_sentence' ? 'Verificar respuestas' : 'Evaluar con IA'}</button>
                    </div>
                    ${state.error ? `<div class="wc-error-msg">${esc(state.error)}</div>` : ''}
                    ${evalBlock}
                </div>
                <aside class="ie-practice-side">
                    ${pistasHTML(p.taskType)}
                </aside>
            </div>
        </div>`;
}

// ── Build a Sentence UI (click-to-order, robusto en móvil) ──
function buildSentenceHTML(question, orders, evaluation) {
    const sentences = (question.payload && question.payload.sentences) || [];
    const details = evaluation && evaluation.details ? evaluation.details : null;

    const rows = sentences.map((s, i) => {
        const order = orders[i] || [];
        const used = new Set(order.map((w, idx) => idx + '::' + w));
        // banco = palabras de scrambled que no están en el orden (por posición)
        const bank = [];
        const orderCount = {};
        order.forEach(w => { orderCount[w] = (orderCount[w] || 0) + 1; });
        const seen = {};
        (s.scrambled || []).forEach((w, idx) => {
            seen[w] = (seen[w] || 0) + 1;
            if (seen[w] > (orderCount[w] || 0)) {
                bank.push({ w, idx });
            }
        });

        const det = details ? details[i] : null;
        const verdict = det ? (det.correct
            ? '<span class="ie-bs-ok">✓</span>'
            : `<span class="ie-bs-bad">✗</span>`) : '';
        const answerReveal = det && !det.correct
            ? `<div class="ie-bs-answer">Correcto: <strong>${esc(det.answer)}</strong></div>` : '';

        const answerChips = order.map((w, idx) =>
            `<span class="ie-chip ie-chip-ans" data-si="${i}" data-w="${esc(w)}" data-pos="${idx}">${esc(w)}</span>`
        ).join('') || '<span class="ie-bs-placeholder">toca las palabras en orden…</span>';

        const bankChips = bank.map(b =>
            `<span class="ie-chip ie-chip-bank" data-si="${i}" data-w="${esc(b.w)}">${esc(b.w)}</span>`
        ).join('') || '<span class="ie-bs-placeholder">— todas usadas —</span>';

        return `
            <div class="ie-bs-row ${det ? (det.correct ? 'ie-bs-row-ok' : 'ie-bs-row-bad') : ''}">
                <div class="ie-bs-num">${i + 1} ${verdict}</div>
                ${s.context ? `<div class="ie-bs-context">${esc(s.context)}</div>` : ''}
                <div class="ie-bs-answer-line" data-si="${i}">${answerChips}</div>
                <div class="ie-bs-bank" data-si="${i}">${bankChips}</div>
                ${answerReveal}
            </div>`;
    }).join('');

    return `<div class="ie-bs">${rows}</div>`;
}

// ── Essay UI (email / academic discussion) ──────────────────
function essayHTML(taskType, question, response) {
    const p = question.payload || {};
    let promptBlock = '';
    if (taskType === 'email') {
        const reqs = (p.requirements || []).map(r => `<li>${esc(r)}</li>`).join('');
        promptBlock = `
            <div class="ie-prompt">
                <div class="ie-prompt-scenario">${esc(p.scenario || '')}</div>
                <div class="ie-prompt-reqs"><strong>Incluye:</strong><ol>${reqs}</ol></div>
            </div>`;
    } else {
        const posts = (p.student_responses || []).map(r =>
            `<div class="ie-post"><strong>${esc(r.name || 'Student')}:</strong> ${esc(r.text || '')}</div>`
        ).join('');
        promptBlock = `
            <div class="ie-prompt">
                <div class="ie-prompt-prof"><strong>Professor:</strong> ${esc(p.professor_prompt || '')}</div>
                ${posts}
            </div>`;
    }

    const wc = wordCount(response);
    return `
        ${promptBlock}
        <div class="ie-write-head">
            <h4 style="margin:0">Tu respuesta</h4>
            <span class="ie-wc" id="ie-wc">${wc} palabras</span>
        </div>
        <textarea id="ie-essay" class="wc-textarea" placeholder="Escribe aquí tu respuesta…" maxlength="5000">${esc(response || '')}</textarea>`;
}

// ── Render del resultado de una tarea ───────────────────────
function evaluationHTML(taskType, ev, band, rawScore) {
    if (taskType === 'build_sentence') {
        return `
            <div class="ie-result">
                <div class="ie-score-row">
                    <div class="ie-band" style="--b:${bandColor(band)}">
                        <span class="ie-band-num">${ev.correct}/${ev.total}</span>
                        <span class="ie-band-label">frases correctas</span>
                    </div>
                    <div class="ie-band" style="--b:${bandColor(band)}">
                        <span class="ie-band-num">${band ?? '—'}</span>
                        <span class="ie-band-label">banda estimada</span>
                    </div>
                </div>
            </div>`;
    }

    const errors = (ev.errors || []).map(e => `
        <div class="wc-error">
            <div class="wc-error-row">
                <span class="wc-err-tag">${esc(e.type || 'fix')}</span>
                <span class="wc-err-orig">${esc(e.original || '')}</span>
                <span class="wc-err-arrow">→</span>
                <span class="wc-err-fix">${esc(e.fix || '')}</span>
            </div>
            ${e.explanation_es ? `<div class="wc-err-exp">${esc(e.explanation_es)}</div>` : ''}
        </div>`).join('') || '<p style="color:var(--text-secondary);font-size:0.9rem;margin:0">¡Sin errores! 🎉</p>';

    // Desglose por criterio (email) o descriptores (discussion)
    let breakdown = '';
    if (taskType === 'email' && ev.criteria) {
        const rows = Object.entries(ev.criteria).map(([k, v]) => `
            <div class="ie-crit">
                <span class="ie-crit-name">${esc(k.replace(/_/g, ' '))}</span>
                <span class="ie-crit-score">${v.score_0_5 ?? '—'}/5</span>
                ${v.comment_es ? `<span class="ie-crit-comment">${esc(v.comment_es)}</span>` : ''}
            </div>`).join('');
        const reqs = (ev.requirements_met || []).map(r =>
            `<li>${r.met ? '✅' : '❌'} ${esc(r.requirement || '')}${r.comment_es ? ` — <em>${esc(r.comment_es)}</em>` : ''}</li>`
        ).join('');
        breakdown = `
            <div class="wc-section"><h4>Criterios ETS</h4>${rows}</div>
            ${reqs ? `<div class="wc-section"><h4>Elementos requeridos</h4><ul class="ie-reqs">${reqs}</ul></div>` : ''}`;
    } else if (taskType === 'academic_discussion') {
        const desc = (ev.matched_descriptors || []).map(d => `<span class="wc-chip wc-chip-ok">${esc(d)}</span>`).join('');
        breakdown = `
            ${ev.rubric_justification_es ? `<div class="wc-section"><h4>Justificación de la banda</h4><p class="wc-feedback">${esc(ev.rubric_justification_es)}</p></div>` : ''}
            ${desc ? `<div class="wc-section"><h4>Descriptores cumplidos</h4><div class="wc-chips">${desc}</div></div>` : ''}`;
    }

    const vocab = (ev.vocabulary_suggestions || []).map(v => `
        <div class="wc-vocab-item">
            <div class="wc-vocab-info">
                <strong>${esc(v.word || '')}</strong>
                ${v.reason_es ? `<div class="wc-vocab-reason">${esc(v.reason_es)}</div>` : ''}
                ${v.example_en ? `<div class="wc-vocab-example">${esc(v.example_en)}</div>` : ''}
            </div>
            <button class="btn-ghost ie-vocab-add" data-word="${esc(v.word || '')}" data-example="${esc(v.example_en || '')}">+ Agregar</button>
        </div>`).join('');

    return `
        <div class="ie-result">
            <div class="ie-score-row">
                <div class="ie-band" style="--b:${bandColor(band)}">
                    <span class="ie-band-num">${ev.band ?? rawScore ?? '—'}/5</span>
                    <span class="ie-band-label">rúbrica TOEFL</span>
                </div>
                <div class="ie-band" style="--b:${bandColor(band)}">
                    <span class="ie-band-num">${band ?? '—'}</span>
                    <span class="ie-band-label">banda estimada (1–6)</span>
                </div>
                <div class="ie-encourage">${esc(ev.encouragement_es || '')}</div>
            </div>
            ${ev.feedback_es ? `<div class="wc-section"><h4>Comentario</h4><p class="wc-feedback">${esc(ev.feedback_es)}</p></div>` : ''}
            ${breakdown}
            <div class="wc-section"><h4>Texto corregido</h4><div class="wc-corrected">${esc(ev.corrected || '')}</div></div>
            <div class="wc-section"><h4>Errores y correcciones</h4><div class="wc-errors">${errors}</div></div>
            ${vocab ? `<div class="wc-section wc-vocab-suggestions"><h4>💡 Vocabulario sugerido <span class="wc-tag">de tu texto</span></h4>${vocab}</div>` : ''}
        </div>`;
}

// ── Simulación: intro ───────────────────────────────────────
function simIntroHTML() {
    const rows = TASK_ORDER.map((k, i) => {
        const m = TASK_META[k];
        return `
            <div class="ie-sim-task">
                <span class="ie-task-icon">${m.icon}</span>
                <div>
                    <div class="ie-task-label">${i + 1}. ${esc(m.label)}</div>
                    <div class="ie-task-blurb">${esc(m.blurb)}${m.words_hint ? ` · ${esc(m.words_hint)}` : ''}</div>
                </div>
                <span class="ie-task-time">${m.time_min} min</span>
            </div>`;
    }).join('');
    return `
        <div class="page-enter" style="max-width:760px;margin:0 auto">
            ${headerHTML('Simulación real — TOEFL Writing', 'Condiciones del examen: 3 tareas en orden, con sus tiempos, sin pistas. La IA califica con las rúbricas oficiales.', 'toeflHome')}
            <div class="card" style="margin-bottom:1rem">${rows}</div>
            <div class="ie-disclaimer">⚠️ El cronómetro avanza automáticamente al terminar cada tarea. La banda de sección (1–6) es una <strong>estimación</strong>, no el puntaje oficial de ETS.</div>
            <button class="btn-primary" id="ie-start-sim" ${state.loading ? 'disabled' : ''}>${state.loading ? 'Preparando…' : 'Comenzar simulación'}</button>
            ${state.error ? `<div class="wc-error-msg">${esc(state.error)}</div>` : ''}
        </div>`;
}

// ── Simulación: tarea activa ────────────────────────────────
function simTaskHTML() {
    const sim = state.sim;
    if (sim.grading) {
        return `
            <div class="page-enter" style="max-width:700px;margin:3rem auto;text-align:center">
                <div class="ie-spinner"></div>
                <h3 style="margin-top:1rem">Calificando tu examen…</h3>
                <p style="color:var(--text-secondary)">La IA está evaluando tus ensayos según las rúbricas oficiales.</p>
            </div>`;
    }
    const q = sim.questions[sim.idx];
    const m = TASK_META[q.task_type];
    let body;
    if (q.task_type === 'build_sentence') {
        body = buildSentenceHTML(q, sim.orders[sim.idx] || {}, null);
    } else {
        body = essayHTML(q.task_type, q, sim.responses[sim.idx] || '');
    }
    const isLast = sim.idx === sim.questions.length - 1;
    return `
        <div class="page-enter" style="max-width:900px;margin:0 auto">
            <div class="ie-task-bar ie-task-bar-sim">
                <span class="ie-mode-tag ie-mode-tag-real">Simulación</span>
                <span class="ie-sim-progress">Tarea ${sim.idx + 1} / ${sim.questions.length} · ${esc(m.label)}</span>
                <span class="ie-timer ie-timer-warn" id="ie-timer">${fmtTime(sim.timeLeft)}</span>
            </div>
            ${m.words_hint ? `<p class="ie-sim-hint">Objetivo: ${esc(m.words_hint)}</p>` : ''}
            <div class="ie-sim-main">${body}</div>
            <div class="ie-actions">
                <button class="btn-primary" id="ie-sim-next">${isLast ? 'Terminar y calificar' : 'Siguiente tarea →'}</button>
            </div>
        </div>`;
}

// ── Simulación: resultados ──────────────────────────────────
function simResultsHTML() {
    const f = state.sim.finalize;
    const perTask = (f.results || []).map(r => {
        const m = TASK_META[r.task_type] || { label: r.task_type, icon: '📝' };
        const score = r.task_type === 'build_sentence'
            ? `${(r.evaluation && r.evaluation.correct) ?? '—'}/${(r.evaluation && r.evaluation.total) ?? 10}`
            : `${(r.evaluation && r.evaluation.band) ?? r.raw_score ?? '—'}/5`;
        return `
            <div class="ie-result-task">
                <div class="ie-result-task-head">
                    <span class="ie-task-icon">${m.icon}</span>
                    <strong>${esc(m.label)}</strong>
                    <span class="ie-result-task-score" style="--b:${bandColor(r.band)}">${score} · banda ${r.band ?? '—'}</span>
                </div>
                <div class="ie-result-task-body">${evaluationHTML(r.task_type, r.evaluation || {}, r.band, r.raw_score)}</div>
            </div>`;
    }).join('');

    return `
        <div class="page-enter" style="max-width:1000px;margin:0 auto">
            ${headerHTML('Resultado de la simulación', 'Puntajes de rúbrica por tarea (oficiales) y banda de sección estimada.', 'toeflHome')}
            <div class="ie-section-band" style="--b:${bandColor(f.section_band)}">
                <div class="ie-section-band-num">${f.section_band ?? '—'}</div>
                <div class="ie-section-band-meta">
                    <div class="ie-section-band-cefr">${esc(f.cefr || '')}</div>
                    <div class="ie-section-band-label">Banda Writing (estimada · 1–6 CEFR)</div>
                </div>
            </div>
            <div class="ie-disclaimer">La banda de sección es una <strong>estimación</strong> a partir de las rúbricas oficiales; ETS no publica el algoritmo exacto de conversión.</div>
            <div class="ie-results-list">${perTask}</div>
            <div class="ie-actions">
                <button class="btn-secondary" data-back="toeflHome">Volver al inicio</button>
                <button class="btn-primary" id="ie-sim-again">Nueva simulación</button>
            </div>
        </div>`;
}

// ════════════════════════════════════════════════════════════
//  HANDLERS
// ════════════════════════════════════════════════════════════
function bindHandlers() {
    // back buttons
    root.querySelectorAll('[data-back]').forEach(b =>
        b.addEventListener('click', () => { go(b.getAttribute('data-back')); }));

    switch (state.view) {
        case 'landing':       bindLanding(); break;
        case 'toeflHome':     bindToeflHome(); break;
        case 'practiceSetup': bindPracticeSetup(); break;
        case 'practiceTask':  bindPracticeTask(); break;
        case 'simIntro':      bindSimIntro(); break;
        case 'simTask':       bindSimTask(); break;
        case 'simResults':    bindSimResults(); break;
    }
}

function go(view) {
    clearTimer();
    state.view = view;
    state.error = '';
    rerender();
}

function bindLanding() {
    root.querySelectorAll('.ie-exam-card[data-exam]').forEach(c =>
        c.addEventListener('click', () => { state.view = 'toeflHome'; rerender(); }));
}

function bindToeflHome() {
    root.querySelectorAll('.ie-mode-card').forEach(c =>
        c.addEventListener('click', () => {
            const mode = c.getAttribute('data-mode');
            state.view = mode === 'simulation' ? 'simIntro' : 'practiceSetup';
            rerender();
        }));
}

// ── Práctica ────────────────────────────────────────────────
function bindPracticeSetup() {
    let minutes = 10;
    root.querySelectorAll('.ie-time-chip').forEach(chip =>
        chip.addEventListener('click', () => {
            root.querySelectorAll('.ie-time-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            minutes = parseInt(chip.getAttribute('data-min'));
            const custom = document.getElementById('ie-time-custom');
            if (custom) custom.value = '';
        }));
    const custom = document.getElementById('ie-time-custom');
    if (custom) custom.addEventListener('input', () => {
        const v = parseInt(custom.value);
        if (v > 0) { minutes = v; root.querySelectorAll('.ie-time-chip').forEach(c => c.classList.remove('active')); }
    });

    const startBtn = document.getElementById('ie-start-practice');
    if (startBtn) startBtn.addEventListener('click', async () => {
        const sel = root.querySelector('input[name="ie-task"]:checked');
        const taskType = sel ? sel.value : 'email';
        await startPractice(taskType, Math.max(1, minutes) * 60);
    });
}

async function startPractice(taskType, limitSec) {
    state.loading = true; state.error = '';
    try {
        const [question, attempt] = await Promise.all([
            api.question(taskType, { mode: 'practice' }),
            api.createAttempt({ mode: 'practice', time_limit_seconds: limitSec }),
        ]);
        state.practice = {
            taskType, question, attemptId: attempt.id,
            response: '', orders: {}, timeLeft: limitSec, limitSec,
            evaluation: null, band: null, rawScore: null,
        };
        state.view = 'practiceTask';
    } catch (err) {
        state.error = err && err.message ? err.message : 'No se pudo iniciar la práctica';
    } finally {
        state.loading = false;
        rerender();
        if (state.view === 'practiceTask') startCountdown(() => state.practice.timeLeft, v => state.practice.timeLeft = v, null);
    }
}

function bindPracticeTask() {
    const p = state.practice;

    // essay textarea
    const essay = document.getElementById('ie-essay');
    if (essay) essay.addEventListener('input', e => {
        p.response = e.target.value;
        const wc = document.getElementById('ie-wc');
        if (wc) wc.textContent = `${wordCount(p.response)} palabras`;
    });

    // build a sentence chips
    bindBuildSentence(() => p.question, () => p.orders, () => rerenderBuildOnly());

    // pistas: add word + template + dir toggle + vocab add
    bindPistas(p.taskType, p);

    const evalBtn = document.getElementById('ie-evaluate');
    if (evalBtn) evalBtn.addEventListener('click', onPracticeEvaluate);

    const newQ = document.getElementById('ie-new-question');
    if (newQ) newQ.addEventListener('click', async () => {
        try {
            newQ.disabled = true;
            p.question = await api.question(p.taskType, { mode: 'practice', generate: true });
            p.orders = {}; p.evaluation = null; p.response = '';
            rerender();
            startCountdown(() => state.practice.timeLeft, v => state.practice.timeLeft = v, null);
        } catch (err) { toast(err.message || 'Error', 'error'); newQ.disabled = false; }
    });

    // timer mount
    startCountdown(() => p.timeLeft, v => p.timeLeft = v, null);
}

// Re-render solo del bloque build-a-sentence (para no perder timer/inputs)
function rerenderBuildOnly() {
    const p = state.practice;
    const mount = root.querySelector('.ie-bs');
    if (!mount) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = buildSentenceHTML(p.question, p.orders, p.evaluation);
    mount.replaceWith(wrap.firstElementChild);
    bindBuildSentence(() => p.question, () => p.orders, () => rerenderBuildOnly());
}

function bindBuildSentence(getQuestion, getOrders, onChange) {
    // click en chip del banco → agregar al final del orden
    root.querySelectorAll('.ie-chip-bank').forEach(chip =>
        chip.addEventListener('click', () => {
            const si = parseInt(chip.getAttribute('data-si'));
            const w = chip.getAttribute('data-w');
            const orders = getOrders();
            orders[si] = orders[si] || [];
            orders[si].push(w);
            onChange();
        }));
    // click en chip del orden → quitarlo (por posición)
    root.querySelectorAll('.ie-chip-ans').forEach(chip =>
        chip.addEventListener('click', () => {
            const si = parseInt(chip.getAttribute('data-si'));
            const pos = parseInt(chip.getAttribute('data-pos'));
            const orders = getOrders();
            if (orders[si]) { orders[si].splice(pos, 1); onChange(); }
        }));
}

function bindPistas(taskType, p) {
    // dir toggle
    let dir = 'es-en';
    root.querySelectorAll('.ie-dir').forEach(btn =>
        btn.addEventListener('click', () => {
            root.querySelectorAll('.ie-dir').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            dir = btn.getAttribute('data-dir');
        }));

    // add word con autocompletar offline
    const input = document.getElementById('ie-aw-input');
    const hint = document.getElementById('ie-aw-hint');
    if (input) attachMiniAutocomplete(input, hint, () => dir);

    // usar template
    root.querySelectorAll('.ie-use-template').forEach(btn =>
        btn.addEventListener('click', () => {
            const tpl = TEMPLATES[btn.getAttribute('data-tpl')];
            const essay = document.getElementById('ie-essay');
            if (essay && tpl) {
                essay.value = tpl; p.response = tpl;
                const wc = document.getElementById('ie-wc');
                if (wc) wc.textContent = `${wordCount(tpl)} palabras`;
                essay.focus();
                toast('Template insertado ✍️');
            }
        }));

    // vocab "+ Agregar" (en el resultado de evaluación)
    root.querySelectorAll('.ie-vocab-add').forEach(btn =>
        btn.addEventListener('click', () => onAddVocab(btn)));
}

// Mini autocompletado offline (EN↔ES) para captura rápida en práctica.
function attachMiniAutocomplete(input, hintEl, getDir) {
    const parent = input.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const dd = document.createElement('div');
    dd.className = 'dict-suggest hidden';
    parent.appendChild(dd);
    let items = [], active = -1, timer = null;

    const close = () => { dd.classList.add('hidden'); dd.innerHTML = ''; items = []; active = -1; };
    const render = () => {
        if (!items.length) { close(); return; }
        dd.style.top = (input.offsetTop + input.offsetHeight + 4) + 'px';
        dd.style.left = input.offsetLeft + 'px';
        dd.style.width = input.offsetWidth + 'px';
        dd.innerHTML = items.map((s, i) =>
            `<div class="dict-suggest-item ${i === active ? 'active' : ''}" data-i="${i}"><span class="ds-word">${esc(s.word)}</span><span class="ds-trans">${esc(s.translation)}</span></div>`).join('');
        dd.classList.remove('hidden');
    };
    const saveWord = async (wordSrc, translation) => {
        const dir = getDir();
        // Guardamos siempre como palabra EN → traducción ES en el repositorio.
        let en, es;
        if (dir === 'es-en') { en = translation; es = wordSrc; }
        else { en = wordSrc; es = translation; }
        if (!en || !en.trim()) {
            // ES→EN sin traducción encontrada: guardamos lo que haya en EN como la fuente.
            en = wordSrc;
        }
        try {
            await wordsApi.quick({ word: en.trim(), translation: (es || '').trim() || null });
            if (hintEl) hintEl.innerHTML = `<span class="ie-aw-ok">✓ "${esc(en.trim())}" agregada</span>`;
            input.value = '';
        } catch (err) {
            if (hintEl) hintEl.innerHTML = `<span class="ie-aw-bad">${esc(err.message || 'Error')}</span>`;
        }
    };

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (q.length < 1) { close(); return; }
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (input.value.trim() !== q) return;
            try { const res = await dictApi.suggest(q, getDir()); items = res.suggestions || []; active = -1; render(); }
            catch { close(); }
        }, 150);
    });
    input.addEventListener('keydown', e => {
        const open = !dd.classList.contains('hidden');
        if (e.key === 'ArrowDown' && open) { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
        else if (e.key === 'Escape') close();
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && active >= 0) { const s = items[active]; close(); saveWord(s.word, s.translation); }
            else { close(); saveWord(input.value.trim(), ''); }
        }
    });
    dd.addEventListener('mousedown', e => {
        const item = e.target.closest('.dict-suggest-item');
        if (item) { e.preventDefault(); const s = items[parseInt(item.dataset.i)]; close(); saveWord(s.word, s.translation); }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
}

async function onAddVocab(btn) {
    const word = btn.getAttribute('data-word') || '';
    const example = btn.getAttribute('data-example') || '';
    if (!word.trim()) return;
    btn.disabled = true; btn.textContent = 'Agregando…';
    try {
        await wordsApi.create({
            word: word.trim(), translation: '',
            example: example || null,
            notes: 'Sugerencia automática desde TOEFL Writing',
        });
        btn.outerHTML = '<span class="wc-vocab-saved">✓ guardada</span>';
    } catch (err) {
        btn.disabled = false; btn.textContent = '+ Agregar';
        toast(err.message || 'No se pudo guardar', 'error');
    }
}

async function onPracticeEvaluate() {
    const p = state.practice;
    const btn = document.getElementById('ie-evaluate');
    state.error = '';

    const payload = { question_id: p.question.id, task_type: p.taskType };
    if (p.taskType === 'build_sentence') {
        const sentences = (p.question.payload.sentences || []);
        payload.sentence_orders = sentences.map((_, i) => p.orders[i] || []);
    } else {
        if (!p.response.trim()) { toast('Escribe tu respuesta primero', 'error'); return; }
        payload.user_response = p.response.trim();
    }

    if (btn) { btn.disabled = true; btn.textContent = p.taskType === 'build_sentence' ? 'Verificando…' : 'Evaluando…'; }
    try {
        const res = await api.gradeTask(p.attemptId, payload);
        p.evaluation = res.evaluation; p.band = res.band; p.rawScore = res.raw_score;
        rerender();
        startCountdown(() => p.timeLeft, v => p.timeLeft = v, null);
        const mount = root.querySelector('#ie-eval-mount');
        if (mount && mount.scrollIntoView) mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        state.error = err && err.message ? err.message : 'Error al evaluar';
        rerender();
        startCountdown(() => p.timeLeft, v => p.timeLeft = v, null);
    }
}

// ── Simulación ──────────────────────────────────────────────
function bindSimIntro() {
    const btn = document.getElementById('ie-start-sim');
    if (btn) btn.addEventListener('click', startSimulation);
}

async function startSimulation() {
    state.loading = true; state.error = '';
    rerender();
    try {
        const [set, attempt] = await Promise.all([
            api.question(null, { mode: 'simulation' }),
            api.createAttempt({ mode: 'simulation' }),
        ]);
        // ordenar según TASK_ORDER
        const byType = {};
        (set.questions || []).forEach(q => { byType[q.task_type] = q; });
        const questions = TASK_ORDER.map(t => byType[t]).filter(Boolean);
        state.sim = {
            attemptId: attempt.id, questions, idx: 0,
            responses: {}, orders: {},
            timeLeft: TASK_META[questions[0].task_type].time_min * 60,
            grading: false, finalize: null,
        };
        state.view = 'simTask';
    } catch (err) {
        state.error = err && err.message ? err.message : 'No se pudo iniciar la simulación';
    } finally {
        state.loading = false;
        rerender();
        if (state.view === 'simTask') startSimTimer();
    }
}

function bindSimTask() {
    const sim = state.sim;
    if (sim.grading) return;
    const q = sim.questions[sim.idx];

    const essay = document.getElementById('ie-essay');
    if (essay) essay.addEventListener('input', e => {
        sim.responses[sim.idx] = e.target.value;
        const wc = document.getElementById('ie-wc');
        if (wc) wc.textContent = `${wordCount(e.target.value)} palabras`;
    });

    if (q.task_type === 'build_sentence') {
        sim.orders[sim.idx] = sim.orders[sim.idx] || {};
        bindBuildSentence(() => q, () => sim.orders[sim.idx], () => rerenderSimBuildOnly());
    }

    const nextBtn = document.getElementById('ie-sim-next');
    if (nextBtn) nextBtn.addEventListener('click', () => advanceSim(false));

    startSimTimer();
}

function rerenderSimBuildOnly() {
    const sim = state.sim;
    const q = sim.questions[sim.idx];
    const mount = root.querySelector('.ie-bs');
    if (!mount) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = buildSentenceHTML(q, sim.orders[sim.idx] || {}, null);
    mount.replaceWith(wrap.firstElementChild);
    bindBuildSentence(() => q, () => sim.orders[sim.idx], () => rerenderSimBuildOnly());
}

function startSimTimer() {
    const sim = state.sim;
    startCountdown(() => sim.timeLeft, v => sim.timeLeft = v, () => advanceSim(true));
}

async function advanceSim(auto) {
    clearTimer();
    const sim = state.sim;
    if (sim.idx < sim.questions.length - 1) {
        sim.idx += 1;
        sim.timeLeft = TASK_META[sim.questions[sim.idx].task_type].time_min * 60;
        if (auto) toast('Tiempo agotado — siguiente tarea');
        rerender();
        startSimTimer();
        return;
    }
    // última tarea → calificar todo
    sim.grading = true;
    rerender();
    try {
        for (let i = 0; i < sim.questions.length; i++) {
            const q = sim.questions[i];
            const payload = { question_id: q.id, task_type: q.task_type };
            if (q.task_type === 'build_sentence') {
                const sents = (q.payload.sentences || []);
                const o = sim.orders[i] || {};
                payload.sentence_orders = sents.map((_, j) => o[j] || []);
            } else {
                payload.user_response = (sim.responses[i] || '').trim() || '(blank)';
            }
            await api.gradeTask(sim.attemptId, payload);
        }
        sim.finalize = await api.finalize(sim.attemptId);
        state.view = 'simResults';
    } catch (err) {
        state.error = err && err.message ? err.message : 'Error al calificar';
        sim.grading = false;
        state.view = 'simIntro';
    } finally {
        rerender();
    }
}

function bindSimResults() {
    root.querySelectorAll('.ie-vocab-add').forEach(btn =>
        btn.addEventListener('click', () => onAddVocab(btn)));
    const again = document.getElementById('ie-sim-again');
    if (again) again.addEventListener('click', () => { state.view = 'simIntro'; state.sim = null; rerender(); });
}

// ── Countdown genérico ──────────────────────────────────────
function startCountdown(getLeft, setLeft, onZero) {
    clearTimer();
    const tick = () => {
        const left = getLeft() - 1;
        setLeft(left);
        const el = document.getElementById('ie-timer');
        if (el) {
            el.textContent = fmtTime(Math.max(0, left));
            if (left <= 30) el.classList.add('ie-timer-danger');
        }
        if (left <= 0) {
            clearTimer();
            if (onZero) onZero();
        }
    };
    timerId = setInterval(tick, 1000);
}

// ── Entry point ─────────────────────────────────────────────
export async function render(container) {
    root = container;
    clearTimer();
    resetState();
    rerender();
    try {
        const data = await api.list();
        state.exams = data.exams || [];
    } catch (err) {
        state.error = err && err.message ? err.message : 'No se pudieron cargar los exámenes';
    }
    if (state.view === 'landing') rerender();
}
