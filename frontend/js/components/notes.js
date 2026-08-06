// ── Apuntes ──────────────────────────────────────────────────
// Texto plano y nada más: cada quien aprende inglés a su manera y la
// estructura la pone quien escribe, no la app. Lista a la izquierda,
// editor a la derecha, guardado solo.
import * as api from '../api.js';
import { toast } from '../utils/helpers.js';

const AUTOSAVE_MS = 800;

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fechaCorta(iso) {
    try {
        const d = new Date(iso);
        const hoy = new Date();
        const mismoDia = d.toDateString() === hoy.toDateString();
        return mismoDia
            ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    } catch (_) {
        return '';
    }
}

function resumen(texto) {
    const limpio = (texto || '').replace(/\s+/g, ' ').trim();
    return limpio ? limpio.slice(0, 60) : 'Vacío';
}

export async function render(container) {
    container.innerHTML = `
        <div class="page-enter">
            <div class="page-header">
                <div>
                    <h2>Apuntes</h2>
                    <p class="ph-sub">Notas rápidas en texto plano. Se guardan solas.</p>
                </div>
                <div class="ph-actions">
                    <span class="nt-status" id="nt-status"></span>
                    <button id="nt-new" class="btn-primary">＋ Nueva nota</button>
                </div>
            </div>

            <div class="nt-layout">
                <aside class="nt-list" id="nt-list"></aside>
                <section class="nt-editor" id="nt-editor"></section>
            </div>
        </div>
    `;

    const listEl   = container.querySelector('#nt-list');
    const editorEl = container.querySelector('#nt-editor');
    const statusEl = container.querySelector('#nt-status');

    let notas = [];
    let activaId = null;
    let timer = null;
    let pendiente = false;

    const setStatus = (txt) => { statusEl.textContent = txt; };

    function pintarLista() {
        if (!notas.length) {
            listEl.innerHTML = `<p class="nt-empty">Todavía no hay apuntes.</p>`;
            return;
        }
        listEl.innerHTML = notas.map(n => `
            <button type="button" class="nt-item ${n.id === activaId ? 'active' : ''}" data-id="${n.id}">
                <span class="nt-item-title">${esc(n.title)}</span>
                <span class="nt-item-meta">${esc(fechaCorta(n.updated_at))} · ${esc(resumen(n.content))}</span>
            </button>
        `).join('');
    }

    function pintarEditor() {
        const nota = notas.find(n => n.id === activaId);
        if (!nota) {
            editorEl.innerHTML = `
                <div class="nt-placeholder">
                    <p>Elige un apunte o crea uno nuevo.</p>
                </div>`;
            return;
        }
        editorEl.innerHTML = `
            <div class="nt-editor-head">
                <input id="nt-title" class="nt-title" value="${esc(nota.title)}"
                       maxlength="200" placeholder="Título" aria-label="Título del apunte">
                <button id="nt-delete" class="btn-danger" title="Borrar este apunte">Borrar</button>
            </div>
            <textarea id="nt-content" class="nt-content" spellcheck="false"
                      placeholder="Escribe aquí…">${esc(nota.content)}</textarea>
        `;

        const titleEl = editorEl.querySelector('#nt-title');
        const contentEl = editorEl.querySelector('#nt-content');

        titleEl.addEventListener('input', programarGuardado);
        contentEl.addEventListener('input', programarGuardado);

        editorEl.querySelector('#nt-delete').addEventListener('click', async () => {
            if (!confirm(`¿Borrar "${nota.title}"? No se puede deshacer.`)) return;
            clearTimeout(timer);
            try {
                await api.notes.delete(nota.id);
                notas = notas.filter(n => n.id !== nota.id);
                activaId = notas[0]?.id ?? null;
                pintarLista();
                pintarEditor();
                setStatus('');
                toast('Apunte borrado');
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    // Autoguardado: se espera a que dejes de escribir para no disparar una
    // petición por tecla.
    function programarGuardado() {
        pendiente = true;
        setStatus('Sin guardar…');
        clearTimeout(timer);
        timer = setTimeout(guardar, AUTOSAVE_MS);
    }

    async function guardar() {
        const nota = notas.find(n => n.id === activaId);
        if (!nota || !pendiente) return;
        const titleEl = editorEl.querySelector('#nt-title');
        const contentEl = editorEl.querySelector('#nt-content');
        if (!titleEl || !contentEl) return;
        try {
            const actualizada = await api.notes.update(nota.id, {
                title: titleEl.value,
                content: contentEl.value,
            });
            pendiente = false;
            Object.assign(nota, actualizada);
            // Reordenar: la recién tocada primero, como hace el backend.
            notas.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            pintarLista();
            setStatus('Guardado');
        } catch (err) {
            setStatus('');
            toast(err.message, 'error');
        }
    }

    listEl.addEventListener('click', (e) => {
        const item = e.target.closest('.nt-item');
        if (!item) return;
        const id = parseInt(item.dataset.id, 10);
        if (id === activaId) return;
        clearTimeout(timer);
        guardar();                 // no perder lo escrito al cambiar de nota
        activaId = id;
        setStatus('');
        pintarLista();
        pintarEditor();
    });

    container.querySelector('#nt-new').addEventListener('click', async () => {
        try {
            const nueva = await api.notes.create({ title: 'Sin título', content: '' });
            notas.unshift(nueva);
            activaId = nueva.id;
            pintarLista();
            pintarEditor();
            editorEl.querySelector('#nt-title')?.select();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Guardar lo pendiente si se cierra la pestaña a media escritura.
    window.addEventListener('beforeunload', () => { if (pendiente) guardar(); });

    try {
        notas = await api.notes.list();
    } catch (err) {
        listEl.innerHTML = `<p class="nt-empty">No se pudieron cargar los apuntes.</p>`;
        toast(err.message, 'error');
        return;
    }
    activaId = notas[0]?.id ?? null;
    pintarLista();
    pintarEditor();
}
