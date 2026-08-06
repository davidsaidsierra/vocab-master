import * as api from '../api.js';
import { masteryColor, formatDate, truncate, toast, cefrBadgeHTML } from '../utils/helpers.js';
import { openLookupModal } from './lookupModal.js';
import { openFamilyModal } from './familyMatrix.js';
import { render as renderCategories } from './categoriesPage.js';
import { POS_OPTIONS, CEFR_OPTIONS, DAYS_OPTIONS, MASTERY_OPTIONS, optionsHTML } from '../utils/wordFilters.js';

let categoriesCache = [];

// Urgencia de repaso — es lo que colorea la franja de la tarjeta. El color
// aquí significa algo: vencida, para hoy, o al día.
function urgencia(nextReview) {
    if (!nextReview) return 'ok';
    const fecha = new Date(nextReview);
    if (Number.isNaN(fecha.getTime())) return 'ok';
    const ahora = new Date();
    if (fecha <= ahora) return 'due';
    if (fecha.toDateString() === ahora.toDateString()) return 'today';
    return 'ok';
}

export async function render(container) {
    container.innerHTML = `
        <div class="page-enter" id="words-page">
            <div class="page-header">
                <div>
                    <h2>My Words</h2>
                    <p class="ph-sub" id="words-count">Cargando…</p>
                </div>
                <div class="ph-actions">
                    <input type="text" id="search-input" class="form-input" placeholder="Buscar palabra…" style="padding:0.5rem 0.9rem;font-size:0.85rem;width:13rem">
                    <button id="categories-btn" class="btn-secondary" title="Crear, ver y borrar categorías" style="white-space:nowrap">🏷️ Categorías</button>
                    <button id="backfill-levels-btn" class="btn-secondary" title="Asigna el nivel CEFR (A1–C2) a las palabras que aún no lo tienen. Sin IA, no toca nada más." style="white-space:nowrap">↻ Actualizar niveles</button>
                    <button id="link-families-btn" class="btn-secondary" title="Absorbe las palabras sueltas que ya pertenecen a una familia (helpful dentro de help). Sin IA." style="white-space:nowrap">🧬 Vincular familias</button>
                </div>
            </div>
            <!-- ── Filtros (mismos que en Repaso) ─────────── -->
            <div class="flex flex-wrap gap-3 items-end mb-6">
                <div class="min-w-[150px]">
                    <label class="block text-xs txt-secondary mb-1">Category</label>
                    <select id="filter-category" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                        <option value="">All Categories</option>
                    </select>
                </div>
                <div class="min-w-[150px]">
                    <label class="block text-xs txt-secondary mb-1">Added in the last…</label>
                    <select id="filter-days" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                        ${optionsHTML(DAYS_OPTIONS)}
                    </select>
                </div>
                <div class="min-w-[140px]">
                    <label class="block text-xs txt-secondary mb-1">Level (CEFR)</label>
                    <select id="filter-level" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                        ${optionsHTML(CEFR_OPTIONS)}
                    </select>
                </div>
                <div class="min-w-[150px]">
                    <label class="block text-xs txt-secondary mb-1">Mastery level</label>
                    <select id="filter-mastery" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                        ${optionsHTML(MASTERY_OPTIONS)}
                    </select>
                </div>
                <div class="min-w-[150px]">
                    <label class="block text-xs txt-secondary mb-1">Categoría gramatical</label>
                    <select id="filter-pos" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                        ${optionsHTML(POS_OPTIONS)}
                    </select>
                </div>
            </div>
            <div id="words-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <p class="txt-secondary">Loading…</p>
            </div>
        </div>
    `;

    const grid = container.querySelector('#words-grid');
    const searchInput = container.querySelector('#search-input');
    const filterCat = container.querySelector('#filter-category');
    const filterDays = container.querySelector('#filter-days');
    const filterLevel = container.querySelector('#filter-level');
    const filterMastery = container.querySelector('#filter-mastery');
    const filterPos = container.querySelector('#filter-pos');
    const backfillBtn = container.querySelector('#backfill-levels-btn');
    const linkFamiliesBtn = container.querySelector('#link-families-btn');

    // ── Categorías: la página completa, dentro de un modal ──────
    // `categoriesPage.render(contenedor)` no asume nada de dónde vive (todo lo
    // consulta relativo al contenedor que recibe), así que se monta tal cual.
    container.querySelector('#categories-btn').addEventListener('click', () => {
        document.querySelector('.modal-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:720px;max-height:85vh;overflow-y:auto">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold">🏷️ Categorías</h3>
                    <button class="btn-ghost" id="cats-close" aria-label="Cerrar">✕</button>
                </div>
                <div id="cats-host"></div>
            </div>`;
        document.body.appendChild(overlay);

        const cerrar = async () => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            // Pudieron crearse o borrarse categorías: refrescar filtro y tarjetas.
            await recargarCategorias();
            await loadWords();
        };
        const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
        overlay.querySelector('#cats-close').addEventListener('click', cerrar);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        document.addEventListener('keydown', onKey);

        renderCategories(overlay.querySelector('#cats-host'), { embedded: true });
    });

    // ── Vincular palabras sueltas a las familias existentes (sin IA) ──
    linkFamiliesBtn.addEventListener('click', async () => {
        linkFamiliesBtn.disabled = true;
        const prev = linkFamiliesBtn.textContent;
        linkFamiliesBtn.textContent = 'Vinculando…';
        try {
            const r = await api.words.linkFamilies();
            toast(r.linked > 0
                ? `${r.linked} palabra${r.linked !== 1 ? 's' : ''} absorbida${r.linked !== 1 ? 's' : ''} por su familia`
                : `Todo al día — ${r.families} familia${r.families !== 1 ? 's' : ''}, ${r.members} palabra${r.members !== 1 ? 's' : ''} dentro`);
            await loadWords();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            linkFamiliesBtn.disabled = false;
            linkFamiliesBtn.textContent = prev;
        }
    });

    // ── Actualizar niveles CEFR de palabras viejas (sin IA) ──────
    backfillBtn.addEventListener('click', async () => {
        backfillBtn.disabled = true;
        const prev = backfillBtn.textContent;
        backfillBtn.textContent = 'Actualizando…';
        try {
            const r = await api.words.backfillLevels();
            toast(r.updated > 0
                ? `${r.updated} palabra${r.updated !== 1 ? 's' : ''} actualizada${r.updated !== 1 ? 's' : ''} con su nivel`
                : 'Todo al día — no había niveles por completar');
            await loadWords();
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            backfillBtn.disabled = false;
            backfillBtn.textContent = prev;
        }
    });

    // Load categories for filter + edit modal
    async function recargarCategorias() {
        const previo = filterCat.value;
        categoriesCache = await api.categories.list();
        filterCat.innerHTML = '<option value="">All Categories</option>';
        categoriesCache.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.icon} ${c.name}`;
            filterCat.appendChild(opt);
        });
        // Conservar el filtro elegido si esa categoría sigue existiendo.
        if (previo && categoriesCache.some(c => String(c.id) === String(previo))) {
            filterCat.value = previo;
        }
    }
    await recargarCategorias();

    let allWords = [];

    async function loadWords() {
        const params = {};
        if (searchInput.value.trim()) params.search = searchInput.value.trim();
        if (filterCat.value) params.category_id = filterCat.value;
        if (filterDays.value !== '') params.days = filterDays.value;
        if (filterLevel.value) params.cefr_level = filterLevel.value;
        if (filterMastery.value !== '') params.mastery_max = filterMastery.value;
        if (filterPos.value) params.part_of_speech = filterPos.value;
        allWords = await api.words.list(params);
        const n = allWords.length;
        const countEl = container.querySelector('#words-count');
        if (countEl) countEl.textContent = `${n} palabra${n !== 1 ? 's' : ''} en tu repositorio`;
        renderGrid();
    }

    function renderGrid() {
        if (allWords.length === 0) {
            grid.innerHTML = `
                <div class="empty-state col-span-full">
                    <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                    <p class="text-lg font-medium">No words yet</p>
                    <p class="text-sm mt-1">Start adding words with the <a href="#/add" class="text-brand-400 hover:underline">Add Word</a> page.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = allWords.map(w => {
            const color = masteryColor(w.mastery_level);
            // Badge de familia: cuántas casillas de la matriz están llenas.
            const famSlots = w.family
                ? Object.values(w.family.slots || {}).filter(Boolean).length
                : 0;
            const famBadge = w.family
                ? `<span class="badge wcard-badge-family" title="Familia de palabras: ${famSlots} formas + ${(w.family.phrasals || []).length} phrasals">🧬 ${famSlots}</span>`
                : '';
            const catBadge = w.category_name
                ? `<span class="badge" style="background:${w.category_color}22;color:${w.category_color}">${w.category_icon} ${w.category_name}</span>`
                : '';
            return `
                <div class="word-card" data-urgency="${urgencia(w.next_review)}">
                    <div class="wcard-top">
                        <div class="wcard-lead">
                            <h3 class="wcard-word">${w.word}</h3>
                            <p class="wcard-tr">${w.translation}</p>
                        </div>
                        <div class="wcard-actions">
                            ${w.family ? `<button class="btn-edit text-xs family-word" data-id="${w.id}" title="Ver la familia completa">🧬</button>` : ''}
                            <button class="btn-edit text-xs lookup-word" data-id="${w.id}" title="Ver significados">🔍</button>
                            <button class="btn-edit text-xs edit-word" data-id="${w.id}" title="Editar">✏️</button>
                            <button class="btn-danger text-xs delete-word" data-id="${w.id}" title="Borrar">✕</button>
                        </div>
                    </div>
                    <div class="wcard-meta">
                        ${w.part_of_speech ? `<span class="eyebrow">${w.part_of_speech}</span>` : ''}
                        ${cefrBadgeHTML(w.cefr_level)}
                        ${(w.meanings && w.meanings.length > 1) ? `<span class="badge wcard-badge-quiet" title="Significados guardados">${w.meanings.length} sig.</span>` : ''}
                        ${famBadge}
                        ${catBadge}
                    </div>
                    ${w.example ? `<p class="wcard-example">"${truncate(w.example, 80)}"</p>` : ''}
                    <div class="wcard-foot">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${w.mastery_level}%;background:${color}"></div>
                        </div>
                        <span class="wcard-mastery tnum" style="color:${color}" title="Nivel de dominio">${Math.round(w.mastery_level)}%</span>
                    </div>
                </div>
            `;
        }).join('');

        // ── Familia (matriz slot × significados) ────────────
        grid.querySelectorAll('.family-word').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = allWords.find(w => w.id === parseInt(btn.dataset.id));
                if (word) openFamilyModal(word);
            });
        });

        // ── Lookup handlers ─────────────────────────────────
        grid.querySelectorAll('.lookup-word').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = allWords.find(w => w.id === parseInt(btn.dataset.id));
                if (!word) return;
                openLookupModal(word.word, {
                    // Guardar-todo: actualiza la palabra con TODAS sus acepciones.
                    onSaveAll: async (full) => {
                        await api.words.update(word.id, {
                            meanings: full.meanings || [],
                            common_phrases: full.common_phrases || [],
                            phonetic: full.phonetic || null,
                        });
                        // La familia va por su propio endpoint (valida la matriz
                        // y absorbe parientes). Si ya existe esa familia en otra
                        // palabra el backend responde 409: no es un error que
                        // deba romper el guardado de los significados.
                        if (full.family && !word.family) {
                            try {
                                await api.words.setFamily(word.id, full.family);
                            } catch (e) {
                                console.warn('familia no aplicada:', e.message);
                            }
                        }
                        toast(`"${word.word}" actualizada con todos sus significados ✓`);
                        loadWords();
                    },
                    // Alternativa: guardar solo un significado elegido.
                    onPickMeaning: async (meaning) => {
                        const firstEx = (meaning.examples && meaning.examples[0]) || null;
                        await api.words.update(word.id, {
                            translation: meaning.translation_es || word.translation,
                            definition:  meaning.definition_en  || word.definition || null,
                            example:     firstEx ? firstEx.en   : (word.example || null),
                        });
                        toast(`"${word.word}" guardada ✓`);
                        loadWords();
                    }
                });
            });
        });

        // ── Edit handlers ───────────────────────────────────
        grid.querySelectorAll('.edit-word').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = allWords.find(w => w.id === parseInt(btn.dataset.id));
                if (word) openEditModal(word, loadWords);
            });
        });

        // ── Delete handlers ─────────────────────────────────
        grid.querySelectorAll('.delete-word').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this word?')) return;
                try {
                    await api.words.delete(btn.dataset.id);
                    toast('Word deleted');
                    loadWords();
                } catch (err) {
                    toast(err.message, 'error');
                }
            });
        });
    }

    // Events
    let debounce;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(loadWords, 300);
    });
    filterCat.addEventListener('change', loadWords);
    filterDays.addEventListener('change', loadWords);
    filterLevel.addEventListener('change', loadWords);
    filterMastery.addEventListener('change', loadWords);
    filterPos.addEventListener('change', loadWords);

    await loadWords();
}


// ── Edit modal ──────────────────────────────────────────────
function openEditModal(word, onSave) {
    // Remove existing modal if any
    document.querySelector('.modal-overlay')?.remove();

    const catOptions = categoriesCache.map(c =>
        `<option value="${c.id}" ${c.id === word.category_id ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content">
            <div class="flex items-center justify-between mb-5">
                <h3 class="text-lg font-bold">Edit Word</h3>
                <button class="txt-secondary txt-hover text-xl" id="modal-close">✕</button>
            </div>
            <form id="edit-form" class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs txt-secondary mb-1">Word *</label>
                        <input type="text" name="word" class="form-input" value="${escHtml(word.word)}" required>
                    </div>
                    <div>
                        <label class="block text-xs txt-secondary mb-1">Translation *</label>
                        <input type="text" name="translation" class="form-input" value="${escHtml(word.translation)}" required>
                    </div>
                </div>
                <div>
                    <label class="block text-xs txt-secondary mb-1">Definition</label>
                    <input type="text" name="definition" class="form-input" value="${escHtml(word.definition || '')}">
                </div>
                <div>
                    <label class="block text-xs txt-secondary mb-1">Example</label>
                    <textarea name="example" rows="2" class="form-input">${escHtml(word.example || '')}</textarea>
                </div>
                <div>
                    <label class="block text-xs txt-secondary mb-1">Notes</label>
                    <textarea name="notes" rows="2" class="form-input">${escHtml(word.notes || '')}</textarea>
                </div>
                <div>
                    <label class="block text-xs txt-secondary mb-1">Category</label>
                    <select name="category_id" class="form-input">
                        <option value="" ${!word.category_id ? 'selected' : ''}>None</option>
                        ${catOptions}
                    </select>
                </div>
                <div class="flex gap-3 pt-1">
                    <button type="submit" class="btn-primary flex-1">Save Changes</button>
                    <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const close = () => overlay.remove();
    overlay.querySelector('#modal-close').addEventListener('click', close);
    overlay.querySelector('#modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Submit handler
    overlay.querySelector('#edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const data = {
            word: form.word.value.trim(),
            translation: form.translation.value.trim(),
            definition: form.definition.value.trim() || null,
            example: form.example.value.trim() || null,
            notes: form.notes.value.trim() || null,
            category_id: form.category_id.value ? parseInt(form.category_id.value) : null,
        };
        try {
            await api.words.update(word.id, data);
            toast('Word updated!');
            close();
            onSave();
        } catch (err) {
            toast(err.message, 'error');
        }
    });
}


function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
