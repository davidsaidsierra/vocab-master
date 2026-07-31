import * as api from '../api.js';
import { toast, cefrBadgeHTML } from '../utils/helpers.js';
import { checkAnswer, checkAgainstList } from '../utils/grading.js';
import { POS_OPTIONS, optionsHTML } from '../utils/wordFilters.js';

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
let dailyMeta = null;       // respuesta de /reviews/daily (contadores de la sesión)
// recognition | translation | synonym | cloze | choice | daily
let reviewType = 'recognition';

// Formato por defecto de la tarjeta. La sesión diaria no tiene uno fijo: mezcla
// varios por palabra (ver buildDailyItems), así que aquí solo da el fallback.
function cardType() {
    return reviewType === 'daily' ? 'translation' : reviewType;
}

// ── Item de sesión ───────────────────────────────────────────
// Cada entrada de `practiceWords` es una copia de la palabra con dos campos
// extra: `_ex` (formato de ejercicio) y `_rev` (dirección forzada). Así una
// misma palabra puede aparecer dos veces en la sesión con ejercicios distintos.
function curItem()  { return practiceWords[currentIndex] || null; }
function curEx()    { return curItem()?._ex || cardType(); }
function curRev()   {
    const it = curItem();
    return it && it._rev !== undefined ? it._rev : isReverseMode;
}

