import * as api from '../api.js';
import { masteryColor, formatDate } from '../utils/helpers.js';

const LEVEL_COLORS = {
    A1: '#34c759', A2: '#34c759',
    B1: '#ff9500', B2: '#ff9500',
    C1: '#af52de', C2: '#af52de',
    none: '#d2d2d7',
};

function bandCefr(band) {
    if (band == null) return '';
    if (band >= 6.0) return 'C2';
    if (band >= 5.0) return 'C1';
    if (band >= 4.0) return 'B2';
    if (band >= 3.0) return 'B1';
    if (band >= 2.0) return 'A2';
    return 'A1';
}

// ── Frase-resumen (plantilla determinista, sin IA) ──────────
function buildSummaryPhrase(overview, byLevel) {
    const parts = [];
    if (overview.total_words) parts.push(`${overview.total_words} palabras`);

    let topLevel = null, topCount = 0;
    ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach(lvl => {
        const n = byLevel[lvl] || 0;
        if (n > topCount) { topCount = n; topLevel = lvl; }
    });
    if (topLevel) parts.push(`tu vocabulario es mayormente ${topLevel}`);

    if (overview.mastered) parts.push(`${overview.mastered} dominadas`);
    if (overview.best_exam_band != null) parts.push(`mejor TOEFL: ${overview.best_exam_band} (${bandCefr(overview.best_exam_band)})`);

    return parts.join(' · ');
}

export async function render(container) {
    container.innerHTML = '<div class="page-enter" id="dash-page"><p class="text-slate-500">Loading…</p></div>';
    const page = container.querySelector('#dash-page');

    try {
        const [overview, byCat, activity, distribution, byLevel, levelProgress, writingHistory, examHistory] = await Promise.all([
            api.stats.overview(),
            api.stats.byCategory(),
            api.stats.activity(30),
            api.stats.distribution(),
            api.stats.byLevel(),
            api.stats.levelProgress(),
            api.writing.history(50).catch(() => ({ items: [] })),
            api.exams.history(50).catch(() => ({ attempts: [] })),
        ]);

        const summaryPhrase = buildSummaryPhrase(overview, byLevel);
        const writingItems = writingHistory.items || [];
        const examAttempts = examHistory.attempts || [];
        const hasExamBands = examAttempts.some(a => a.section_band != null);

        page.innerHTML = `
            <h2 class="text-2xl font-bold mb-1">Dashboard</h2>
            ${summaryPhrase ? `<p class="dash-summary-phrase">${summaryPhrase}</p>` : ''}

            <!-- KPIs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8 mt-4">
                ${statCard('Palabras', overview.total_words, '#8b5cf6', '#6d28d9', '📚')}
                ${masteryStatCard(overview.average_mastery)}
                ${statCard('Sin practicar', overview.never_practiced, '#f59e0b', '#d97706', '⏳', { href: '#/review' })}
                ${statCard('Repasos', overview.total_reviews, '#ec4899', '#be185d', '✅')}
                ${statCard('Retos de escritura', overview.writing_count, '#0071e3', '#0058b0', '✍️')}
                ${statCard('Exámenes', overview.exam_count, '#af52de', '#7c3aed', '🎓',
                    overview.best_exam_band != null ? { sub: `mejor: ${overview.best_exam_band} (${bandCefr(overview.best_exam_band)})` } : {})}
            </div>

            <!-- Vocabulario por nivel -->
            <div class="card mb-6">
                <h3 class="text-sm font-semibold text-slate-400 mb-4">Tu vocabulario por nivel (CEFR)</h3>
                ${byLevelChartHTML(byLevel)}
            </div>

            <!-- Progreso: dominio por nivel -->
            <div class="card mb-8">
                <h3 class="text-sm font-semibold text-slate-400 mb-1">Progreso: dominio por nivel</h3>
                <p class="dash-legend">
                    <span style="color:#34c759">■</span> dominadas (≥80%) &nbsp;
                    <span style="color:#ff9500">■</span> en progreso &nbsp;
                    <span style="color:#aeaeb2">■</span> sin practicar
                </p>
                ${levelProgressChartHTML(levelProgress)}
            </div>

            <!-- Progreso de escritura / exámenes -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="card">
                    <h3 class="text-sm font-semibold text-slate-400 mb-4">Progreso — Writing Challenge</h3>
                    ${writingItems.length
                        ? '<canvas id="chart-writing-progress" height="200"></canvas>'
                        : '<p class="text-slate-500 text-sm">Aún no tienes retos de escritura. <a href="#/writing" class="text-brand-400 hover:underline">Empieza uno</a>.</p>'}
                </div>
                <div class="card">
                    <h3 class="text-sm font-semibold text-slate-400 mb-4">Progreso — Exámenes (TOEFL)</h3>
                    ${hasExamBands
                        ? '<canvas id="chart-exam-progress" height="200"></canvas>'
                        : '<p class="text-slate-500 text-sm">Aún no tienes exámenes completados. <a href="#/exams" class="text-brand-400 hover:underline">Practica uno</a>.</p>'}
                </div>
            </div>

            <!-- Charts row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="card">
                    <h3 class="text-sm font-semibold text-slate-400 mb-4">Mastery Distribution</h3>
                    <canvas id="chart-distribution" height="200"></canvas>
                </div>
                <div class="card">
                    <h3 class="text-sm font-semibold text-slate-400 mb-4">Activity (Last 30 Days)</h3>
                    <canvas id="chart-activity" height="200"></canvas>
                </div>
            </div>

            <!-- Categories breakdown -->
            <div class="card">
                <h3 class="text-sm font-semibold text-slate-400 mb-4">Categories</h3>
                ${byCat.length === 0
                    ? '<p class="text-slate-600 text-sm">No categories yet. Add words to see your breakdown.</p>'
                    : `<div class="space-y-3">${byCat.map(c => categoryRow(c)).join('')}</div>`
                }
            </div>
        `;

        renderDistributionChart(distribution);
        renderActivityChart(activity);
        renderWritingProgressChart(writingItems);
        if (hasExamBands) renderExamProgressChart(examAttempts);
    } catch (e) {
        page.innerHTML = `<p class="text-red-400">Error loading dashboard: ${e.message}</p>`;
    }
}

