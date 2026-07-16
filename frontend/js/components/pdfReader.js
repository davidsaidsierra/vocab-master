// ── Lector de PDF — resaltados, notas, guardar palabras y significado
//    contextual con IA. Usa PDF.js (cargado globalmente en index.html como
//    window.pdfjsLib) para renderizar páginas + capa de texto seleccionable.
import * as api from '../api.js';
import { toast } from '../utils/helpers.js';
import { openLookupModal } from './lookupModal.js';

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const HIGHLIGHT_COLORS = [
    { name: 'Yellow', value: '#fde68a' },
    { name: 'Green',  value: '#bbf7d0' },
    { name: 'Blue',   value: '#bfdbfe' },
    { name: 'Pink',   value: '#fbcfe8' },
    { name: 'Orange', value: '#fed7aa' },
    { name: 'Purple', value: '#e9d5ff' },
];

// ── Estado del lector (una instancia viva a la vez) ─────────
let state = null;

function freshState() {
    return {
        pdf: null,          // PDFDocumentProxy
        doc: null,          // DocumentOut (registro backend)
        file: null,         // File local (si storage local)
        page: 1,
        numPages: 0,
        scale: 1.2,
        annotations: [],    // todas las del documento
        vocabWords: [],     // palabras guardadas desde este documento
        bookmarksExpanded: false,
        vocabExpanded: false,
        saveTimer: null,
    };
}

