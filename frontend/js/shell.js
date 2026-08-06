// ── Shell de escritorio ──────────────────────────────────────
// Dueño de la barra superior y del colapso de la barra lateral.
// Todo es aditivo y defensivo: si algo falla aquí, el router y las
// páginas siguen funcionando, y el móvil ni se entera.
import { getTheme, setTheme, resolvedTheme } from './utils/theme.js';

const COLLAPSE_KEY = 'vocabmaster_sidebar';

// ── ¿Estamos en vista de escritorio? ─────────────────────────
// Mismo criterio que app.js (initMobile): las clases forzadas mandan
// sobre el ancho del viewport.
function isDesktopView() {
    const body = document.body;
    if (body.classList.contains('force-mobile'))  return false;
    if (body.classList.contains('force-desktop')) return true;
    return !window.matchMedia('(max-width: 768px)').matches;
}

// `body.desktop-shell` es el interruptor del que cuelga todo el CSS del
// shell. Se recalcula al cambiar el ancho y al cambiar el modo de vista.
function syncShellClass() {
    const want = isDesktopView();
    const body = document.body;
    if (body.classList.contains('desktop-shell') !== want) {
        body.classList.toggle('desktop-shell', want);
    }
}

// ── Colapso de la barra lateral ──────────────────────────────
function applyCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const btn = document.getElementById('sidebar-toggle');
    if (btn) {
        btn.title = collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral';
        const label = btn.querySelector('.nav-label');
        if (label) label.textContent = 'Colapsar';
    }
}

function initSidebarCollapse() {
    let collapsed = false;
    try { collapsed = localStorage.getItem(COLLAPSE_KEY) === 'collapsed'; } catch (_) { /* modo privado */ }
    applyCollapsed(collapsed);

    const btn = document.getElementById('sidebar-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const next = !document.body.classList.contains('sidebar-collapsed');
        try { localStorage.setItem(COLLAPSE_KEY, next ? 'collapsed' : 'expanded'); } catch (_) { /* ídem */ }
        applyCollapsed(next);
    });
}

// ── Alternador rápido de tema ────────────────────────────────
// Claro ↔ oscuro de un clic. La opción de tres vías (incluido "Sistema")
// sigue viviendo en Ajustes; aquí sólo se quiere el atajo.
function initThemeToggle() {
    const btn = document.getElementById('tb-theme');
    if (!btn) return;
    btn.addEventListener('click', () => {
        setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    });
    const syncTitle = () => {
        const pref = getTheme();
        btn.title = pref === 'system'
            ? `Tema del sistema (${resolvedTheme() === 'dark' ? 'oscuro' : 'claro'}) — clic para fijarlo`
            : `Tema ${resolvedTheme() === 'dark' ? 'oscuro' : 'claro'} — clic para cambiar`;
    };
    syncTitle();
    window.addEventListener('theme:changed', syncTitle);
}

// ── Arranque ─────────────────────────────────────────────────
export function initShell() {
    try {
        syncShellClass();
        initSidebarCollapse();
        initThemeToggle();

        // El ancho cambia → puede cambiar el modo.
        let resizeT;
        window.addEventListener('resize', () => {
            clearTimeout(resizeT);
            resizeT = setTimeout(syncShellClass, 150);
        });

        // El modo de vista se cambia desde dos sitios (el botón flotante en
        // app.js y Ajustes), y ambos lo hacen tocando las clases del body.
        // Observarlas evita tener que avisar desde cada uno.
        new MutationObserver(syncShellClass).observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
        });
    } catch (err) {
        console.warn('[VocabMaster] Shell de escritorio desactivado:', err);
    }
}