// ── KPI cards ────────────────────────────────────────────────
function statCard(label, value, from, to, icon, opts = {}) {
    const valueHTML = opts.href
        ? `<a href="${opts.href}" class="text-3xl font-bold" style="text-decoration:none;color:inherit;display:block">${value}</a>`
        : `<div class="text-3xl font-bold">${value}</div>`;
    const subHTML = opts.sub
        ? `<div style="font-size:0.7rem;color:var(--text-tertiary);margin-top:0.15rem">${opts.sub}</div>`
        : '';
    return `
        <div class="stat-card" style="--stat-from:${from};--stat-to:${to}">
            <div class="text-2xl mb-3">${icon}</div>
            ${valueHTML}
            <div class="text-sm">${label}</div>
            ${subHTML}
        </div>
    `;
}

function masteryRingHTML(pct) {
    const p = Math.max(0, Math.min(100, pct || 0));
    const r = 26;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - p / 100);
    const color = masteryColor(p);
    return `
        <svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)">
            <circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="7"/>
            <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="7"
                stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
        </svg>
    `;
}

function masteryStatCard(pct) {
    return `
        <div class="stat-card" style="--stat-from:#10b981;--stat-to:#047857">
            <div style="position:relative;width:64px;height:64px;margin-bottom:0.5rem">
                ${masteryRingHTML(pct)}
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.95rem">${Math.round(pct || 0)}%</div>
            </div>
            <div class="text-sm">Mastery promedio</div>
        </div>
    `;
}

function categoryRow(c) {
    const pct = Math.min(c.avg_mastery, 100);
    return `
        <div class="flex items-center gap-4">
            <span class="text-lg w-8 text-center">${c.icon}</span>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between text-sm mb-1">
                    <span class="font-medium">${c.name}</span>
                    <span class="text-slate-400">${c.word_count} words · ${c.avg_mastery}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%;background:${c.color}"></div>
                </div>
            </div>
        </div>
    `;
}

// ── Vocabulario por nivel (barras) ───────────────────────────
function byLevelChartHTML(byLevel) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'none'];
    const max = Math.max(1, ...levels.map(l => byLevel[l] || 0));
    const rows = levels.map(lvl => {
        const n = byLevel[lvl] || 0;
        const pct = Math.round((n / max) * 100);
        const label = lvl === 'none' ? '—' : lvl;
        return `
            <div class="dash-level-row">
                <span class="dash-level-label" style="color:${LEVEL_COLORS[lvl]}">${label}</span>
                <div class="dash-level-bar"><div style="width:${pct}%;background:${LEVEL_COLORS[lvl]}"></div></div>
                <span class="dash-level-count">${n}</span>
            </div>
        `;
    }).join('');
    return `<div class="dash-level-chart">${rows}</div>`;
}

