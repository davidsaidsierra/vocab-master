// ── Tema de la interfaz (claro / oscuro / sistema) ───────────
// El valor elegido vive en localStorage y se traduce a un atributo
// `data-theme="light|dark"` en <html>. Todo el CSS cuelga de ahí.
// El destello inicial lo evita el script inline de index.html, que hace
// exactamente lo mismo pero de forma síncrona antes de pintar.

const THEME_KEY = 'vocabmaster_theme';
const VALID = ['light', 'dark', 'system'];

const media = window.matchMedia('(prefers-color-scheme: dark)');

// Preferencia guardada ('light' | 'dark' | 'system'). Por defecto 'system'.
export function getTheme() {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        return VALID.includes(saved) ? saved : 'system';
    } catch (_) {
        return 'system';
    }
}

// Tema realmente aplicado ('light' | 'dark'), ya resuelto el caso 'system'.
export function resolvedTheme() {
    const pref = getTheme();
    if (pref === 'system') return media.matches ? 'dark' : 'light';
    return pref;
}

function apply() {
    document.documentElement.setAttribute('data-theme', resolvedTheme());
}

// Guarda la preferencia y la aplica al vuelo (sin recargar).
export function setTheme(pref) {
    if (!VALID.includes(pref)) return;
    try { localStorage.setItem(THEME_KEY, pref); } catch (_) { /* modo privado */ }
    apply();
    window.dispatchEvent(new CustomEvent('theme:changed', {
        detail: { preference: pref, resolved: resolvedTheme() },
    }));
}

// Se llama una vez al arrancar: reaplica y queda escuchando al sistema
// operativo, para que el modo 'system' cambie solo al anochecer.
export function initTheme() {
    apply();
    const onSystemChange = () => { if (getTheme() === 'system') apply(); };
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);   // Safari viejo
}
