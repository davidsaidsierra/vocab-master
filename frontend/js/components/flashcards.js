import * as api from '../api.js';
import { toast } from '../utils/helpers.js';

let practiceWords = [];
let currentIndex = 0;
let isFlipped = false;
let sessionCorrect = 0;
let sessionIncorrect = 0;

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
                        <label class="block text-xs text-slate-500 mb-1">Difficulty</label>
                        <select id="review-filter-difficulty" class="form-input" style="padding:0.5rem 0.75rem;font-size:0.8rem">
                            <option value="">All difficulties</option>
                            <option value="5-5">⭐⭐⭐⭐⭐ Only (5)</option>
                            <option value="4-5">⭐⭐⭐⭐ to ⭐⭐⭐⭐⭐ (4–5)</option>
                            <option value="4-4">⭐⭐⭐⭐ Only (4)</option>
                            <option value="3-5">⭐⭐⭐ to ⭐⭐⭐⭐⭐ (3–5)</option>
                            <option value="3-3">⭐⭐⭐ Only (3)</option>
                            <option value="1-3">⭐ to ⭐⭐⭐ (1–3)</option>
                            <option value="2-2">⭐⭐ Only (2)</option>
                            <option value="1-2">⭐ to ⭐⭐ (1–2)</option>
                            <option value="1-1">⭐ Only (1)</option>
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
                <p class="text-xs text-slate-600 mt-2" id="word-count-label">Loading…</p>
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
                            <p class="text-xs text-indigo-300 mb-3 uppercase tracking-wider">What does this mean?</p>
                            <p class="text-3xl font-bold mb-3" id="card-word"></p>
                            <!-- Example visible below the word -->
                            <p class="text-sm text-indigo-200/80 italic px-4 text-center leading-relaxed" id="card-example-hint"></p>
                            <p class="text-sm text-indigo-300/60 mt-4" id="card-hint"></p>
                            <p class="text-xs text-indigo-400/50 mt-6">Click · Space to reveal</p>
                        </div>
                        <div class="flashcard-face flashcard-back">
                            <p class="text-xs text-emerald-300 mb-2 uppercase tracking-wider">Translation</p>
                            <p class="text-2xl font-bold mb-3" id="card-translation"></p>
                            <p class="text-sm text-emerald-200/70 italic mb-2" id="card-example"></p>
                            <p class="text-xs text-emerald-200/50" id="card-definition"></p>
                            <p class="text-xs text-emerald-300/40 mt-2 italic" id="card-notes"></p>
                        </div>
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
                    <p class="text-lg font-medium text-slate-300">No words found</p>
                    <p class="text-sm text-slate-500 mt-2">No words match your filters.<br>Try a wider range or add more words.</p>
                </div>
            </div>
        </div>
    `;

    const filterCat        = container.querySelector('#review-filter-cat');
    const filterDays       = container.querySelector('#review-filter-days');
    const filterDiff       = container.querySelector('#review-filter-difficulty');
    const customWrapper    = container.querySelector('#custom-days-wrapper');
    const customInput      = container.querySelector('#custom-days-input');
    const startBtn         = container.querySelector('#start-review-btn');
    const wordCountLabel   = container.querySelector('#word-count-label');
    const reviewArea       = container.querySelector('#review-area');
    const emptyState       = container.querySelector('#empty-state');
    const flashcard        = container.querySelector('#flashcard');
    const ratingPanel      = container.querySelector('#rating-panel');

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

        if (filterDiff.value) {
            const [min, max] = filterDiff.value.split('-');
            params.difficulty_min = min;
            params.difficulty_max = max;
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
    filterDiff.addEventListener('change', updateWordCount);
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

    function showCard() {
        const w = practiceWords[currentIndex];
        const total = practiceWords.length;
        const pct   = Math.round((currentIndex / total) * 100);

        container.querySelector('#card-word').textContent = w.word;
        container.querySelector('#card-example-hint').textContent = w.example ? `"${w.example}"` : '';
        container.querySelector('#card-hint').textContent = w.category_name ? `${w.category_icon} ${w.category_name}` : '';
        container.querySelector('#card-translation').textContent = w.translation;
        container.querySelector('#card-example').textContent = w.example ? `"${w.example}"` : '';
        container.querySelector('#card-definition').textContent = w.definition || '';
        container.querySelector('#card-notes').textContent = w.notes ? `📝 ${w.notes}` : '';
        container.querySelector('#review-progress').textContent = `${currentIndex + 1} / ${total}`;
        container.querySelector('#session-score').textContent = `✓ ${sessionCorrect}  ✗ ${sessionIncorrect}`;
        container.querySelector('#review-progress-bar').style.width = `${pct}%`;
    }

    // Remove keyboard listener when navigating away
    window.addEventListener('hashchange', () => document.removeEventListener('keydown', onKeyDown), { once: true });

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
