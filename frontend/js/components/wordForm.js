import * as api from '../api.js';
import { toast } from '../utils/helpers.js';
import { openLookupModal } from './lookupModal.js';

export async function render(container) {
    const cats = await api.categories.list();

    container.innerHTML = `
        <div class="page-enter max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold mb-6">Add New Word</h2>
            <form id="word-form" class="card space-y-5">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-slate-400 mb-1">Word / Phrase *</label>
                        <div class="flex gap-2">
                            <input type="text" name="word" class="form-input flex-1" placeholder="e.g. serendipity" required>
                            <button type="button" id="lookup-btn" class="btn-secondary" title="Buscar significados con IA" style="padding:0.75rem 0.9rem">🔍</button>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">Escribe la palabra y pulsa 🔍 para ver todos sus significados y auto-rellenar los campos.</p>
                    </div>
                    <div>
                        <label class="block text-sm text-slate-400 mb-1">Translation *</label>
                        <input type="text" name="translation" class="form-input" placeholder="e.g. serendipia" required>
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-slate-400 mb-1">Definition</label>
                    <input type="text" name="definition" class="form-input" placeholder="Finding good things by chance">
                </div>
                <div>
                    <label class="block text-sm text-slate-400 mb-1">Example sentence</label>
                    <textarea name="example" rows="2" class="form-input" placeholder="It was pure serendipity that we met at the café."></textarea>
                </div>
                <div>
                    <label class="block text-sm text-slate-400 mb-1">Notes</label>
                    <textarea name="notes" rows="2" class="form-input" placeholder="Any personal notes…"></textarea>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-slate-400 mb-1">Category</label>
                        <select name="category_id" class="form-input">
                            <option value="">No category</option>
                            ${cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm text-slate-400 mb-2">Difficulty</label>
                        <div class="stars text-2xl" id="difficulty-stars">
                            ${[1,2,3,4,5].map(i => `<span class="star ${i <= 3 ? 'filled' : 'empty'}" data-value="${i}">★</span>`).join('')}
                        </div>
                        <input type="hidden" name="difficulty" value="3">
                    </div>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="submit" class="btn-primary flex-1">Add Word</button>
                    <button type="reset" class="btn-secondary">Clear</button>
                </div>
            </form>

            <!-- Quick add section -->
            <div class="card mt-6">
                <h3 class="text-sm font-semibold text-slate-400 mb-3">⚡ Quick Add</h3>
                <p class="text-xs text-slate-500 mb-3">Paste multiple words (one per line: <code class="text-brand-400">word — translation</code>)</p>
                <textarea id="quick-add-input" rows="4" class="form-input mb-3" placeholder="serendipity — serendipia&#10;ephemeral — efímero&#10;ubiquitous — ubicuo"></textarea>
                <button id="quick-add-btn" class="btn-primary">Add All</button>
            </div>
        </div>
    `;

    // ── Lookup button (AI contextual translation) ──────────
    const lookupBtn = container.querySelector('#lookup-btn');
    const wordInput = container.querySelector('[name="word"]');
    lookupBtn.addEventListener('click', () => {
        const w = wordInput.value.trim();
        if (!w) {
            toast('Escribe una palabra primero', 'error');
            wordInput.focus();
            return;
        }
        openLookupModal(w, {
            onPickMeaning: (meaning, full) => {
                const form = container.querySelector('#word-form');
                if (meaning.translation_es) form.translation.value = meaning.translation_es;
                if (meaning.definition_en && !form.definition.value.trim())
                    form.definition.value = meaning.definition_en;
                const firstExample = (meaning.examples && meaning.examples[0]) || null;
                if (firstExample && !form.example.value.trim())
                    form.example.value = firstExample.en;
                toast('Campos rellenados ✓');
            }
        });
    });

    // Difficulty stars interaction
    const starsContainer = container.querySelector('#difficulty-stars');
    const difficultyInput = container.querySelector('[name="difficulty"]');
    starsContainer.addEventListener('click', (e) => {
        const star = e.target.closest('.star');
        if (!star) return;
        const val = parseInt(star.dataset.value);
        difficultyInput.value = val;
        starsContainer.querySelectorAll('.star').forEach((s, i) => {
            s.classList.toggle('filled', i < val);
            s.classList.toggle('empty', i >= val);
        });
    });

    // Form submit
    container.querySelector('#word-form').addEventListener('submit', async (e) => {
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
            await api.words.create(data);
            toast(`"${data.word}" added!`);
            form.reset();
            difficultyInput.value = 3;
            starsContainer.querySelectorAll('.star').forEach((s, i) => {
                s.classList.toggle('filled', i < 3);
                s.classList.toggle('empty', i >= 3);
            });
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Quick add
    container.querySelector('#quick-add-btn').addEventListener('click', async () => {
        const input = container.querySelector('#quick-add-input');
        const lines = input.value.trim().split('\n').filter(l => l.includes('—') || l.includes('-'));
        let added = 0;
        for (const line of lines) {
            const sep = line.includes('—') ? '—' : '-';
            const [word, translation] = line.split(sep).map(s => s.trim());
            if (word && translation) {
                try {
                    await api.words.create({ word, translation });
                    added++;
                } catch { /* skip duplicates */ }
            }
        }
        toast(`${added} words added!`);
        input.value = '';
    });
}
