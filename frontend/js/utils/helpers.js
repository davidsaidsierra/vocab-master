// ── Toast notifications ──────────────────────────────────────
// `opts.actionLabel` + `opts.onAction` añaden un enlace al aviso (p. ej.
// "Ver" tras guardar una palabra desde la barra superior). Opcional: las
// llamadas de dos argumentos siguen funcionando igual.
export function toast(message, type = 'success', opts = {}) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    if (opts.actionLabel && typeof opts.onAction === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-action';
        btn.textContent = opts.actionLabel;
        btn.addEventListener('click', () => { opts.onAction(); el.remove(); });
        el.appendChild(btn);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ── CEFR level badge ─────────────────────────────────────────
// Color por familia de nivel (intuitivo): A básico → verde, B intermedio →
// ámbar, C avanzado → morado. Devuelve '' si la palabra no tiene nivel (frase o
// fuera de la base de cefrpy).
const CEFR_COLORS = {
    A1: '#34c759', A2: '#34c759',
    B1: '#ff9500', B2: '#ff9500',
    C1: '#af52de', C2: '#af52de',
};
export function cefrBadgeHTML(level) {
    if (!level) return '';
    const color = CEFR_COLORS[level] || '#86868b';
    return `<span class="badge" title="Nivel ${level} (CEFR)" style="background:${color}1f;color:${color};font-weight:600">${level}</span>`;
}

// ── Mastery color ────────────────────────────────────────────
export function masteryColor(level) {
    if (level >= 80) return '#10b981';
    if (level >= 60) return '#8b5cf6';
    if (level >= 40) return '#f59e0b';
    if (level >= 20) return '#f97316';
    return '#ef4444';
}

// ── Format date ──────────────────────────────────────────────
export function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Truncate text ────────────────────────────────────────────
export function truncate(str, max = 60) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Valor actual de un token CSS ─────────────────────────────
// Chart.js necesita colores literales, no var(--x); esto los resuelve en el
// momento de dibujar, así los gráficos siguen el tema activo.
export function cssVar(name, fallback = '#86868b') {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (_) {
        return fallback;
    }
}
