// ── Shell de escritorio ──────────────────────────────────────
// Dueño de la barra superior y del colapso de la barra lateral.
// Todo es aditivo y defensivo: si algo falla aquí, el router y las
// páginas siguen funcionando, y el móvil ni se entera.
import { getTheme, setTheme, resolvedTheme } from './utils/theme.js';
import { toast } from './utils/helpers.js';
import * as api from './api.js';
import { openLookupModal } from './components/lookupModal.js';

const COLLAPSE_KEY = 'vocabmaster_sidebar';

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

// ── Caja de captura ──────────────────────────────────────────
// Una palabra a la vez, desde donde estés. El modal de lookup ya sabe
// mostrar significados, frases y familia, así que aquí sólo se le pasa
// el texto y qué hacer cuando el usuario decide guardar.
function initCapture() {
    const input = document.getElementById('tb-input');
    const button = document.getElementById('tb-search');
    if (!input || !button) return;

    // El backend resuelve el español al inglés, así que la palabra que se
    // guarda es la que devuelve el lookup, no necesariamente la escrita.
    const saveWord = async (full, typed, meanings) => {
        const word = (full.word || typed).trim();
        const firstTr = meanings?.[0]?.translation_es || '';
        await api.words.create({
            word,
            translation: firstTr || word,   // el backend la re-deriva uniendo todas
            meanings: meanings || [],
            common_phrases: full.common_phrases || [],
            phonetic: full.phonetic || null,
            // La familia viene en la MISMA respuesta: guardarla no cuesta
            // ninguna llamada extra.
            family: full.family || null,
        });
        toast(`"${word}" guardada ✓`, 'success', {
            actionLabel: 'Ver',
            onAction: () => { window.location.hash = '#/words'; },
        });
        input.value = '';
        input.focus();
    };

    const runLookup = () => {
        const typed = input.value.trim();
        if (!typed) { input.focus(); return; }
        closeSuggest();
        openLookupModal(typed, {
            onSaveAll: (full) => saveWord(full, typed, full.meanings || []),
            // "Usar este": guarda la palabra sólo con la acepción elegida.
            onPickMeaning: (meaning, full) => saveWord(full, typed, [meaning]),
        });
    };

    button.addEventListener('click', runLookup);

    // ── Sugerencias del diccionario local (sin IA) ───────────
    // Se consultan las dos direcciones a la vez: son consultas por prefijo
    // contra tablas locales, y así escribir "apen…" o "hard…" sugiere igual.
    const box = document.getElementById('tb-suggest');
    let items = [];
    let active = -1;
    let timer = null;

    function closeSuggest() {
        if (!box) return;
        box.classList.add('hidden');
        box.innerHTML = '';
        items = [];
        active = -1;
    }
    function renderSuggest() {
        if (!box) return;
        if (!items.length) { closeSuggest(); return; }
        box.innerHTML = items.map((s, i) => `
            <div class="dict-suggest-item ${i === active ? 'active' : ''}" data-i="${i}">
                <span class="ds-word">${esc(s.word)}</span>
                <span class="ds-trans">${esc(s.translation)}</span>
            </div>`).join('');
        box.classList.remove('hidden');
    }
    function pickSuggest(i) {
        const s = items[i];
        if (!s) return;
        input.value = s.word;
        closeSuggest();
        input.focus();
    }

    if (box) {
        box.classList.add('hidden');
        box.removeAttribute('hidden');
        box.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.dict-suggest-item');
            if (item) { e.preventDefault(); pickSuggest(parseInt(item.dataset.i, 10)); }
        });
        input.addEventListener('blur', () => setTimeout(closeSuggest, 120));
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (q.length < 2) { closeSuggest(); return; }
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (input.value.trim() !== q) return;   // siguió escribiendo
            try {
                const [en, es] = await Promise.all([
                    api.dictionary.suggest(q, 'en-es').catch(() => ({ suggestions: [] })),
                    api.dictionary.suggest(q, 'es-en').catch(() => ({ suggestions: [] })),
                ]);
                if (input.value.trim() !== q) return;
                items = [...(en.suggestions || []).slice(0, 4), ...(es.suggestions || []).slice(0, 3)];
                active = -1;
                renderSuggest();
            } catch (_) { closeSuggest(); }
        }, 180);
    });

    input.addEventListener('keydown', (e) => {
        const open = box && !box.classList.contains('hidden');
        if (e.key === 'ArrowDown' && open) {
            e.preventDefault(); active = Math.min(active + 1, items.length - 1); renderSuggest();
        } else if (e.key === 'ArrowUp' && open) {
            e.preventDefault(); active = Math.max(active - 1, 0); renderSuggest();
        } else if (e.key === 'Escape') {
            if (open) closeSuggest(); else input.blur();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && active >= 0) pickSuggest(active);
            else runLookup();
        }
    });

    // Ctrl+K desde cualquier parte; "/" sólo si no estás escribiendo en otro campo.
    document.addEventListener('keydown', (e) => {
        const typingElsewhere = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')
            || document.activeElement?.isContentEditable;
        const isShortcut = (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey);
        if (isShortcut || (e.key === '/' && !typingElsewhere)) {
            if (!document.body.classList.contains('desktop-shell')) return;
            e.preventDefault();
            input.focus();
            input.select();
        }
    });
}

// ── Arranque ─────────────────────────────────────────────────
export function initShell() {
    try {
        syncShellClass();
        initSidebarCollapse();
        initThemeToggle();
        initCapture();

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
