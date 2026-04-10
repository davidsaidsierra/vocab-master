// ── Lookup modal — shows Gemini-powered contextual meanings ─
import * as api from '../api.js';
import { toast } from '../utils/helpers.js';

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Opens a modal that fetches and displays all contextual meanings of a word.
 * @param {string} word - The English word/phrase to look up.
 * @param {object} [opts]
 * @param {(meaning: object) => void} [opts.onPickMeaning]
 *     If provided, adds a "Use this" button on each meaning that passes the
 *     chosen meaning back (useful to auto-fill the Add-Word form).
 */
export function openLookupModal(word, opts = {}) {
    // Remove any existing modal
    document.querySelector('.modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:640px;max-height:85vh;overflow-y:auto">
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h3 class="text-xl font-bold text-slate-100">
                        🔍 <span id="lookup-title">${esc(word)}</span>
                    </h3>
                    <p class="text-xs text-slate-500 mt-0.5" id="lookup-phonetic"></p>
                </div>
                <button class="text-slate-500 hover:text-slate-300 text-xl" id="lookup-close">✕</button>
            </div>
            <div id="lookup-body">
                <div class="text-center py-8 text-slate-400">
                    <div class="animate-spin inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mb-3"></div>
                    <p class="text-sm">Buscando significados contextuales…</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#lookup-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);

    const body = overlay.querySelector('#lookup-body');
    const phonetic = overlay.querySelector('#lookup-phonetic');

    api.lookup.get(word)
        .then((data) => renderLookup(data, body, phonetic, opts, close))
        .catch((err) => {
            body.innerHTML = `
                <div class="text-center py-6">
                    <p class="text-red-400 text-sm mb-2">⚠️ ${esc(err.message)}</p>
                    <p class="text-xs text-slate-500">
                        Revisa que <code>GEMINI_API_KEY</code> esté configurada en el backend.
                    </p>
                </div>
            `;
        });
}

function renderLookup(data, body, phonetic, opts, close) {
    if (data.phonetic) {
        phonetic.textContent = `${data.phonetic}${data.cached ? '  •  💾 cache' : '  •  ✨ nuevo'}`;
    } else {
        phonetic.textContent = data.cached ? '💾 cache' : '✨ nuevo';
    }

    const meanings = data.meanings || [];
    const phrases  = data.common_phrases || [];

    if (meanings.length === 0 && phrases.length === 0) {
        body.innerHTML = `<p class="text-slate-400 text-center py-6 text-sm">No se encontraron significados.</p>`;
        return;
    }

    const meaningsHTML = meanings.map((m, i) => `
        <div class="card p-4 mb-3" style="padding:1rem">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="badge" style="background:rgba(139,92,246,0.15);color:#a78bfa">${esc(m.part_of_speech || '—')}</span>
                    <span class="text-lg font-semibold text-brand-400">${esc(m.translation_es)}</span>
                </div>
                ${opts.onPickMeaning ? `<button class="btn-edit text-xs use-meaning" data-idx="${i}" title="Usar esta traducción">⤵ Usar</button>` : ''}
            </div>
            ${m.definition_en ? `<p class="text-xs text-slate-400 mb-1"><strong class="text-slate-300">EN:</strong> ${esc(m.definition_en)}</p>` : ''}
            ${m.definition_es ? `<p class="text-xs text-slate-400 mb-2"><strong class="text-slate-300">ES:</strong> ${esc(m.definition_es)}</p>` : ''}
            ${(m.examples || []).map(ex => `
                <div class="mt-2 pl-3 border-l-2 border-brand-500/40">
                    <p class="text-sm text-slate-200">"${esc(ex.en)}"</p>
                    <p class="text-xs text-slate-500 italic">${esc(ex.es)}</p>
                </div>
            `).join('')}
        </div>
    `).join('');

    const phrasesHTML = phrases.length ? `
        <h4 class="text-sm font-semibold text-slate-300 mt-4 mb-2">💬 Frases y expresiones comunes</h4>
        <div class="space-y-2">
            ${phrases.map(p => `
                <div class="card p-3" style="padding:0.75rem">
                    <div class="flex items-center justify-between">
                        <span class="font-semibold text-slate-100 text-sm">${esc(p.phrase)}</span>
                        <span class="text-xs text-brand-400">${esc(p.meaning_es)}</span>
                    </div>
                    ${p.example_en ? `
                        <p class="text-xs text-slate-400 mt-1">"${esc(p.example_en)}"</p>
                        <p class="text-xs text-slate-500 italic">${esc(p.example_es)}</p>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    ` : '';

    body.innerHTML = meaningsHTML + phrasesHTML;

    // Hook "Use this" buttons
    if (opts.onPickMeaning) {
        body.querySelectorAll('.use-meaning').forEach(btn => {
            const meaning = meanings[parseInt(btn.dataset.idx)];
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = '…';
                await opts.onPickMeaning(meaning, data);
                close();
            });
        });
    }
}