// Los formatos que se resuelven con la tarjeta escrita.
const TYPED_EX = ['translation', 'synonym', 'cloze'];

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
                        <button type="button" data-type="cloze" class="rtype-btn px-3 py-1.5 font-medium transition-colors">🧩 Fill the blank</button>
                        <button type="button" data-type="choice" class="rtype-btn px-3 py-1.5 font-medium transition-colors">🔢 Multiple choice</button>
                        <button type="button" data-type="daily" class="rtype-btn px-3 py-1.5 font-medium transition-colors">🎯 Sesión diaria</button>
                    </div>
                </div>
                <div class="flex flex-wrap gap-3 items-end">
                  <div class="flex flex-wrap gap-3 items-end flex-1" id="filters-grid">
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
                    <div class="flex-1 min-w-[150px]">
                        <label class="block text-xs text-slate-500 mb-1">Categoría gramatical</label>
                        <select id="review-filter-pos" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                            ${optionsHTML(POS_OPTIONS)}
                        </select>
                    </div>
                    <!-- Custom days input (hidden by default) -->
                    <div class="flex-1 min-w-[100px] hidden" id="custom-days-wrapper">
                        <label class="block text-xs text-slate-500 mb-1">How many days?</label>
                        <input type="number" id="custom-days-input" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem" min="0" max="365" placeholder="e.g. 10">
                    </div>
                  </div>
                  <!-- Panel de sesión diaria (sustituye a los filtros) -->
                  <div class="hidden flex-1 min-w-[180px]" id="daily-panel">
                        <label class="block text-xs text-slate-500 mb-1">Palabras por sesión</label>
                        <select id="daily-size" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem;max-width:200px">
                            <option value="30">30 · sostenible</option>
                            <option value="50" selected>50 · ritmo normal</option>
                            <option value="80">80 · ponerse al día</option>
                        </select>
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
                        <p class="text-sm text-slate-500 mb-1" id="typing-hint"></p>
                        <p class="text-sm italic mb-4 px-4 leading-relaxed" id="typing-example" style="color:#a5b4fc"></p>
                        <input type="text" id="typing-input" class="form-input" style="text-align:center;max-width:320px;margin:0 auto" placeholder="Escribe aquí…" autocomplete="off" autocapitalize="off" spellcheck="false">
                        <div class="mt-4 flex items-center justify-center gap-4" id="typing-actions">
                            <button class="btn-primary" id="typing-submit" style="padding:0.5rem 1.5rem">Check</button>
                            <button class="btn-secondary" id="typing-noidea" style="padding:0.5rem 1.25rem;font-size:0.8rem">🤷 No idea</button>
                            <button class="text-xs text-slate-500 hover:text-slate-400 transition-colors" id="typing-skip" title="No cuenta para el algoritmo — úsalo solo si la palabra está mal guardada">⏭ Skip</button>
                        </div>
                        <div id="typing-feedback" class="hidden mt-4" style="max-width:360px;margin-left:auto;margin-right:auto"></div>
                    </div>
                </div>

                <!-- ── Multiple choice card ── -->
                <div id="choice-container" class="hidden">
                    <div class="card" style="padding:2rem 1.5rem;text-align:center">
                        <div class="flex items-center justify-center gap-2 mb-3" id="choice-badges"></div>
                        <p class="text-xs uppercase tracking-wider mb-3" id="choice-label" style="color:#a5b4fc">Elige la palabra correcta</p>
                        <p class="text-lg font-medium mb-1 px-2 leading-relaxed" id="choice-prompt"></p>
                        <p class="text-sm text-slate-500 mb-4" id="choice-hint"></p>
                        <div class="grid grid-cols-2 gap-2" id="choice-options" style="max-width:420px;margin:0 auto"></div>
                        <div id="choice-feedback" class="hidden mt-4" style="max-width:380px;margin-left:auto;margin-right:auto"></div>
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
    const filterPos        = container.querySelector('#review-filter-pos');
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
    const typingExample      = container.querySelector('#typing-example');
    const typingInput        = container.querySelector('#typing-input');
    const typingSubmit       = container.querySelector('#typing-submit');
    const typingNoIdea       = container.querySelector('#typing-noidea');
    const typingSkip         = container.querySelector('#typing-skip');
    const typingActions      = container.querySelector('#typing-actions');
    const typingFeedback     = container.querySelector('#typing-feedback');
    const choiceContainer    = container.querySelector('#choice-container');
    const choiceBadges       = container.querySelector('#choice-badges');
    const choiceLabel        = container.querySelector('#choice-label');
    const choicePrompt       = container.querySelector('#choice-prompt');
    const choiceHint         = container.querySelector('#choice-hint');
    const choiceOptions      = container.querySelector('#choice-options');
    const choiceFeedback     = container.querySelector('#choice-feedback');
    const filtersGrid        = container.querySelector('#filters-grid');
    const dailyPanel         = container.querySelector('#daily-panel');
    const dailySize          = container.querySelector('#daily-size');
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
        // La dirección EN↔ES no aplica cuando el ejercicio siempre produce
        // inglés: sinónimo, hueco en la frase y opción múltiple.
        const fixedDirection = ['synonym', 'cloze', 'choice'].includes(type);
        studyModeRow.style.display = fixedDirection ? 'none' : '';
        synonymTools.classList.toggle('hidden', type !== 'synonym');
        // En sesión diaria el mazo lo decide el algoritmo: los filtros no aplican.
        filtersGrid.classList.toggle('hidden', type === 'daily');
        dailyPanel.classList.toggle('hidden', type !== 'daily');
        startBtn.textContent = type === 'daily' ? 'Empezar sesión' : 'Start Practice';
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

        if (filterPos.value) {
            params.part_of_speech = filterPos.value;
        }

        if (reviewType === 'synonym') {
            params.with_synonyms = 1;
        }

        return params;
    }

    // El hueco en la frase necesita un ejemplo donde la palabra aparezca de
    // verdad; si no, no hay nada que tapar. Se filtra en el cliente porque el
    // backend no distingue ejemplos útiles de ejemplos que no citan la palabra.
    function usableForCloze(w) {
        return !!w.example && maskWordInExample(w.example, w.word) !== w.example;
    }

    function filterForType(words, type) {
        return type === 'cloze' ? words.filter(usableForCloze) : words;
    }

    // Mezcla de ejercicios de la sesión diaria. Rota hueco / opción múltiple /
    // traducción para que una palabra no se practique siempre igual, y devuelve
    // un tercio de ellas al final en ES→EN (cadena EN→ES→EN): reconocer una
    // palabra no prueba que puedas producirla.
    function buildDailyItems(deck) {
        const items = deck.map((w, i) => {
            let ex = 'translation';
            if (i % 3 === 0 && usableForCloze(w)) ex = 'cloze';
            else if (i % 3 === 1 && deck.length >= 4) ex = 'choice';
            return { ...w, _ex: ex, _rev: false };
        });
        // Las de resto 2 son justo las que van EN→ES arriba, así que su segunda
        // vuelta cierra la cadena. Se barajan y van al final para que haya
        // distancia real entre las dos apariciones.
        const chain = deck
            .filter((_, i) => i % 3 === 2)
            .map(w => ({ ...w, _ex: 'translation', _rev: true }));
        shuffleArray(chain);
        return items.concat(chain);
    }

    // ── Update word count on filter change ──────────────
    async function updateWordCount() {
        try {
            if (reviewType === 'daily') {
                const d = await api.reviews.daily(parseInt(dailySize.value) || 50);
                dailyMeta = d;
                const partes = [];
                if (d.due_count)  partes.push(`${d.due_count} por repasar`);
                if (d.new_count)  partes.push(`${d.new_count} nuevas`);
                if (d.weak_count) partes.push(`${d.weak_count} flojas`);
                const pendientes = d.due_remaining
                    ? ` · quedan ${d.due_remaining} vencidas para mañana`
                    : '';
                const ejercicios = d.words.length + Math.floor(d.words.length / 3);
                wordCountLabel.textContent = d.words.length
                    ? `Sesión de hoy: ${d.words.length} palabras · ~${ejercicios} ejercicios `
                      + `(${partes.join(' · ')})${pendientes}`
                    : 'Nada pendiente por hoy. Agrega palabras o vuelve mañana.';
                return;
            }
            const all = await api.reviews.practice(buildParams());
            const words = filterForType(all, reviewType);
            const nota = reviewType === 'cloze' && words.length < all.length
                ? ` (de ${all.length}; el resto no tiene una frase de ejemplo usable)`
                : '';
            wordCountLabel.textContent =
                `${words.length} word${words.length !== 1 ? 's' : ''} available to practice${nota}`;
        } catch {
            wordCountLabel.textContent = 'Error loading count';
        }
    }
    dailySize.addEventListener('change', updateWordCount);

    filterCat.addEventListener('change', updateWordCount);
    filterLevel.addEventListener('change', updateWordCount);
    filterMastery.addEventListener('change', updateWordCount);
    filterPos.addEventListener('change', updateWordCount);
    customInput.addEventListener('input', updateWordCount);
    await updateWordCount();

    // ── Start practice session ──────────────────────────
    startBtn.addEventListener('click', async () => {
        if (reviewType === 'daily') {
            const d = await api.reviews.daily(parseInt(dailySize.value) || 50);
            dailyMeta = d;
            const deck = d.words.slice();
            shuffleArray(deck);
            practiceWords = buildDailyItems(deck);
        } else {
            const words = filterForType(await api.reviews.practice(buildParams()), reviewType);
            shuffleArray(words);
            // Un solo formato: el elegido en el toggle, dirección según el modo.
            practiceWords = words.map(w => ({ ...w, _ex: reviewType }));
        }
        currentIndex = 0;
        isFlipped = false;
        sessionCorrect = 0;
        sessionIncorrect = 0;

        if (practiceWords.length === 0) {
            reviewArea.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

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
        speak(curRev() ? w.translation : w.word, curRev() ? 'es-ES' : 'en-US');
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
        const ex = curEx();
        // La opción múltiple se responde con el ratón; Enter solo avanza desde
        // el botón "Next", que ya tiene el foco.
        if (ex === 'choice') return;
        if (ex !== 'recognition') {
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

    // ── Typing mode: check + no idea + skip ─────────────
    typingSubmit.addEventListener('click', gradeTyping);
    typingNoIdea.addEventListener('click', noIdea);
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

    // Oculta la palabra objetivo dentro del ejemplo (modo ES→EN), para dar
    // contexto de uso sin regalar la respuesta. Cubre inflexiones simples.
    function maskWordInExample(example, word) {
        const text = String(example || '');
        const w = String(word || '').trim();
        if (!text || !w) return text;
        // Reducimos la palabra a su raíz para que también case cuando el ejemplo
        // usa otra inflexión (guardada "shifts", ejemplo "shift").
        const stem = w.replace(/(?:ies|es|s|ing|ed|ly)$/i, m =>
            (w.length - m.length >= 3 ? '' : m));
        const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const re = new RegExp(`\\b${escaped}(?:ies|es|s|ing|ed|d|ly)?\\b`, 'gi');
        return text.replace(re, '_____');
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
        const ex = curEx();
        if (ex === 'choice') showChoiceCard();
        else if (ex === 'recognition') showRecognitionCard();
        else showTypingCard();
    }

    function showRecognitionCard() {
        flashcardContainer.classList.remove('hidden');
        typingContainer.classList.add('hidden');
        choiceContainer.classList.add('hidden');

        const w = practiceWords[currentIndex];
        const cat = w.category_name ? `${w.category_icon} ${w.category_name}` : '';

        if (!curRev()) {
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
        choiceContainer.classList.add('hidden');
        typingContainer.classList.remove('hidden');

        const w = practiceWords[currentIndex];
        const ex = curEx();
        const rev = curRev();
        // La frase con hueco necesita más ancho y menos tamaño que una palabra.
        typingPrompt.style.fontSize = ex === 'cloze' ? '1.3rem' : '';
        if (ex === 'synonym') {
            typingPrompt.textContent = w.word;
            typingLabel.textContent = 'Escribe un sinónimo (en inglés)';
            typingHint.textContent = w.translation || '';
        } else if (ex === 'cloze') {
            typingPrompt.textContent = maskWordInExample(w.example, w.word);
            typingLabel.textContent = 'Completa la frase (en inglés)';
            typingHint.textContent = w.translation || '';
        } else if (!rev) {
            typingPrompt.textContent = w.word;
            typingLabel.textContent = 'Escribe la traducción';
            typingHint.textContent = '';
        } else {
            typingPrompt.textContent = w.translation;
            typingLabel.textContent = 'Escribe la palabra en inglés';
            typingHint.textContent = '';
        }

        // Frase de ejemplo como contexto de uso. En ES→EN la palabra objetivo va
        // enmascarada para que el ejemplo ayude sin dar la respuesta. En el hueco
        // no se repite: la frase ya *es* el enunciado.
        const exampleText = (w.example && ex !== 'cloze')
            ? (rev && ex !== 'synonym' ? maskWordInExample(w.example, w.word) : w.example)
            : '';
        typingExample.textContent = exampleText ? `"${exampleText}"` : '';

        const cat = w.category_name
            ? `<span class="badge" style="background:${w.category_color || '#8b5cf6'}22;color:${w.category_color || '#8b5cf6'}">${w.category_icon || ''} ${esc(w.category_name)}</span>`
            : '';
        typingBadges.innerHTML = cefrBadgeHTML(w.cefr_level) + cat;

        typingInput.value = '';
        typingInput.disabled = false;
        typingActions.classList.remove('hidden');
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

        const ex = curEx();
        let expected, res;
        if (ex === 'synonym') {
            const list = Array.isArray(w.synonyms) ? w.synonyms : [];
            res = checkAgainstList(val, list);
            expected = list.join(', ');
        } else if (ex === 'cloze') {
            expected = w.word;
            res = checkAnswer(val, expected);
        } else if (!curRev()) {
            expected = w.translation;
            res = checkAnswer(val, expected);
        } else {
            expected = w.word;
            res = checkAnswer(val, expected);
        }

        typingInput.disabled = true;
        typingActions.classList.add('hidden');
        const quality = res.correct ? (res.exact ? 5 : 4) : 1;
        renderTypingFeedback(res, expected, w, quality, val.trim());
    }

    // "No idea": admitir que no la sabes cuenta como fallo (quality 1) y revela
    // la respuesta. Antes, saltar la palabra la dejaba invisible para SM-2, así
    // que las que peor sabías eran las que menos volvían.
    function noIdea() {
        const w = practiceWords[currentIndex];
        if (!w) return;
        const ex = curEx();
        let expected;
        if (ex === 'synonym') {
            expected = (Array.isArray(w.synonyms) ? w.synonyms : []).join(', ');
        } else if (ex === 'cloze') {
            expected = w.word;
        } else {
            expected = curRev() ? w.word : w.translation;
        }
        typingInput.disabled = true;
        typingActions.classList.add('hidden');
        renderTypingFeedback({ correct: false, exact: false }, expected, w, 1, '');
    }

    // ── Opción múltiple ─────────────────────────────────
    // Los distractores salen del mazo de la sesión, priorizando la misma
    // categoría gramatical: un adjetivo entre sustantivos se descarta solo y el
    // ejercicio deja de probar nada.
    function buildChoiceOptions(w) {
        const correcta = String(w.word).toLowerCase();
        const pool = practiceWords.filter(x => x.id !== w.id);
        const mismoPos = pool.filter(x => x.part_of_speech && x.part_of_speech === w.part_of_speech);
        const fuente = (mismoPos.length >= 3 ? mismoPos : pool).slice();
        shuffleArray(fuente);

        const vistas = new Set([correcta]);
        const distractores = [];
        for (const x of fuente) {
            const k = String(x.word).toLowerCase();
            if (vistas.has(k)) continue;   // el mazo trae repetidas por la cadena
            vistas.add(k);
            distractores.push(x.word);
            if (distractores.length === 3) break;
        }
        const opciones = [w.word, ...distractores];
        shuffleArray(opciones);
        return opciones;
    }

    function showChoiceCard() {
        flashcardContainer.classList.add('hidden');
        typingContainer.classList.add('hidden');
        choiceContainer.classList.remove('hidden');

        const w = practiceWords[currentIndex];
        // Mejor enunciado disponible: frase con hueco > definición > traducción.
        if (usableForCloze(w)) {
            choiceLabel.textContent = '¿Qué palabra completa la frase?';
            choicePrompt.textContent = maskWordInExample(w.example, w.word);
            choiceHint.textContent = w.translation || '';
        } else if (w.definition) {
            choiceLabel.textContent = '¿Qué palabra corresponde?';
            choicePrompt.textContent = w.definition;
            choiceHint.textContent = w.translation || '';
        } else {
            choiceLabel.textContent = '¿Cómo se dice en inglés?';
            choicePrompt.textContent = w.translation;
            choiceHint.textContent = '';
        }

        const cat = w.category_name
            ? `<span class="badge" style="background:${w.category_color || '#8b5cf6'}22;color:${w.category_color || '#8b5cf6'}">${w.category_icon || ''} ${esc(w.category_name)}</span>`
            : '';
        choiceBadges.innerHTML = cefrBadgeHTML(w.cefr_level) + cat;

        choiceOptions.innerHTML = buildChoiceOptions(w).map(o =>
            `<button class="btn-secondary choice-opt" data-w="${esc(o)}" style="padding:0.6rem 0.75rem;font-size:0.85rem">${esc(o)}</button>`
        ).join('');
        choiceOptions.querySelectorAll('.choice-opt').forEach(b =>
            b.addEventListener('click', () => gradeChoice(b.dataset.w, w)));

        choiceFeedback.classList.add('hidden');
        choiceFeedback.innerHTML = '';
    }

    function gradeChoice(answer, w) {
        const correcta = String(w.word).toLowerCase();
        const ok = String(answer).toLowerCase() === correcta;

        choiceOptions.querySelectorAll('.choice-opt').forEach(b => {
            b.disabled = true;
            if (String(b.dataset.w).toLowerCase() === correcta) {
                b.style.background = 'rgba(52,199,89,0.18)';
                b.style.color = '#34c759';
            } else if (b.dataset.w === answer) {
                b.style.background = 'rgba(255,59,48,0.15)';
                b.style.color = '#ff3b30';
            }
        });

        // Reconocer entre 4 opciones es más fácil que producir: nunca da 5.
        const quality = ok ? 4 : 1;
        choiceFeedback.innerHTML = `
            <div class="rounded-lg p-3 text-left" style="background:${ok ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.1)'}">
                <div class="font-semibold text-sm" style="color:${ok ? '#34c759' : '#ff3b30'}">${ok ? '✓ Correcto' : '✗ Incorrecto'}</div>
                ${ok ? '' : `<div class="text-sm mt-1" style="color:var(--text-primary)">Respuesta: <span class="font-bold">${esc(w.word)}</span></div>`}
                <div class="text-sm mt-1" style="color:var(--text-primary)">${esc(w.translation || '')}</div>
                ${w.example ? `<div class="text-xs text-slate-500 italic mt-1">"${esc(w.example)}"</div>` : ''}
            </div>
            <button class="btn-primary mt-3 w-full" id="choice-next" style="padding:0.5rem 1.5rem">Next →</button>
        `;
        choiceFeedback.classList.remove('hidden');
        const nextBtn = choiceFeedback.querySelector('#choice-next');
        // Un segundo clic enviaría otra review de la misma palabra y saltaría la
        // siguiente mientras el POST está en vuelo.
        nextBtn.addEventListener('click', () => {
            nextBtn.disabled = true;
            submitAnswer(quality);
        });
        setTimeout(() => nextBtn.focus(), 50);
    }

    // Persiste una respuesta que el usuario marcó como válida, para que cuente
    // siempre. Sinónimo → se añade al array `synonyms`; traducción EN→ES → se
    // añade a las traducciones aceptadas (el calificador separa por comas).
    // En modo inverso (ES→EN) no hay un campo donde guardar alternativas, así que
    // solo se marca correcto esta vez.
    async function persistAcceptedAnswer(w, answer) {
        const ans = (answer || '').trim();
        if (!ans) return;
        const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
        const ex = curEx();
        if (ex === 'synonym') {
            const list = Array.isArray(w.synonyms) ? w.synonyms.slice() : [];
            if (!list.some(s => eq(s, ans))) {
                list.push(ans);
                await api.words.update(w.id, { synonyms: list });
                w.synonyms = list;
            }
        } else if (ex === 'translation' && !curRev()) {
            const parts = String(w.translation || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean);
            if (!parts.some(p => eq(p, ans))) {
                parts.push(ans);
                const joined = parts.join(', ');
                await api.words.update(w.id, { translation: joined });
                w.translation = joined;
            }
        }
    }

    function renderTypingFeedback(res, expectedRaw, w, quality, userAnswer) {
        const ok = res.correct;
        const isSyn = curEx() === 'synonym';
        const noAttempt = !userAnswer;
        const head = ok
            ? (res.exact ? '✓ Correcto' : '✓ Correcto (con un typo)')
            : (noAttempt ? '🤷 No la sabías — cuenta como fallo' : '✗ Incorrecto');
        // En sinónimos siempre mostramos la lista válida (es educativo). En
        // traducción solo revelamos la respuesta cuando falla.
        const synList = (isSyn && Array.isArray(w.synonyms) && w.synonyms.length)
            ? `<div class="text-sm mt-1" style="color:var(--text-primary)">Sinónimos válidos: <span class="font-bold">${esc(w.synonyms.join(', '))}</span></div>`
            : '';
        const revealAnswer = (!ok && !isSyn)
            ? `<div class="text-sm mt-1" style="color:var(--text-primary)">Respuesta: <span class="font-bold">${esc(expectedRaw)}</span></div>`
            : '';
        // Override sin IA: si escribiste una respuesta válida que la app no tenía.
        // Solo donde hay un campo donde guardarla: sinónimo y traducción EN→ES.
        // En ES→EN y en el hueco la respuesta esperada es la palabra misma.
        const canOverride = !ok && !noAttempt
            && (isSyn || (curEx() === 'translation' && !curRev()));
        const overrideLabel = isSyn
            ? '✓ Mi sinónimo también vale — guardarlo'
            : '✓ Mi respuesta también vale — guardarla';
        const override = canOverride
            ? `<button class="mt-2 text-xs font-medium" id="typing-override" style="color:#0071e3">${overrideLabel}</button>`
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
        nextBtn.addEventListener('click', () => {
            nextBtn.disabled = true;
            submitAnswer(quality);
        });
        const ov = typingFeedback.querySelector('#typing-override');
        if (ov) ov.addEventListener('click', async () => {
            ov.disabled = true;
            ov.textContent = 'Guardando…';
            try {
                await persistAcceptedAnswer(w, userAnswer);
                toast('Respuesta guardada — contará la próxima vez ✓');
            } catch (err) {
                toast(err.message || 'No se pudo guardar, pero cuenta como correcta', 'error');
            }
            submitAnswer(4);  // marcar correcto sin IA
        });
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
        // En sesión diaria el objetivo es cerrar el cupo, no vaciar el repositorio.
        const dailyNote = (reviewType === 'daily' && dailyMeta)
            ? `<p class="text-sm text-slate-500 mb-4">${dailyMeta.due_remaining
                  ? `Objetivo del día cumplido. Quedan ${dailyMeta.due_remaining} vencidas: se reparten en los próximos días.`
                  : 'Objetivo del día cumplido. No queda nada vencido — vuelve mañana.'}</p>`
            : '';
        reviewArea.innerHTML = `
            <div class="page-enter text-center mt-8">
                <div class="text-6xl mb-4">${pct >= 70 ? '🏆' : pct >= 40 ? '💪' : '📖'}</div>
                <h3 class="text-2xl font-bold mb-2">Session Complete!</h3>
                <p class="text-slate-400 mb-4">You practiced ${total} ${reviewType === 'daily' ? 'ejercicio' : 'word'}${total > 1 ? 's' : ''}.</p>
                ${dailyNote}
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
