import * as api from '../api.js';
import { toast } from '../utils/helpers.js';
import { openLookupModal } from './lookupModal.js';

// Escape básico para texto del diccionario (headwords como "&" existen).
function esc(s) {
    return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Autocompletado por prefijo reutilizable (diccionario offline) ──────────
// Crea un desplegable de máx. 5 ítems anclado bajo `input`.
// opts.onPick(suggestion) → al elegir una sugerencia.
// opts.onEnter(text)      → al pulsar Enter SIN sugerencia seleccionada.
function attachAutocomplete(input, opts = {}) {
    const parent = input.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const dd = document.createElement('div');
    dd.className = 'dict-suggest hidden';
    parent.appendChild(dd);

    let items = [];
    let active = -1;
    let timer = null;

    const place = () => {
        dd.style.top = (input.offsetTop + input.offsetHeight + 4) + 'px';
        dd.style.left = input.offsetLeft + 'px';
        dd.style.width = input.offsetWidth + 'px';
    };
    const close = () => { dd.classList.add('hidden'); dd.innerHTML = ''; items = []; active = -1; };
    const render = () => {
        if (!items.length) { close(); return; }
        place();
        dd.innerHTML = items.map((s, i) => `
            <div class="dict-suggest-item ${i === active ? 'active' : ''}" data-i="${i}">
                <span class="ds-word">${esc(s.word)}</span>
                <span class="ds-trans">${esc(s.translation)}</span>
            </div>`).join('');
        dd.classList.remove('hidden');
    };
    const choose = (i) => {
        const s = items[i];
        if (!s) return;
        close();
        opts.onPick && opts.onPick(s);
    };

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (q.length < 1) { close(); return; }
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (input.value.trim() !== q) return;
            try {
                const res = await api.dictionary.suggest(q);
                items = res.suggestions || [];
                active = -1;
                render();
            } catch { close(); }
        }, 150);
    });

    input.addEventListener('keydown', (e) => {
        const open = !dd.classList.contains('hidden');
        if (e.key === 'ArrowDown' && open) { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
        else if (e.key === 'ArrowUp' && open) { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
        else if (e.key === 'Escape') { close(); }
        else if (e.key === 'Enter') {
            if (open && active >= 0) { e.preventDefault(); choose(active); }
            else if (opts.onEnter) { e.preventDefault(); close(); opts.onEnter(input.value); }
        }
    });

    // mousedown (no click) para que dispare antes del blur del input.
    dd.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.dict-suggest-item');
        if (item) { e.preventDefault(); choose(parseInt(item.dataset.i)); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));

    return { close };
}

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
                            <input type="text" name="word" autocomplete="off" class="form-input flex-1" placeholder="e.g. serendipity" required>
                            <button type="button" id="lookup-btn" class="btn-secondary" title="Buscar significados con IA" style="padding:0.75rem 0.9rem">🔍</button>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">Mientras escribes verás sugerencias del diccionario. Pulsa 🔍 para significados completos con IA.</p>
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
                <div>
                    <label class="block text-sm text-slate-400 mb-1">Category</label>
                    <select name="category_id" class="form-input">
                        <option value="">No category</option>
                        ${cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="flex gap-3 pt-2">
                    <button type="submit" class="btn-primary flex-1">Add Word</button>
                    <button type="reset" class="btn-secondary">Clear</button>
                </div>
            </form>

            <!-- Quick capture (modo clase) -->
            <div class="card mt-6" id="quick-capture-card">
                <h3 class="text-sm font-semibold text-slate-400 mb-1">⚡ Captura rápida (modo clase)</h3>
                <p class="text-xs text-slate-500 mb-3">Escribe una palabra y pulsa <kbd>Enter</kbd> (o elige una sugerencia): se guarda al instante con traducción offline. La IA completa cada ${5} palabras.</p>
                <div class="qc-input-wrap">
                    <input type="text" id="qc-input" autocomplete="off" class="form-input" placeholder="Escribe en inglés y Enter…">
                </div>
                <div class="qc-status mt-3">
                    <span class="text-xs text-slate-400">Pendientes de enriquecer: <strong id="qc-pending">0</strong> / 5</span>
                    <button id="qc-enrich-btn" class="btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.8rem">✨ Enriquecer ahora</button>
                </div>
                <ul id="qc-recent" class="qc-recent mt-3"></ul>
            </div>

            <!-- Quick add (pegar varias) -->
            <div class="card mt-6">
                <h3 class="text-sm font-semibold text-slate-400 mb-3">📋 Quick Add (pegar lista)</h3>
                <p class="text-xs text-slate-500 mb-3">Pega varias palabras (una por línea: <code class="text-brand-400">word — translation</code>)</p>
                <textarea id="quick-add-input" rows="4" class="form-input mb-3" placeholder="serendipity — serendipia&#10;ephemeral — efímero&#10;ubiquitous — ubicuo"></textarea>
                <button id="quick-add-btn" class="btn-primary">Add All</button>
            </div>
        </div>
    `;

    const form = container.querySelector('#word-form');
    const wordInput = container.querySelector('[name="word"]');

    // ── Autocompletado en el campo principal ───────────────
    attachAutocomplete(wordInput, {
        onPick: (s) => {
            wordInput.value = s.word;
            if (!form.translation.value.trim()) form.translation.value = s.translation;
            form.translation.focus();
        },
    });

    // ── Lookup button (AI contextual translation) ──────────
    const lookupBtn = container.querySelector('#lookup-btn');
    lookupBtn.addEventListener('click', () => {
        const w = wordInput.value.trim();
        if (!w) {
            toast('Escribe una palabra primero', 'error');
            wordInput.focus();
            return;
        }
        openLookupModal(w, {
            onPickMeaning: (meaning, full) => {
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

    // Form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            word: form.word.value.trim(),
            translation: form.translation.value.trim(),
            definition: form.definition.value.trim() || null,
            example: form.example.value.trim() || null,
            notes: form.notes.value.trim() || null,
            category_id: form.category_id.value ? parseInt(form.category_id.value) : null,
        };
        try {
            await api.words.create(data);
            toast(`"${data.word}" added!`);
            form.reset();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // ── Captura rápida ─────────────────────────────────────
    const qcInput = container.querySelector('#qc-input');
    const qcPending = container.querySelector('#qc-pending');
    const qcRecent = container.querySelector('#qc-recent');
    const qcEnrichBtn = container.querySelector('#qc-enrich-btn');
    let enriching = false;

    const setPending = (n) => { qcPending.textContent = n; };

    // Inicializa el contador con las pendientes reales.
    try {
        const pend = await api.words.pending();
        setPending(pend.length);
    } catch { /* sin conexión: empieza en 0 */ }

    const addRecent = (word, translation, pending) => {
        const li = document.createElement('li');
        li.className = 'qc-recent-item';
        li.dataset.word = word;
        li.innerHTML = `<span class="qc-rw">${esc(word)}</span>
                        <span class="qc-rt">${esc(translation || '—')}</span>
                        <span class="qc-rb ${pending ? 'pending' : 'done'}">${pending ? 'pendiente' : 'listo'}</span>`;
        qcRecent.prepend(li);
        while (qcRecent.children.length > 8) qcRecent.lastChild.remove();
    };

    const markRecentDone = (results) => {
        const map = new Map(results.map(r => [r.word, r]));
        qcRecent.querySelectorAll('.qc-recent-item').forEach(li => {
            const r = map.get(li.dataset.word);
            if (r) {
                const t = li.querySelector('.qc-rt');
                if (r.translation) t.textContent = r.translation;
                const b = li.querySelector('.qc-rb');
                b.textContent = 'listo'; b.classList.remove('pending'); b.classList.add('done');
            }
        });
    };

    const runEnrich = async (auto = false) => {
        if (enriching) return;
        enriching = true;
        qcEnrichBtn.disabled = true;
        const prevLabel = qcEnrichBtn.textContent;
        qcEnrichBtn.textContent = 'Enriqueciendo…';
        try {
            const res = await api.words.enrichPending();
            setPending(res.remaining_pending);
            markRecentDone(res.enriched || []);
            if ((res.enriched || []).length) toast(`${res.enriched.length} palabras enriquecidas ✨`);
            else if (!auto) toast('No hay palabras pendientes');
        } catch (err) {
            toast(err.message, 'error');
        } finally {
            enriching = false;
            qcEnrichBtn.disabled = false;
            qcEnrichBtn.textContent = prevLabel;
        }
    };

    const saveQuick = async (rawWord) => {
        const word = (rawWord || '').trim();
        if (!word) return;
        qcInput.value = '';
        try {
            const res = await api.words.quick({ word });
            const w = res.word;
            addRecent(w.word, w.translation, true);
            setPending(res.pending_count);
            // Dispara enriquecimiento automático al llegar a un múltiplo de 5.
            if (res.pending_count >= 5 && res.pending_count % 5 === 0) runEnrich(true);
        } catch (err) {
            toast(err.message, 'error');
        }
        qcInput.focus();
    };

    attachAutocomplete(qcInput, {
        onPick: (s) => saveQuick(s.word),
        onEnter: (text) => saveQuick(text),
    });
    qcEnrichBtn.addEventListener('click', () => runEnrich(false));

    // Quick add (pegar lista)
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
