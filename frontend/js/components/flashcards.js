import * as api from '../api.js';
import { toast, cefrBadgeHTML } from '../utils/helpers.js';
import { checkAnswer, checkAgainstList } from '../utils/grading.js';

// ── Web Speech API pronunciation ──────────────────────────────
function speak(text, lang = 'en-US') {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
}

let practiceWords = [];
let currentIndex = 0;
let isFlipped = false;
let sessionCorrect = 0;
let sessionIncorrect = 0;
let isReverseMode = false;  // false = EN→ES (normal), true = ES→EN (reverse)
let reviewType = 'recognition';  // recognition | translation | synonym

export async function render(container) {
    sessionCorrect = 0;
    sessionIncorrect = 0;

    const cats = await api.categories.list();

    container.innerHTML = `
        <div class="page-enter max-w-xl mx-auto">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold">Review</h2>
            </div>

            <!-- ── Filters ────────────────────────────── -->
            <div class="card mb-6" style="padding:1rem 1.25rem">
                <!-- Review type -->
                <div class="mb-3">
                    <label class="block text-xs text-slate-500 mb-1.5">Review type</label>
                    <div class="inline-flex rounded-lg overflow-hidden border border-slate-700" style="font-size:0.8rem" id="review-type-toggle">
                        <button type="button" data-type="recognition" class="rtype-btn px-3 py-1.5 font-medium transition-colors">👁 Recognition</button>
                        <button type="button" data-type="translation" class="rtype-btn px-3 py-1.5 font-medium transition-colors">✍️ Type translation</button>
                        <button type="button" data-type="synonym" class="rtype-btn px-3 py-1.5 font-medium transition-colors">🔀 Synonym</button>
                    </div>
                </div>
                <div class="flex flex-wrap gap-3 items-end">
                    <div class="flex-1 min-w-[140px]">
                        <label class="block text-xs text-slate-500 mb-1">Category</label>
                        <select id="review-filter-cat" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                            <option value="">All categories</option>
                            ${cats.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="flex-1 min-w-[160px]">
                        <label class="block text-xs text-slate-500 mb-1">Added in the last…</label>
                        <select id="review-filter-days" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                            <option value="">All time</option>
                            <option value="0">Today</option>
                            <option value="1">Last 2 days</option>
                            <option value="2">Last 3 days</option>
                            <option value="3">Last 4 days</option>
                            <option value="6">Last 7 days</option>
                            <option value="13">Last 2 weeks</option>
                            <option value="29">Last 30 days</option>
                            <option value="59">Last 2 months</option>
                            <option value="89">Last 3 months</option>
                            <option value="custom">Custom days…</option>
                        </select>
                    </div>
                    <div class="flex-1 min-w-[140px]">
                        <label class="block text-xs text-slate-500 mb-1">Level (CEFR)</label>
                        <select id="review-filter-level" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                            <option value="">All levels</option>
                            <option value="A1">🟢 A1 · básico</option>
                            <option value="A2">🟢 A2 · básico</option>
                            <option value="B1">🟠 B1 · intermedio</option>
                            <option value="B2">🟠 B2 · intermedio</option>
                            <option value="C1">🟣 C1 · avanzado</option>
                            <option value="C2">🟣 C2 · avanzado</option>
                        </select>
                    </div>
                    <div class="flex-1 min-w-[150px]">
                        <label class="block text-xs text-slate-500 mb-1">Mastery level</label>
                        <select id="review-filter-mastery" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                            <option value="">All levels</option>
                            <option value="25">🔴 Worst (0–25%)</option>
                            <option value="50">🟠 Struggling (0–50%)</option>
                            <option value="74">🟡 Below average (0–74%)</option>
                        </select>
                    </div>
                    <!-- Custom days input (hidden by default) -->
                    <div class="flex-1 min-w-[100px] hidden" id="custom-days-wrapper">
                        <label class="block text-xs text-slate-500 mb-1">How many days?</label>
                        <input type="number" id="custom-days-input" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem" min="0" max="365" placeholder="e.g. 10">
                    </div>
                    <button class="btn-primary" id="start-review-btn" style="padding:0.5rem 1.25rem;font-size:0.8rem">
                        Start Practice
                    </button>
                </div>

                <!-- Mode toggle -->
                <div class="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/60" id="study-mode-row">
                    <span class="text-xs text-slate-500">Study mode:</span>
                    <div class="flex rounded-lg overflow-hidden border border-slate-700" style="font-size:0.75rem">
                        <button id="mode-normal" class="mode-btn active px-3 py-1.5 font-medium transition-colors" style="background:rgba(139,92,246,0.2);color:#a78bfa">
                            🇬🇧 EN → ES
                        </button>
                        <button id="mode-reverse" class="mode-btn px-3 py-1.5 font-medium transition-colors" style="color:#64748b">
                            🇪🇸 ES → EN
                        </button>
                    </div>
                    <span class="text-xs text-slate-600" id="mode-label">See the word, recall the translation</span>
                </div>
                <p class="text-xs text-slate-600 mt-2" id="word-count-label">Loading…</p>
                <div id="synonym-tools" class="hidden mt-2 flex items-center gap-3 flex-wrap">
                    <button class="btn-secondary" id="gen-synonyms-btn" style="padding:0.35rem 0.9rem;font-size:0.75rem">✨ Generar sinónimos faltantes (usa IA)</button>
                    <span class="text-xs text-slate-500" id="gen-synonyms-status"></span>
                </div>
            </div>

            <!-- ── Flashcard area (hidden until Start) ── -->
            <div id="review-area" class="hidden">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm text-slate-400" id="review-progress"></span>
                    <span class="text-xs text-slate-500" id="session-score"></span>
                </div>

                <!-- Progress bar -->
                <div class="progress-bar mb-5">
                    <div class="progress-fill" id="review-progress-bar" style="width:0%"></div>
                </div>

                <div class="flashcard-container mb-6">
                    <div class="flashcard" id="flashcard">
                        <div class="flashcard-face flashcard-front">
                            <p class="text-xs mb-3 uppercase tracking-wider" id="card-front-label" style="color:#a5b4fc">What does this mean?</p>
                            <div class="flex items-center justify-center gap-2 mb-3">
                                <p class="text-3xl font-bold" id="card-word"></p>
                                <button id="btn-speak-front" title="Pronounce" style="background:none;border:none;cursor:pointer;font-size:1.2rem;opacity:0.5;padding:0 0.2rem" tabindex="-1">🔊</button>
                            </div>
                            <p class="text-sm italic px-4 text-center leading-relaxed" id="card-example-hint" style="color:rgba(199,210,254,0.8)"></p>
                            <p class="text-sm mt-4" id="card-hint" style="color:rgba(165,180,252,0.6)"></p>
                            <p class="text-xs mt-6" id="card-front-tip" style="color:rgba(165,180,252,0.5)">Click · Space to reveal</p>
                        </div>
                        <div class="flashcard-face flashcard-back">
                            <p class="text-xs text-emerald-300 mb-2 uppercase tracking-wider" id="card-back-label">Translation</p>
                            <div class="flex items-center justify-center gap-2 mb-3">
                                <p class="text-2xl font-bold" id="card-translation"></p>
                                <button id="btn-speak-back" title="Pronounce" style="background:none;border:none;cursor:pointer;font-size:1.1rem;opacity:0.5;padding:0 0.2rem" tabindex="-1">🔊</button>
                            </div>
                            <p class="text-sm text-emerald-200/70 italic mb-2" id="card-example"></p>
                            <p class="text-xs text-emerald-200/50" id="card-definition"></p>
                            <p class="text-xs text-emerald-300/40 mt-2 italic" id="card-notes"></p>
                        </div>
                    </div>
                </div>

                <!-- ── Typing card (translation / synonym) ── -->
                <div id="typing-container" class="hidden">
                    <div class="card" style="padding:2rem 1.5rem;text-align:center">
                        <div class="flex items-center justify-center gap-2 mb-3" id="typing-badges"></div>
                        <p class="text-xs uppercase tracking-wider mb-2" id="typing-label" style="color:#a5b4fc">Escribe la traducción</p>
                        <p class="text-3xl font-bold mb-1" id="typing-prompt"></p>
                        <p class="text-sm text-slate-500 mb-4" id="typing-hint"></p>
                        <input type="text" id="typing-input" class="form-input" style="text-align:center;max-width:320px;margin:0 auto" placeholder="Escribe aquí…" autocomplete="off" autocapitalize="off" spellcheck="false">
                        <div class="mt-4 flex items-center justify-center gap-4" id="typing-actions">
                            <button class="btn-primary" id="typing-submit" style="padding:0.5rem 1.5rem">Check</button>
                            <button class="text-xs text-slate-500 hover:text-slate-400 transition-colors" id="typing-skip">⏭ Skip</button>
                        </div>
                        <div id="typing-feedback" class="hidden mt-4" style="max-width:360px;margin-left:auto;margin-right:auto"></div>
                    </div>
                </div>

                <div id="rating-panel" class="hidden">
                    <p class="text-xs text-slate-500 text-center mb-3">Did you know it? <span class="text-slate-600">(← / →)</span></p>
                    <div class="flex gap-4">
                        <button class="binary-btn binary-incorrect" id="btn-incorrect">
                            <span class="text-2xl">✗</span>
                            <span>Incorrect</span>
                            <span class="text-xs opacity-50">←</span>
                        </button>
                        <button class="binary-btn binary-correct" id="btn-correct">
                            <span class="text-2xl">✓</span>
                            <span>Correct</span>
                            <span class="text-xs opacity-50">→</span>
                        </button>
                    </div>
                    <div class="text-center mt-3">
                        <button class="text-xs text-slate-600 hover:text-slate-400 transition-colors" id="btn-skip">⏭ Skip word</button>
                    </div>
                </div>
            </div>

            <!-- ── Empty state ────────────────────────── -->
            <div id="empty-state" class="hidden">
                <div class="empty-state card">
                    <div class="text-5xl mb-4">📭</div>
                    <p class="text-lg font-medium text-slate-700">No words found</p>
                    <p class="text-sm text-slate-500 mt-2">No words match your filters.<br>Try a wider range or add more words.</p>
                </div>
            </div>
        </div>
    `;

    const filterCat        = container.querySelector('#review-filter-cat');
    const filterDays       = container.querySelector('#review-filter-days');
    const filterLevel      = container.querySelector('#review-filter-level');
    const filterMastery    = container.querySelector('#review-filter-mastery');
    const customWrapper    = container.querySelector('#custom-days-wrapper');
    const customInput      = container.querySelector('#custom-days-input');
    const startBtn         = container.querySelector('#start-review-btn');
    const wordCountLabel   = container.querySelector('#word-count-label');
    const reviewArea       = container.querySelector('#review-area');
    const emptyState       = container.querySelector('#empty-state');
    const flashcard        = container.querySelector('#flashcard');
    const ratingPanel      = container.querySelector('#rating-panel');
    const modeNormalBtn    = container.querySelector('#mode-normal');
    const modeReverseBtn   = container.querySelector('#mode-reverse');
    const modeLabel        = container.querySelector('#mode-label');
    const reviewTypeToggle   = container.querySelector('#review-type-toggle');
    const studyModeRow       = container.querySelector('#study-mode-row');
    const flashcardContainer = container.querySelector('.flashcard-container');
    const typingContainer    = container.querySelector('#typing-container');
    const typingBadges       = container.querySelector('#typing-badges');
    const typingLabel        = container.querySelector('#typing-label');
    const typingPrompt       = container.querySelector('#typing-prompt');
    const typingHint         = container.querySelector('#typing-hint');
    const typingInput        = container.querySelector('#typing-input');
    const typingSubmit       = container.querySelector('#typing-submit');
    const typingSkip         = container.querySelector('#typing-skip');
    const typingFeedback     = container.querySelector('#typing-feedback');
    const synonymTools       = container.querySelector('#synonym-tools');
    const genSynonymsBtn     = container.querySelector('#gen-synonyms-btn');
    const genSynonymsStatus  = container.querySelector('#gen-synonyms-status');

    // ── Review type (recognition / translation / synonym) ─
    function setReviewType(type) {
        reviewType = type;
        reviewTypeToggle.querySelectorAll('.rtype-btn').forEach(b => {
            const active = b.dataset.type === type;
            b.style.background = active ? 'rgba(0,113,227,0.12)' : '';
            b.style.color = active ? '#0071e3' : '#64748b';
        });
        // La dirección EN↔ES no aplica al sinónimo (siempre inglés→inglés).
        studyModeRow.style.display = type === 'synonym' ? 'none' : '';
        synonymTools.classList.toggle('hidden', type !== 'synonym');
    }
    reviewTypeToggle.querySelectorAll('.rtype-btn').forEach(b => {
        b.addEventListener('click', () => {
            if (b.disabled) return;
            setReviewType(b.dataset.type);
            updateWordCount();
        });
    });
    setReviewType('recognition');

    // ── Generar sinónimos faltantes (backfill por lotes, gastando IA) ──
    genSynonymsBtn.addEventListener('click', async () => {
        genSynonymsBtn.disabled = true;
        let total = 0;
        try {
            while (true) {
                const r = await api.words.backfillSynonyms();
                total += r.updated;
                if (r.updated === 0 || r.remaining === 0) {
                    genSynonymsStatus.textContent = `✓ Listo (${total} palabra${total !== 1 ? 's' : ''} procesada${total !== 1 ? 's' : ''})`;
                    break;
                }
                genSynonymsStatus.textContent = `Generando… ${total} listas, ${r.remaining} restantes`;
            }
            await updateWordCount();
        } catch (err) {
            genSynonymsStatus.textContent = err.message;
        } finally {
            genSynonymsBtn.disabled = false;
        }
    });

    // ── Mode toggle ─────────────────────────────────────
    function setMode(reverse) {
        isReverseMode = reverse;
        modeNormalBtn.style.background  = reverse ? '' : 'rgba(139,92,246,0.2)';
        modeNormalBtn.style.color       = reverse ? '#64748b' : '#a78bfa';
        modeReverseBtn.style.background = reverse ? 'rgba(236,72,153,0.2)' : '';
        modeReverseBtn.style.color      = reverse ? '#f472b6' : '#64748b';
        modeLabel.textContent = reverse
            ? 'See the translation, recall the English word'
            : 'See the word, recall the translation';
    }
    modeNormalBtn.addEventListener('click',  () => setMode(false));
    modeReverseBtn.addEventListener('click', () => setMode(true));

    // ── Show/hide custom days input ─────────────────────
    filterDays.addEventListener('change', () => {
        if (filterDays.value === 'custom') {
            customWrapper.classList.remove('hidden');
            customInput.focus();
        } else {
            customWrapper.classList.add('hidden');
        }
        updateWordCount();
    });

    // ── Build filter params ─────────────────────────────
    function buildParams() {
        const params = {};
        if (filterCat.value) params.category_id = filterCat.value;

        if (filterDays.value === 'custom') {
            const v = parseInt(customInput.value);
            if (!isNaN(v) && v >= 0) params.days = v;
        } else if (filterDays.value !== '') {
            params.days = filterDays.value;
        }

        if (filterLevel.value) {
            params.cefr_level = filterLevel.value;
        }

        if (filterMastery.value !== '') {
            params.mastery_max = filterMastery.value;
        }

        if (reviewType === 'synonym') {
            params.with_synonyms = 1;
        }

        return params;
    }

    // ── Update word count on filter change ──────────────
    async function updateWordCount() {
        try {
            const words = await api.reviews.practice(buildParams());
            wordCountLabel.textContent = `${words.length} word${words.length !== 1 ? 's' : ''} available to practice`;
        } catch {
            wordCountLabel.textContent = 'Error loading count';
        }
    }

    filterCat.addEventListener('change', updateWordCount);
    filterLevel.addEventListener('change', updateWordCount);
    filterMastery.addEventListener('change', updateWordCount);
    customInput.addEventListener('input', updateWordCount);
    await updateWordCount();

    // ── Start practice session ──────────────────────────
    startBtn.addEventListener('click', async () => {
        practiceWords = await api.reviews.practice(buildParams());
        currentIndex = 0;
        isFlipped = false;
        sessionCorrect = 0;
        sessionIncorrect = 0;

        if (practiceWords.length === 0) {
            reviewArea.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        // Shuffle the words for variety
        shuffleArray(practiceWords);

        emptyState.classList.add('hidden');
        reviewArea.classList.remove('hidden');
        ratingPanel.classList.add('hidden');
        showCard();
    });

    // ── Speaker buttons ─────────────────────────────────
    container.querySelector('#btn-speak-front').addEventListener('click', e => {
        e.stopPropagation();
        const w = practiceWords[currentIndex];
        if (!w) return;
        speak(isReverseMode ? w.translation : w.word, isReverseMode ? 'es-ES' : 'en-US');
    });
    container.querySelector('#btn-speak-back').addEventListener('click', e => {
        e.stopPropagation();
        const w = practiceWords[currentIndex];
        if (!w) return;
        speak(isReverseMode ? w.word : w.word, 'en-US');
    });

    // ── Flip on click / Space ───────────────────────────
    function flipCard() {
        if (isFlipped) return;
        isFlipped = true;
        flashcard.classList.add('flipped');
        ratingPanel.classList.remove('hidden');
    }
    flashcard.addEventListener('click', flipCard);

    // ── Keyboard shortcuts ──────────────────────────────
    function onKeyDown(e) {
        if (reviewArea.classList.contains('hidden')) return;
        // Modo escrito: Enter califica (mientras no haya feedback). Con feedback
        // visible, el botón "Next" tiene el foco y Enter lo activa de forma nativa.
        if (reviewType !== 'recognition') {
            if (e.key === 'Enter' && typingFeedback.classList.contains('hidden')) {
                e.preventDefault();
                gradeTyping();
            }
            return;
        }
        if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flipCard(); }
        if (isFlipped) {
            if (e.key === 'ArrowRight') { e.preventDefault(); submitAnswer(4); }
            if (e.key === 'ArrowLeft')  { e.preventDefault(); submitAnswer(1); }
        }
    }
    document.addEventListener('keydown', onKeyDown);

    // ── Binary feedback buttons ─────────────────────────
    container.querySelector('#btn-correct').addEventListener('click', () => submitAnswer(4));
    container.querySelector('#btn-incorrect').addEventListener('click', () => submitAnswer(1));

    // ── Typing mode: check + skip ───────────────────────
    typingSubmit.addEventListener('click', gradeTyping);
    typingSkip.addEventListener('click', () => {
        currentIndex++;
        if (currentIndex >= practiceWords.length) { showSessionComplete(); return; }
        showCard();
    });

    // ── Skip button ─────────────────────────────────────
    container.querySelector('#btn-skip').addEventListener('click', () => {
        currentIndex++;
        if (currentIndex >= practiceWords.length) { showSessionComplete(); return; }
        isFlipped = false;
        flashcard.classList.remove('flipped');
        ratingPanel.classList.add('hidden');
        showCard();
    });

    async function submitAnswer(quality) {
        const word = practiceWords[currentIndex];
        try {
            await api.reviews.submit({ word_id: word.id, quality });

            if (quality >= 3) sessionCorrect++;
            else sessionIncorrect++;

            currentIndex++;
            if (currentIndex >= practiceWords.length) {
                showSessionComplete();
                return;
            }
            isFlipped = false;
            flashcard.classList.remove('flipped');
            ratingPanel.classList.add('hidden');
            showCard();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function updateProgress() {
        const total = practiceWords.length;
        const pct   = Math.round((currentIndex / total) * 100);
        container.querySelector('#review-progress').textContent = `${currentIndex + 1} / ${total}`;
        container.querySelector('#session-score').textContent = `✓ ${sessionCorrect}  ✗ ${sessionIncorrect}`;
        container.querySelector('#review-progress-bar').style.width = `${pct}%`;
    }

    function showCard() {
        updateProgress();
        if (reviewType === 'recognition') showRecognitionCard();
        else showTypingCard();
    }

    function showRecognitionCard() {
        flashcardContainer.classList.remove('hidden');
        typingContainer.classList.add('hidden');

        const w = practiceWords[currentIndex];
        const cat = w.category_name ? `${w.category_icon} ${w.category_name}` : '';

        if (!isReverseMode) {
            // ── Normal: front = English word ────────────────
            container.querySelector('#card-front-label').textContent = 'What does this mean?';
            container.querySelector('#card-word').textContent = w.word;
            container.querySelector('#card-example-hint').textContent = w.example ? `"${w.example}"` : '';
            container.querySelector('#card-hint').textContent = cat;
            // Back = Spanish translation
            container.querySelector('#card-back-label').textContent = 'Translation';
            container.querySelector('#card-translation').textContent = w.translation;
            container.querySelector('#card-example').textContent = w.example ? `"${w.example}"` : '';
            container.querySelector('#card-definition').textContent = w.definition || '';
        } else {
            // ── Reverse: front = Spanish translation ─────────
            container.querySelector('#card-front-label').textContent = '¿Cómo se dice en inglés?';
            container.querySelector('#card-word').textContent = w.translation;
            container.querySelector('#card-example-hint').textContent = '';
            container.querySelector('#card-hint').textContent = cat;
            // Back = English word + example
            container.querySelector('#card-back-label').textContent = 'English word';
            container.querySelector('#card-translation').textContent = w.word;
            container.querySelector('#card-example').textContent = w.example ? `"${w.example}"` : '';
            container.querySelector('#card-definition').textContent = w.definition || '';
        }

        container.querySelector('#card-notes').textContent = w.notes ? `📝 ${w.notes}` : '';
    }

    function showTypingCard() {
        flashcardContainer.classList.add('hidden');
        typingContainer.classList.remove('hidden');

        const w = practiceWords[currentIndex];
        if (reviewType === 'synonym') {
            typingPrompt.textContent = w.word;
            typingLabel.textContent = 'Escribe un sinónimo (en inglés)';
            typingHint.textContent = w.translation || '';
        } else if (!isReverseMode) {
            typingPrompt.textContent = w.word;
            typingLabel.textContent = 'Escribe la traducción';
            typingHint.textContent = '';
        } else {
            typingPrompt.textContent = w.translation;
            typingLabel.textContent = 'Escribe la palabra en inglés';
            typingHint.textContent = '';
        }

        const cat = w.category_name
            ? `<span class="badge" style="background:${w.category_color || '#8b5cf6'}22;color:${w.category_color || '#8b5cf6'}">${w.category_icon || ''} ${esc(w.category_name)}</span>`
            : '';
        typingBadges.innerHTML = cefrBadgeHTML(w.cefr_level) + cat;

        typingInput.value = '';
        typingInput.disabled = false;
        typingSubmit.classList.remove('hidden');
        typingSubmit.disabled = false;
        typingFeedback.classList.add('hidden');
        typingFeedback.innerHTML = '';
        setTimeout(() => typingInput.focus(), 60);
    }

    function gradeTyping() {
        const w = practiceWords[currentIndex];
        if (!w) return;
        const val = typingInput.value;
        if (!val.trim()) { typingInput.focus(); return; }

        let expected, res;
        if (reviewType === 'synonym') {
            const list = Array.isArray(w.synonyms) ? w.synonyms : [];
            res = checkAgainstList(val, list);
            expected = list.join(', ');
        } else if (!isReverseMode) {
            expected = w.translation;
            res = checkAnswer(val, expected);
        } else {
            expected = w.word;
            res = checkAnswer(val, expected);
        }

        typingInput.disabled = true;
        typingSubmit.classList.add('hidden');
        const quality = res.correct ? (res.exact ? 5 : 4) : 1;
        renderTypingFeedback(res, expected, w, quality);
    }

    function renderTypingFeedback(res, expectedRaw, w, quality) {
        const ok = res.correct;
        const isSyn = reviewType === 'synonym';
        const head = ok
            ? (res.exact ? '✓ Correcto' : '✓ Correcto (con un typo)')
            : '✗ Incorrecto';
        // En sinónimos siempre mostramos la lista válida (es educativo). En
        // traducción solo revelamos la respuesta cuando falla.
        const synList = (isSyn && Array.isArray(w.synonyms) && w.synonyms.length)
            ? `<div class="text-sm mt-1" style="color:var(--text-primary)">Sinónimos válidos: <span class="font-bold">${esc(w.synonyms.join(', '))}</span></div>`
            : '';
        const revealAnswer = (!ok && !isSyn)
            ? `<div class="text-sm mt-1" style="color:var(--text-primary)">Respuesta: <span class="font-bold">${esc(expectedRaw)}</span></div>`
            : '';
        // Override sin IA: si escribiste un sinónimo válido que no estaba en la lista.
        const override = (!ok && isSyn)
            ? `<button class="mt-2 text-xs font-medium" id="typing-override" style="color:#0071e3">✓ Mi sinónimo también vale — marcar como correcto</button>`
            : '';
        typingFeedback.innerHTML = `
            <div class="rounded-lg p-3 text-left" style="background:${ok ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.1)'}">
                <div class="font-semibold text-sm" style="color:${ok ? '#34c759' : '#ff3b30'}">${head}</div>
                ${revealAnswer}
                ${synList}
                ${w.example ? `<div class="text-xs text-slate-500 italic mt-1">"${esc(w.example)}"</div>` : ''}
                ${override}
            </div>
            <button class="btn-primary mt-3 w-full" id="typing-next" style="padding:0.5rem 1.5rem">Next →</button>
        `;
        typingFeedback.classList.remove('hidden');
        const nextBtn = typingFeedback.querySelector('#typing-next');
        nextBtn.addEventListener('click', () => submitAnswer(quality));
        const ov = typingFeedback.querySelector('#typing-override');
        if (ov) ov.addEventListener('click', () => submitAnswer(4));  // marcar correcto sin IA
        setTimeout(() => nextBtn.focus(), 50);
    }

    // Remove keyboard listener and stop speech when navigating away
    window.addEventListener('hashchange', () => {
        document.removeEventListener('keydown', onKeyDown);
        window.speechSynthesis?.cancel();
    }, { once: true });

    function showSessionComplete() {
        document.removeEventListener('keydown', onKeyDown);
        const total = sessionCorrect + sessionIncorrect;
        const pct = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0;
        reviewArea.innerHTML = `
            <div class="page-enter text-center mt-8">
                <div class="text-6xl mb-4">${pct >= 70 ? '🏆' : pct >= 40 ? '💪' : '📖'}</div>
                <h3 class="text-2xl font-bold mb-2">Session Complete!</h3>
                <p class="text-slate-400 mb-4">You practiced ${total} word${total > 1 ? 's' : ''}.</p>
                <div class="flex justify-center gap-8 mb-6">
                    <div class="text-center">
                        <div class="text-3xl font-bold text-emerald-400">${sessionCorrect}</div>
                        <div class="text-xs text-slate-500">Correct</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-red-400">${sessionIncorrect}</div>
                        <div class="text-xs text-slate-500">Incorrect</div>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl font-bold text-brand-400">${pct}%</div>
                        <div class="text-xs text-slate-500">Accuracy</div>
                    </div>
                </div>
                <div class="flex justify-center gap-3">
                    <button class="btn-primary" id="practice-again">Practice Again</button>
                    <a href="#/dashboard" class="btn-secondary inline-block">Dashboard</a>
                </div>
            </div>
        `;
        // "Practice Again" reshuffles the same set
        container.querySelector('#practice-again')?.addEventListener('click', () => {
            currentIndex = 0;
            isFlipped = false;
            sessionCorrect = 0;
            sessionIncorrect = 0;
            shuffleArray(practiceWords);
            render(container);
        });
    }
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}