// ── Progreso: dominio por nivel (barras apiladas) ────────────
function levelProgressChartHTML(progress) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const rows = levels.map(lvl => {
        const b = progress[lvl] || { mastered: 0, in_progress: 0, untouched: 0 };
        const total = b.mastered + b.in_progress + b.untouched;
        if (!total) {
            return `
                <div class="dash-level-row">
                    <span class="dash-level-label">${lvl}</span>
                    <div class="dash-level-bar"><div style="width:100%;background:var(--bg-hover)"></div></div>
                    <span class="dash-level-count" style="color:var(--text-tertiary)">sin palabras</span>
                </div>
            `;
        }
        const mPct = (b.mastered / total) * 100;
        const iPct = (b.in_progress / total) * 100;
        const uPct = (b.untouched / total) * 100;
        return `
            <div class="dash-level-row">
                <span class="dash-level-label">${lvl}</span>
                <div class="dash-level-bar dash-level-stacked">
                    <div style="width:${mPct}%;background:#34c759" title="${b.mastered} dominadas"></div>
                    <div style="width:${iPct}%;background:#ff9500" title="${b.in_progress} en progreso"></div>
                    <div style="width:${uPct}%;background:#d2d2d7" title="${b.untouched} sin practicar"></div>
                </div>
                <span class="dash-level-count">${total}</span>
            </div>
        `;
    }).join('');
    return `<div class="dash-level-chart">${rows}</div>`;
}

// ── Charts (Chart.js) ────────────────────────────────────────
function renderDistributionChart(data) {
    const ctx = document.getElementById('chart-distribution');
    if (!ctx) return;
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#10b981'],
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#6e6e73', padding: 16, font: { size: 12 } } },
            },
        },
    });
}

function renderActivityChart(data) {
    const ctx = document.getElementById('chart-activity');
    if (!ctx) return;

    const last30 = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const found = data.find(r => r.date === key);
        last30.push({ date: key, count: found ? found.count : 0 });
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last30.map(d => d.date.slice(5)),
            datasets: [{
                label: 'Reviews',
                data: last30.map(d => d.count),
                backgroundColor: 'rgba(0, 113, 227, 0.55)',
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { color: '#86868b', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#86868b', stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true },
            },
            plugins: { legend: { display: false } },
        },
    });
}

// Puntaje de writing (0-100) + errores/100 palabras en el tiempo. El objetivo
// es que se vea la mejora aunque el puntaje se repita: menos errores por
// palabra en el mismo puntaje SÍ es progreso.
function renderWritingProgressChart(historyItems) {
    const ctx = document.getElementById('chart-writing-progress');
    if (!ctx || !historyItems.length) return;
    const ordered = [...historyItems].reverse(); // el API da desc; el chart quiere cronológico

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ordered.map(h => formatDate(h.created_at)),
            datasets: [
                {
                    label: 'Puntaje',
                    data: ordered.map(h => h.score),
                    borderColor: '#0071e3',
                    backgroundColor: 'rgba(0,113,227,0.08)',
                    yAxisID: 'y',
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: 'Errores / 100 palabras',
                    data: ordered.map(h => (h.metrics ? h.metrics.errors_per_100 : 0)),
                    borderColor: '#ff3b30',
                    borderDash: [5, 4],
                    yAxisID: 'y1',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 3,
                },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { color: '#86868b', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
                y: {
                    position: 'left', min: 0, max: 100,
                    ticks: { color: '#86868b' }, grid: { color: 'rgba(0,0,0,0.05)' },
                    title: { display: true, text: 'Puntaje', color: '#86868b', font: { size: 11 } },
                },
                y1: {
                    position: 'right', min: 0,
                    ticks: { color: '#86868b' }, grid: { display: false },
                    title: { display: true, text: 'Errores/100', color: '#86868b', font: { size: 11 } },
                },
            },
            plugins: { legend: { position: 'bottom', labels: { color: '#6e6e73', font: { size: 11 } } } },
        },
    });
}

function renderExamProgressChart(attempts) {
    const ctx = document.getElementById('chart-exam-progress');
    if (!ctx) return;
    const withBand = attempts.filter(a => a.section_band != null);
    if (!withBand.length) return;
    const ordered = [...withBand].reverse();

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ordered.map(a => formatDate(a.submitted_at || a.created_at)),
            datasets: [{
                label: 'Banda TOEFL (1–6)',
                data: ordered.map(a => a.section_band),
                borderColor: '#af52de',
                backgroundColor: 'rgba(175,82,222,0.08)',
                tension: 0.3,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { color: '#86868b', font: { size: 10 }, maxRotation: 45 }, grid: { display: false } },
                y: { min: 1, max: 6, ticks: { color: '#86868b', stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
            },
            plugins: { legend: { display: false } },
        },
    });
}
