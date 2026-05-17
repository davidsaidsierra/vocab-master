// ── Grammar Picker — modal para elegir un topic del KB ─────
//
// Uso:
//   import { openPicker } from './grammarPicker.js';
//   const topic = await openPicker();          // null si el usuario cierra
//   if (topic) { /* topic = { id, slug, section_number, title, level, category, content_md } */ }
//
// Layout: backdrop oscurece el fondo; modal centrado con:
//   - barra de búsqueda arriba (debounce 200ms, filtra cross-categoría)
//   - sidebar izquierda con categorías + contador
//   - pane derecho con la lista de temas

import { grammar as api } from '../api.js';

const SEARCH_DEBOUNCE_MS = 200;

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── State (per-instance) ───────────────────────────────────
function initialState() {
    return {
        categories: [],          // [{ category, count }]
        topics: [],              // [{ id, slug, section_number, title, level, category }]
        selectedCategory: null,  // string | null (null = "todas")
        query: '',
        loading: true,
    };
}

function modalHTML(state) {
    const totalCount = state.topics.length;
    const catList = [
        { category: null, label: `Todas (${totalCount})`, count: totalCount, isAll: true },
        ...state.categories.map(c => ({
            category: c.category,
            label: c.category || '(sin categoría)',
            count: c.count,
            isAll: false,
        })),
    ];

    const sidebarHTML = catList.map(c => {
        const active = (c.isAll && state.selectedCategory === null)
            || (!c.isAll && state.selectedCategory === c.category);
        return `
            <button class="gp-cat ${active ? 'gp-cat-active' : ''}"
                    data-cat="${c.isAll ? '__all' : escapeHtml(c.category ?? '__none')}">
                <span class="gp-cat-label">${escapeHtml(c.label)}</span>
                <span class="gp-cat-count">${c.count}</span>
            </button>
        `;
    }).join('');

    const filtered = filterTopics(state);
    const listHTML = filtered.length
        ? filtered.map(t => `
            <button class="gp-topic" data-slug="${escapeHtml(t.slug)}">
                <div class="gp-topic-num">#${String(t.section_number).padStart(3, '0')}</div>
                <div class="gp-topic-body">
                    <div class="gp-topic-title">${escapeHtml(t.title)}</div>
                    <div class="gp-topic-meta">
                        ${t.category ? `<span class="gp-topic-cat">${escapeHtml(t.category)}</span>` : ''}
                        ${t.level ? `<span class="gp-topic-level">${escapeHtml(t.level)}</span>` : ''}
                    </div>
                </div>
            </button>
        `).join('')
        : `<div class="gp-empty">No hay temas que coincidan con tu búsqueda.</div>`;

    return `
        <div class="gp-backdrop" data-close="1">
            <div class="gp-modal" role="dialog" aria-modal="true" aria-label="Elegir tema de gramática">
                <div class="gp-head">
                    <h3 class="gp-title">📚 Elegir tema de gramática</h3>
                    <button class="gp-close" data-close="1" aria-label="Cerrar">✕</button>
                </div>
                <div class="gp-search-row">
                    <input type="search" class="gp-search" id="gp-search-input"
                           placeholder="Buscar (ej: conditional, phrasal verb, passive…)"
                           value="${escapeHtml(state.query)}"
                           autofocus>
                    <div class="gp-result-count">${filtered.length} resultado${filtered.length === 1 ? '' : 's'}</div>
                </div>
                <div class="gp-body">
                    <aside class="gp-sidebar">${sidebarHTML}</aside>
                    <div class="gp-list">
                        ${state.loading ? '<div class="gp-empty">Cargando…</div>' : listHTML}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function filterTopics(state) {
    const q = state.query.trim().toLowerCase();
    return state.topics.filter(t => {
        // Búsqueda cross-categoría: si hay query, ignora el filtro de categoría
        // (así no se "pierde" un resultado al estar en una categoría no seleccionada).
        if (q) {
            const hay = (t.title + ' ' + (t.category || '') + ' #' + t.section_number).toLowerCase();
            return hay.includes(q);
        }
        if (state.selectedCategory !== null && t.category !== state.selectedCategory) {
            return false;
        }
        return true;
    });
}

// ── Public API ─────────────────────────────────────────────
export function openPicker() {
    return new Promise(async (resolve) => {
        const state = initialState();
        const root = document.createElement('div');
        document.body.appendChild(root);
        document.body.style.overflow = 'hidden';

        let searchTimer = null;

        function rerender() {
            root.innerHTML = modalHTML(state);
            bind();
            const input = document.getElementById('gp-search-input');
            if (input) {
                // Restaurar caret al final tras rerender (evita perder foco al teclear)
                input.focus();
                const v = input.value;
                input.setSelectionRange(v.length, v.length);
            }
        }

        function close(result) {
            document.body.removeChild(root);
            document.body.style.overflow = '';
            document.removeEventListener('keydown', onKey);
            resolve(result);
        }

        function onKey(e) {
            if (e.key === 'Escape') close(null);
        }
        document.addEventListener('keydown', onKey);

        function bind() {
            root.querySelectorAll('[data-close]').forEach(el => {
                el.addEventListener('click', (e) => {
                    // Solo cerrar si el click fue en el backdrop mismo, no burbujeado desde un hijo.
                    if (e.target === el) close(null);
                });
            });

            root.querySelectorAll('.gp-cat').forEach(btn => {
                btn.addEventListener('click', () => {
                    const v = btn.getAttribute('data-cat');
                    state.selectedCategory = v === '__all' ? null : (v === '__none' ? null : v);
                    state.query = '';  // limpiar búsqueda al cambiar categoría
                    rerender();
                });
            });

            root.querySelectorAll('.gp-topic').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const slug = btn.getAttribute('data-slug');
                    btn.disabled = true;
                    btn.textContent = 'Cargando…';
                    try {
                        const full = await api.topic(slug);
                        close(full);
                    } catch (err) {
                        alert(err && err.message ? err.message : 'Error al cargar el tema');
                        rerender();
                    }
                });
            });

            const input = document.getElementById('gp-search-input');
            if (input) {
                input.addEventListener('input', (e) => {
                    const v = e.target.value;
                    if (searchTimer) clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => {
                        state.query = v;
                        rerender();
                    }, SEARCH_DEBOUNCE_MS);
                });
            }
        }

        rerender();

        try {
            const [cats, topics] = await Promise.all([
                api.categories(),
                api.topics({ limit: 250 }),
            ]);
            state.categories = cats || [];
            state.topics = (topics && topics.topics) || [];
            state.loading = false;
            rerender();
        } catch (err) {
            state.loading = false;
            state.topics = [];
            rerender();
            const list = root.querySelector('.gp-list');
            if (list) list.innerHTML = `<div class="gp-empty">Error: ${escapeHtml(err.message || 'no se pudo cargar')}</div>`;
        }
    });
}
