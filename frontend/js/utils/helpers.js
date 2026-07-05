// ── Toast notifications ──────────────────────────────────────
export function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
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