async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function render(container) {
    state = freshState();

    container.innerHTML = `
        <div class="reader-wrap">
            <div class="reader-toolbar">
                <label class="btn-secondary reader-open-btn" title="Open a PDF from your computer">
                    📂 Open PDF
                    <input type="file" accept="application/pdf" id="reader-file-input" style="display:none">
                </label>
                <select id="reader-recent" class="form-input reader-recent-select" title="Recent documents">
                    <option value="">Recent…</option>
                </select>
                <div class="reader-toolbar-sep"></div>
                <button id="reader-prev" class="btn-edit" title="Previous page">◀</button>
                <span class="reader-page-label">
                    <input id="reader-page-input" type="number" min="1" value="1" class="reader-page-num">
                    / <span id="reader-num-pages">–</span>
                </span>
                <button id="reader-next" class="btn-edit" title="Next page">▶</button>
                <div class="reader-toolbar-sep"></div>
                <button id="reader-zoom-out" class="btn-edit" title="Zoom out">−</button>
                <button id="reader-zoom-in" class="btn-edit" title="Zoom in">+</button>
                <button id="reader-fit-width" class="btn-edit" title="Fit width">↔</button>
                <div class="reader-toolbar-sep"></div>
                <button id="reader-upload" class="btn-edit" title="Upload this PDF to the server (optional)" style="display:none">☁️ Upload</button>
                <span id="reader-status" class="reader-status"></span>
            </div>

            <div class="reader-body">
                <aside class="reader-sidebar" id="reader-sidebar">
                    <div class="reader-section">
                        <h4 class="reader-section-header" id="reader-bookmarks-header">▸ Bookmarks &amp; Notes (0)</h4>
                        <div id="reader-annotations-list" class="reader-annotations-list">
                            <p class="text-xs" style="color:var(--text-tertiary)">Open a PDF to get started.</p>
                        </div>
                    </div>
                    <div class="reader-section">
                        <h4 class="reader-section-header" id="reader-vocab-header">▸ Vocabulary (0)</h4>
                        <div id="reader-vocab-list" class="reader-vocab-list">
                            <p class="text-xs" style="color:var(--text-tertiary)">No words saved from this document yet.</p>
                        </div>
                    </div>
                </aside>
                <div class="reader-canvas-area" id="reader-canvas-area">
                    <div class="reader-empty" id="reader-empty">
                        <p>📄</p>
                        <p>Open a PDF from your computer to start reading, highlighting, taking notes, and saving words.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const fileInput = container.querySelector('#reader-file-input');
    const recentSelect = container.querySelector('#reader-recent');
    const pageInput = container.querySelector('#reader-page-input');
    const uploadBtn = container.querySelector('#reader-upload');
    const bookmarksHeader = container.querySelector('#reader-bookmarks-header');
    const vocabHeader = container.querySelector('#reader-vocab-header');

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) await openLocalFile(file, refs(container));
    });

    loadRecentDocuments(recentSelect);
    recentSelect.addEventListener('change', async () => {
        const val = recentSelect.value;
        if (!val) return;
        toast('To reopen a PDF from this list, select the same file again with "Open PDF" — only its fingerprint is stored, not the file itself.', 'success');
        recentSelect.value = '';
    });

    container.querySelector('#reader-prev').addEventListener('click', () => goToPage(state.page - 1, refs(container)));
    container.querySelector('#reader-next').addEventListener('click', () => goToPage(state.page + 1, refs(container)));
    pageInput.addEventListener('change', () => goToPage(parseInt(pageInput.value) || 1, refs(container)));
    container.querySelector('#reader-zoom-in').addEventListener('click', () => rescale(0.15, refs(container)));
    container.querySelector('#reader-zoom-out').addEventListener('click', () => rescale(-0.15, refs(container)));
    container.querySelector('#reader-fit-width').addEventListener('click', () => fitToWidth(refs(container)));
    uploadBtn.addEventListener('click', () => uploadCurrentFile(refs(container)));

    bookmarksHeader.addEventListener('click', () => {
        state.bookmarksExpanded = !state.bookmarksExpanded;
        renderAnnotationsList(refs(container));
    });
    vocabHeader.addEventListener('click', () => {
        state.vocabExpanded = !state.vocabExpanded;
        renderVocabList(refs(container));
    });
}

function refs(container) {
    return {
        canvasArea: container.querySelector('#reader-canvas-area'),
        pageInput: container.querySelector('#reader-page-input'),
        numPagesLabel: container.querySelector('#reader-num-pages'),
        statusEl: container.querySelector('#reader-status'),
        uploadBtn: container.querySelector('#reader-upload'),
        annotationsList: container.querySelector('#reader-annotations-list'),
        bookmarksHeader: container.querySelector('#reader-bookmarks-header'),
        vocabList: container.querySelector('#reader-vocab-list'),
        vocabHeader: container.querySelector('#reader-vocab-header'),
    };
}

async function loadRecentDocuments(selectEl) {
    try {
        const docs = await api.documents.list();
        selectEl.innerHTML = `<option value="">Recent… (${docs.length})</option>` +
            docs.map(d => `<option value="${d.id}">${esc(d.title)} — page ${d.last_page}</option>`).join('');
    } catch { /* silencioso: la lista de recientes es solo un atajo visual */ }
}

// ── Abrir un PDF local ───────────────────────────────────────
async function openLocalFile(file, ui) {
    ui.statusEl.textContent = 'Loading…';
    state.file = file;

    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);

    const loadingTask = window.pdfjsLib.getDocument({ data: buffer.slice(0) });
    const pdf = await loadingTask.promise;
    state.pdf = pdf;
    state.numPages = pdf.numPages;

    // ¿Ya conocemos este PDF (por su huella)? Si sí, recupera resume + anotaciones.
    let doc;
    try {
        doc = await api.documents.byHash(hash);
    } catch {
        doc = await api.documents.create({
            title: file.name.replace(/\.pdf$/i, ''),
            content_hash: hash,
            num_pages: pdf.numPages,
        });
    }
    state.doc = doc;
    state.page = Math.min(Math.max(doc.last_page || 1, 1), pdf.numPages);

    ui.numPagesLabel.textContent = pdf.numPages;
    ui.uploadBtn.style.display = doc.storage === 'uploaded' ? 'none' : '';
    ui.statusEl.textContent = doc.storage === 'uploaded' ? '☁️ Uploaded' : '💻 Local';

    document.getElementById('reader-empty')?.remove();

    try {
        state.annotations = await api.documents.annotations.list(doc.id);
    } catch {
        state.annotations = [];
    }
    try {
        state.vocabWords = await api.documents.words(doc.id);
    } catch {
        state.vocabWords = [];
    }
    renderAnnotationsList(ui);
    renderVocabList(ui);

    await goToPage(state.page, ui);
}

// ── Navegación de páginas ───────────────────────────────────
async function goToPage(page, ui) {
    if (!state.pdf) return;
    page = Math.min(Math.max(page, 1), state.numPages);
    state.page = page;
    ui.pageInput.value = page;
    // Mantener el "Continue reading" sincronizado en vivo mientras se navega,
    // sin esperar al PATCH debounced de scheduleSaveProgress().
    if (state.doc) state.doc.last_page = page;
    await renderPage(ui);
    renderAnnotationsList(ui);
    scheduleSaveProgress();
}

function rescale(delta, ui) {
    if (!state.pdf) return;
    state.scale = Math.min(Math.max(state.scale + delta, 0.5), 3);
    renderPage(ui);
}

// ── Ajustar el zoom al ancho disponible del área de lectura ──
async function fitToWidth(ui) {
    if (!state.pdf) return;
    const page = await state.pdf.getPage(state.page);
    const viewport = page.getViewport({ scale: 1 });
    const style = getComputedStyle(ui.canvasArea);
    const paddingX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
    const availableWidth = ui.canvasArea.clientWidth - paddingX;
    // Mismo rango que rescale(), para no producir un zoom fuera de lo que los
    // botones +/- luego puedan corregir de un salto.
    state.scale = Math.min(Math.max(availableWidth / viewport.width, 0.5), 3);
    await renderPage(ui);
}

function scheduleSaveProgress() {
    if (!state.doc) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
        try {
            await api.documents.update(state.doc.id, { last_page: state.page });
        } catch { /* progreso auto-guardado; un fallo puntual no interrumpe la lectura */ }
    }, 600);
}

// ── Render de página + capa de texto seleccionable ──────────
async function renderPage(ui) {
    const page = await state.pdf.getPage(state.page);
    const viewport = page.getViewport({ scale: state.scale });

    ui.canvasArea.innerHTML = `
        <div class="reader-page" style="width:${viewport.width}px;height:${viewport.height}px">
            <canvas id="reader-canvas"></canvas>
            <div id="reader-text-layer" class="textLayer"></div>
            <div id="reader-highlight-layer" class="reader-highlight-layer"></div>
        </div>
    `;
    const canvas = ui.canvasArea.querySelector('#reader-canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Capa de texto: permite seleccionar palabras/frases sobre el canvas.
    // IMPORTANTE: el TextLayer moderno de PDF.js define font-size/width/height
    // de cada span vía calc()/round() que referencian la custom property
    // --scale-factor. Si no se define aquí, esas expresiones son inválidas y
    // el navegador cae a valores por defecto (font-size 16px), desalineando
    // la selección del texto respecto a los glifos visibles — sobre todo al
    // hacer zoom. Debe fijarse en cada render (cambia con state.scale).
    const textLayerDiv = ui.canvasArea.querySelector('#reader-text-layer');
    textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    const textContent = await page.getTextContent();
    const textLayer = new window.pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
    });
    await textLayer.render();

    drawHighlightsForPage(ui);
    attachSelectionHandler(ui, viewport);
}

function drawHighlightsForPage(ui) {
    const layer = ui.canvasArea.querySelector('#reader-highlight-layer');
    if (!layer) return;
    const pageEl = ui.canvasArea.querySelector('.reader-page');
    const w = pageEl.clientWidth, h = pageEl.clientHeight;
    layer.innerHTML = state.annotations
        .filter(a => a.page === state.page && a.kind === 'highlight')
        .map(a => (a.rects || []).map(r => `
            <div class="reader-highlight" style="
                left:${r.x * w}px; top:${r.y * h}px;
                width:${r.width * w}px; height:${r.height * h}px;
                background:${a.color || '#fde68a'};
            " data-ann-id="${a.id}" title="${esc(a.selected_text || '')} — click to remove"></div>
        `).join('')).join('');

    layer.querySelectorAll('.reader-highlight').forEach(el => {
        el.addEventListener('click', () => removeHighlight(ui, parseInt(el.dataset.annId)));
    });
}

async function removeHighlight(ui, annotationId) {
    if (!state.doc) return;
    try {
        await api.documents.annotations.delete(state.doc.id, annotationId);
        state.annotations = state.annotations.filter(a => a.id !== annotationId);
        drawHighlightsForPage(ui);
        renderAnnotationsList(ui);
        toast('Highlight removed');
    } catch (err) {
        toast(err.message || 'Could not remove highlight', 'error');
    }
}

// ── Selección de texto → popup con paleta de colores + acciones ─────
function attachSelectionHandler(ui, viewport) {
    const pageEl = ui.canvasArea.querySelector('.reader-page');
    pageEl.addEventListener('mouseup', () => {
        setTimeout(() => handleSelection(ui, pageEl, viewport), 10);
    });
}

function handleSelection(ui, pageEl, viewport) {
    document.querySelector('.reader-selection-popup')?.remove();
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!sel || !text || sel.rangeCount === 0) return;
    // Solo si la selección cae dentro de esta página.
    const range = sel.getRangeAt(0);
    if (!pageEl.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();

    // Rects normalizados (0-1) relativos a la página, para el resaltado.
    const clientRects = Array.from(range.getClientRects()).map(r => ({
        x: (r.left - pageRect.left) / pageRect.width,
        y: (r.top - pageRect.top) / pageRect.height,
        width: r.width / pageRect.width,
        height: r.height / pageRect.height,
    }));

    // Contexto (oración) para el significado contextual con IA: el párrafo
    // completo que contiene la selección, tal como lo ve la capa de texto.
    const context = (range.commonAncestorContainer.textContent || text).trim().slice(0, 500);

    const popup = document.createElement('div');
    popup.className = 'reader-selection-popup';
    popup.style.left = `${rect.left - pageRect.left + rect.width / 2}px`;
    popup.style.top = `${rect.top - pageRect.top}px`;
    popup.innerHTML = `
        <div class="reader-popup-row reader-popup-colors">
            ${HIGHLIGHT_COLORS.map(c => `<button class="reader-swatch" data-color="${c.value}" title="Highlight — ${esc(c.name)}" style="background:${c.value}"></button>`).join('')}
        </div>
        <div class="reader-popup-row reader-popup-actions">
            <button data-action="note" title="Margin note">📝</button>
            <button data-action="save-word" title="Save word">💾</button>
            <button data-action="contextual" title="Contextual meaning (AI)">🤖</button>
        </div>
    `;
    pageEl.appendChild(popup);

    // Único punto de cierre: siempre desmonta también el listener de "click
    // afuera" (si no, cada selección apila un mousedown más en document que
    // solo se limpia en el click ajeno siguiente — inofensivo pero sucio).
    const closePopup = () => {
        popup.remove();
        document.removeEventListener('mousedown', onDocClick);
    };

    // Cada swatch de color resalta directamente con ese color (no hay paso
    // de "confirmar" separado: elegir el color ES la acción).
    popup.querySelectorAll('.reader-swatch').forEach(btn => {
        btn.addEventListener('click', async () => {
            await createAnnotation(ui, { kind: 'highlight', selected_text: text, rects: clientRects, color: btn.dataset.color });
            closePopup();
            sel.removeAllRanges();
        });
    });
    popup.querySelector('[data-action="note"]').addEventListener('click', () => {
        closePopup();
        openNotePrompt(ui, text, clientRects);
        sel.removeAllRanges();
    });
    popup.querySelector('[data-action="save-word"]').addEventListener('click', () => {
        closePopup();
        openLookupModal(text, {
            onSaveAll: async (full) => {
                const firstTr = (full.meanings?.[0]?.translation_es) || '';
                const created = await api.words.create({
                    word: text,
                    translation: firstTr || text,
                    meanings: full.meanings || [],
                    common_phrases: full.common_phrases || [],
                    phonetic: full.phonetic || null,
                    source_document_id: state.doc ? state.doc.id : null,
                });
                state.vocabWords.unshift(created);
                renderVocabList(ui);
                toast(`"${text}" saved ✓`);
            },
        });
        sel.removeAllRanges();
    });
    popup.querySelector('[data-action="contextual"]').addEventListener('click', async () => {
        closePopup();
        await showContextualMeaning(text, context);
        sel.removeAllRanges();
    });

    // Cerrar el popup si se hace click fuera.
    const onDocClick = (e) => {
        if (!popup.contains(e.target)) closePopup();
    };
    setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
}

async function createAnnotation(ui, { kind, selected_text, note_text, rects, color }) {
    if (!state.doc) return;
    try {
        const ann = await api.documents.annotations.create(state.doc.id, {
            page: state.page, kind, selected_text: selected_text || null,
            note_text: note_text || null, color: color || null, rects: rects || [],
        });
        state.annotations.push(ann);
        drawHighlightsForPage(ui);
        renderAnnotationsList(ui);
        toast(kind === 'highlight' ? 'Highlight saved' : kind === 'note' ? 'Note saved' : 'Bookmark saved');
    } catch (err) {
        toast(err.message || 'Could not save', 'error');
    }
}

function openNotePrompt(ui, selectedText, rects) {
    document.querySelector('.modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:480px">
            <h3 class="text-lg font-bold mb-2">📝 Margin note</h3>
            <p class="text-xs mb-2" style="color:var(--text-tertiary)">"${esc(selectedText)}"</p>
            <textarea id="reader-note-text" class="form-input" rows="4" placeholder="Write your note…"></textarea>
            <div class="flex justify-end gap-2 mt-3">
                <button class="btn-edit" id="reader-note-cancel">Cancel</button>
                <button class="btn-primary" id="reader-note-save">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#reader-note-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#reader-note-save').addEventListener('click', async () => {
        const noteText = overlay.querySelector('#reader-note-text').value.trim();
        if (!noteText) { toast('Write something first', 'error'); return; }
        await createAnnotation(ui, { kind: 'note', selected_text: selectedText, note_text: noteText, rects });
        close();
    });
}

function renderAnnotationsList(ui) {
    const listEl = ui.annotationsList;
    if (!listEl) return;
    const headerEl = ui.bookmarksHeader;
    if (headerEl) {
        const arrow = state.bookmarksExpanded ? '▾' : '▸';
        headerEl.textContent = `${arrow} Bookmarks & Notes (${state.annotations.length})`;
    }

    const icons = { highlight: '🖍️', note: '📝', bookmark: '📑' };
    const rows = [];

    // Fila sintética "Continue reading" — no es una Annotation real, refleja
    // Document.last_page en vivo y se actualiza en cada cambio de página.
    if (state.doc) {
        rows.push(`
            <div class="reader-ann-item reader-ann-continue" data-page="${state.doc.last_page}">
                <span>📖 Continue reading</span>
                <p>page ${state.doc.last_page}</p>
            </div>
        `);
    }

    if (!state.annotations.length) {
        rows.push(`<p class="text-xs" style="color:var(--text-tertiary)">No bookmarks or notes yet.</p>`);
    } else {
        rows.push(...state.annotations
            .slice()
            .sort((a, b) => a.page - b.page)
            .map(a => `
                <div class="reader-ann-item" data-page="${a.page}" data-id="${a.id}">
                    <span>${icons[a.kind] || '•'} page ${a.page}</span>
                    <p>${esc(a.note_text || a.selected_text || '')}</p>
                </div>
            `));
    }

    listEl.innerHTML = rows.join('');
    listEl.classList.toggle('expanded', state.bookmarksExpanded);

    listEl.querySelectorAll('.reader-ann-item').forEach(el => {
        el.addEventListener('click', () => {
            const page = parseInt(el.dataset.page);
            const container = document.getElementById('app');
            goToPage(page, refs(container));
        });
    });
}

function renderVocabList(ui) {
    const listEl = ui.vocabList;
    if (!listEl) return;
    const headerEl = ui.vocabHeader;
    if (headerEl) {
        const arrow = state.vocabExpanded ? '▾' : '▸';
        headerEl.textContent = `${arrow} Vocabulary (${state.vocabWords.length})`;
    }

    if (!state.vocabWords.length) {
        listEl.innerHTML = `<p class="text-xs" style="color:var(--text-tertiary)">No words saved from this document yet.</p>`;
    } else {
        listEl.innerHTML = state.vocabWords.map(w => `
            <div class="reader-vocab-item">
                <span class="reader-vocab-word">${esc(w.word)}</span>
                <span class="reader-vocab-sep">—</span>
                <span class="reader-vocab-tr">${esc(w.translation || '')}</span>
                ${w.part_of_speech ? `<span class="badge" style="background:rgba(139,92,246,0.15);color:#a78bfa">${esc(w.part_of_speech)}</span>` : ''}
            </div>
        `).join('');
    }

    listEl.classList.toggle('expanded', state.vocabExpanded);
}

// ── Subir el PDF al servidor (opcional) ─────────────────────
async function uploadCurrentFile(ui) {
    if (!state.doc || !state.file) return;
    ui.uploadBtn.disabled = true;
    ui.uploadBtn.textContent = 'Uploading…';
    try {
        state.doc = await api.documents.upload(state.doc.id, state.file);
        ui.uploadBtn.style.display = 'none';
        ui.statusEl.textContent = '☁️ Uploaded';
        toast('PDF uploaded — you can now open it from another device');
    } catch (err) {
        toast(err.message || 'Could not upload', 'error');
    } finally {
        ui.uploadBtn.disabled = false;
        ui.uploadBtn.textContent = '☁️ Upload';
    }
}

// ── Significado contextual (IA), reutiliza /api/lookup/contextual ─────────
async function showContextualMeaning(word, context) {
    document.querySelector('.modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:440px">
            <h3 class="text-lg font-bold mb-2">🤖 "${esc(word)}" in this context</h3>
            <div id="reader-ctx-body" class="text-center py-6" style="color:var(--text-tertiary)">
                <div class="animate-spin inline-block w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full mb-2"></div>
                <p class="text-xs">Analyzing context…</p>
            </div>
            <div class="flex justify-end mt-3">
                <button class="btn-edit" id="reader-ctx-close">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#reader-ctx-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    try {
        const data = await api.lookup.contextual(word, context);
        overlay.querySelector('#reader-ctx-body').innerHTML = `
            <div class="text-left">
                <span class="badge" style="background:rgba(139,92,246,0.15);color:#a78bfa">${esc(data.part_of_speech || '—')}</span>
                <p class="text-lg font-semibold text-brand-400 mt-2">${esc(data.sense_es)}</p>
                <p class="text-sm mt-2" style="color:var(--text-secondary)">${esc(data.explanation_es)}</p>
                <p class="text-xs mt-3" style="color:var(--text-quaternary)">${data.cached ? '💾 from cache' : '✨ new'}</p>
            </div>
        `;
    } catch (err) {
        overlay.querySelector('#reader-ctx-body').innerHTML = `<p class="text-red-400 text-sm">⚠️ ${esc(err.message)}</p>`;
    }
}
