import * as api from '../api.js';
import { starsHTML, masteryColor, formatDate, truncate, toast } from '../utils/helpers.js';
import { openLookupModal } from './lookupModal.js';

let categoriesCache = [];

export async function render(container) {
    container.innerHTML = `
        <div class="page-enter" id="words-page">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h2 class="text-2xl font-bold">My Words</h2>
                <div class="flex gap-3">
                    <input type="text" id="search-input" class="form-input w-56" placeholder="Search words…">
                    <select id="filter-category" class="form-input w-44">
                        <option value="">All Categories</option>
                    </select>
                </div>
            </div>
            <div id="words-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <p class="text-slate-500">Loading…</p>
            </div>
        </div>
    `;

    const grid = container.querySelector('#words-grid');
    const searchInput = container.querySelector('#search-input');
    const filterCat = container.querySelector('#filter-category');

    // Load categories for filter + edit modal
    categoriesCache = await api.categories.list();
    categoriesCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icon} ${c.name}`;
        filterCat.appendChild(opt);
    });

    let allWords = [];

    async function loadWords() {
        const params = {};
        if (searchInput.value.trim()) params.search = searchInput.value.trim();
        if (filterCat.value) params.category_id = filterCat.value;
        allWords = await api.words.list(params);
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
            const catBadge = w.category_name
                ? `<span class="badge" style="background:${w.category_color}22;color:${w.category_color}">${w.category_icon} ${w.category_name}</span>`
                : '';
            return `
                <div class="word-card" style="--card-accent:${w.category_color || '#8b5cf6'}">
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <h3 class="text-lg font-bold" style="color:var(--text-primary)">${w.word}</h3>
                            <p class="text-sm text-slate-400">${w.translation}</p>
                        </div>
                        <div class="flex gap-1">
                            <button class="btn-edit text-xs lookup-word" data-id="${w.id}" title="Ver significados">🔍</button>
                            <button class="btn-edit text-xs edit-word" data-id="${w.id}" title="Edit">✏️</button>
                            <button class="btn-danger text-xs delete-word" data-id="${w.id}" title="Delete">✕</button>
                        </div>
                    </div>
                    ${w.example ? `<p class="text-xs text-slate-500 italic mt-2 mb-2">"${truncate(w.example, 80)}"</p>` : ''}
                    <div class="flex items-center justify-between mt-3">
                        ${catBadge}
                        <div class="stars text-xs">${starsHTML(w.difficulty)}</div>
                    </div>
                    <div class="mt-3">
                        <div class="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Mastery</span>
                            <span style="color:${color}">${w.mastery_level}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${w.mastery_level}%;background:${color}"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // ── Lookup handlers ─────────────────────────────────
        grid.querySelectorAll('.lookup-word').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const word = allWords.find(w => w.id === parseInt(btn.dataset.id));
                if (!word) return;
                openLookupModal(word.word, {
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
                <button class="text-slate-500 hover:text-slate-300 text-xl" id="modal-close">✕</button>
            </div>
            <form id="edit-form" class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Word *</label>
                        <input type="text" name="word" class="form-input" value="${escHtml(word.word)}" required>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Translation *</label>
                        <input type="text" name="translation" class="form-input" value="${escHtml(word.translation)}" required>
                    </div>
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Definition</label>
                    <input type="text" name="definition" class="form-input" value="${escHtml(word.definition || '')}">
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Example</label>
                    <textarea name="example" rows="2" class="form-input">${escHtml(word.example || '')}</textarea>
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Notes</label>
                    <textarea name="notes" rows="2" class="form-input">${escHtml(word.notes || '')}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Category</label>
                        <select name="category_id" class="form-input">
                            <option value="" ${!word.category_id ? 'selected' : ''}>None</option>
                            ${catOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Difficulty</label>
                        <select name="difficulty" class="form-input">
                            ${[1,2,3,4,5].map(i => `<option value="${i}" ${i === word.difficulty ? 'selected' : ''}>${i} ${'★'.repeat(i)}</option>`).join('')}
                        </select>
                    </div>
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
            difficulty: parseInt(form.difficulty.value),
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
