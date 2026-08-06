// ── Ajustes ──────────────────────────────────────────────────
// Página de configuración de la app. De momento sólo preferencias de
// interfaz (viven en localStorage, no tocan el backend).
import { getTheme, setTheme, resolvedTheme } from '../utils/theme.js';
import { toast } from '../utils/helpers.js';
import { getRole } from '../auth.js';
import { render as renderAdminUsers } from './adminUsers.js';

const VIEW_KEY = 'vocabmaster_view_mode';   // mismo que usa app.js

const THEME_OPTIONS = [
    { value: 'light',  icon: '☀️', label: 'Claro',    hint: 'Siempre en claro' },
    { value: 'dark',   icon: '🌙', label: 'Oscuro',   hint: 'Siempre en oscuro' },
    { value: 'system', icon: '🖥️', label: 'Sistema',  hint: 'Sigue a Windows' },
];

const VIEW_OPTIONS = [
    { value: 'auto',    icon: '↔️', label: 'Automática', hint: 'Según el ancho' },
    { value: 'desktop', icon: '🖥️', label: 'Escritorio', hint: 'Barra lateral' },
    { value: 'mobile',  icon: '📱', label: 'Móvil',      hint: 'Barra inferior' },
];

function getViewMode() {
    try {
        const saved = localStorage.getItem(VIEW_KEY);
        return (saved === 'mobile' || saved === 'desktop') ? saved : 'auto';
    } catch (_) {
        return 'auto';
    }
}

function setViewMode(mode) {
    try {
        if (mode === 'auto') localStorage.removeItem(VIEW_KEY);
        else localStorage.setItem(VIEW_KEY, mode);
    } catch (_) { /* modo privado */ }
    const body = document.body;
    body.classList.remove('force-mobile', 'force-desktop');
    if (mode === 'mobile')  body.classList.add('force-mobile');
    if (mode === 'desktop') body.classList.add('force-desktop');
}

function optionsHTML(name, options, current) {
    return options.map(o => `
        <button type="button" class="set-opt ${o.value === current ? 'is-selected' : ''}"
                data-group="${name}" data-value="${o.value}">
            <span class="set-opt-icon">${o.icon}</span>
            <span class="set-opt-label">${o.label}</span>
            <span class="set-opt-hint">${o.hint}</span>
        </button>
    `).join('');
}

export function render(container) {
    const theme = getTheme();
    const view  = getViewMode();

    container.innerHTML = `
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h2>Ajustes</h2>
                    <p class="ph-sub">Preferencias de la interfaz. Se guardan en este navegador.</p>
                </div>
            </div>

            <div class="card mb-4 max-w-2xl">
                <h3 class="text-sm font-semibold mb-1">Apariencia</h3>
                <p class="text-xs mb-4" style="color:var(--text-tertiary)">
                    Tema de color de la aplicación.
                </p>
                <div class="set-options" id="theme-options">
                    ${optionsHTML('theme', THEME_OPTIONS, theme)}
                </div>
                <p class="text-xs mt-3" style="color:var(--text-quaternary)">
                    Ahora mismo se ve en modo <strong id="theme-resolved">${resolvedTheme() === 'dark' ? 'oscuro' : 'claro'}</strong>.
                </p>
            </div>

            <div class="card mb-4 max-w-2xl">
                <h3 class="text-sm font-semibold mb-1">Diseño</h3>
                <p class="text-xs mb-4" style="color:var(--text-tertiary)">
                    Fuerza la vista de escritorio o la de móvil, sin importar el tamaño de la ventana.
                </p>
                <div class="set-options" id="view-options">
                    ${optionsHTML('view', VIEW_OPTIONS, view)}
                </div>
            </div>

            <!-- Sólo admin: el servidor también lo bloquea -->
            <div class="card mb-4 max-w-2xl" id="users-card" style="display:none">
                <h3 class="text-sm font-semibold mb-1">Usuarios</h3>
                <p class="text-xs mb-4" style="color:var(--text-tertiary)">
                    Altas, roles y estado de las cuentas.
                </p>
                <div id="users-host"></div>
            </div>

            <div class="card max-w-2xl">
                <h3 class="text-sm font-semibold mb-1">Acerca de</h3>
                <p class="text-xs" style="color:var(--text-tertiary)">
                    VocabMaster v1.0 — herramienta personal de vocabulario y escritura en inglés.
                </p>
            </div>
        </div>
    `;

    // Panel de usuarios incrustado (antes vivía en su propia ruta #/admin, que
    // se conserva como enlace directo). `adminUsers.render` sólo toca el
    // contenedor que recibe, así que se monta aquí sin cambios.
    if (getRole() === 'admin') {
        const card = container.querySelector('#users-card');
        card.style.display = '';
        renderAdminUsers(container.querySelector('#users-host'), { embedded: true });
    }

    container.querySelectorAll('.set-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            const { group, value } = btn.dataset;

            if (group === 'theme') {
                setTheme(value);
                const label = container.querySelector('#theme-resolved');
                if (label) label.textContent = resolvedTheme() === 'dark' ? 'oscuro' : 'claro';
                toast('Tema actualizado');
            } else if (group === 'view') {
                setViewMode(value);
                toast('Vista actualizada');
            }

            // Marcar sólo el elegido dentro de su grupo. Se compara por valor y
            // no por referencia: cambiar el tema repinta la página (app.js), así
            // que para entonces estos botones ya son otros nodos.
            container.querySelectorAll(`.set-opt[data-group="${group}"]`)
                .forEach(b => b.classList.toggle('is-selected', b.dataset.value === value));
        });
    });
}
