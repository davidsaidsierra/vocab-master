// ── Análisis del texto (estilo LingoLeap, 100% offline y determinista) ──────
//
// Renderiza las métricas que ya calculó el backend (services/writing_metrics.py)
// a partir de la corrección que la IA YA devolvió: errores por tipo (grammar,
// spelling, ...) y distribución de vocabulario por nivel CEFR (cefrpy, sin IA).
// Cero llamadas nuevas — es el mismo texto/corrección que ya se pagó.

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TYPE_LABELS = {
    grammar: 'Grammar',
    spelling: 'Spelling',
    'word-choice': 'Word choice',
    punctuation: 'Punctuation',
    naturalness: 'Naturalness',
    register: 'Register',
    other: 'Other',
};

const LEVEL_COLORS = {
    A1: '#34c759', A2: '#34c759',
    B1: '#ff9500', B2: '#ff9500',
    C1: '#af52de', C2: '#af52de',
    unknown: '#86868b',
};

export function renderMetrics(metrics) {
    if (!metrics || !metrics.word_count) return '';

    const errorChips = Object.entries(metrics.errors_by_type || {})
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([type, n]) => {
            const label = esc(TYPE_LABELS[type] || type).toUpperCase();
            return `<span class="mv-chip">${label} <strong>${n}</strong></span>`;
        })
        .join('') || '<span style="color:var(--text-secondary);font-size:0.85rem">Sin errores clasificados</span>';

    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown'];
    const vocabBars = levels.map(lvl => {
        const pct = (metrics.vocab_distribution || {})[lvl] || 0;
        const label = lvl === 'unknown' ? '—' : lvl;
        return `
            <div class="mv-vocab-row">
                <span class="mv-vocab-label" style="color:${LEVEL_COLORS[lvl]}">${label}</span>
                <div class="mv-vocab-bar"><div style="width:${pct}%;background:${LEVEL_COLORS[lvl]}"></div></div>
                <span class="mv-vocab-pct">${pct}%</span>
            </div>`;
    }).join('');

    const suspects = metrics.spelling_suspects || [];
    const suspectsHTML = suspects.length
        ? `<div class="mv-suspects">🔤 Posibles errores de ortografía: ${suspects.map(esc).join(', ')}</div>`
        : '';

    return `
        <div class="wc-section mv-analysis">
            <h4>📊 Análisis del texto <span class="wc-tag">sin IA · determinista</span></h4>
            <div class="mv-meta">${metrics.word_count} palabras · ${metrics.sentence_count} oraciones · ${metrics.errors_per_100} errores / 100 palabras</div>
            <div class="mv-block">
                <div class="mv-block-title">Errores por tipo</div>
                <div class="mv-chips">${errorChips}</div>
            </div>
            <div class="mv-block">
                <div class="mv-block-title">
                    Vocabulario por nivel (CEFR)
                    ${metrics.advanced_pct ? `<span class="mv-advanced">${metrics.advanced_pct}% avanzado (B2+)</span>` : ''}
                </div>
                ${vocabBars}
            </div>
            ${suspectsHTML}
        </div>`;
}
