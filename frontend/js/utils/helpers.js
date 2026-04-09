// ── Toast notifications ──────────────────────────────────────
export function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ── Difficulty stars HTML ────────────────────────────────────
export function starsHTML(level, interactive = false) {
    return Array.from({ length: 5 }, (_, i) => {
        const filled = i < level;
        const cls = filled ? 'filled' : 'empty';
        const data = interactive ? `data-value="${i + 1}"` : '';
        return `<span class="star ${cls}" ${data}>★</span>`;
    }).join('');
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
