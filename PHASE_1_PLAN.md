# Phase 1 — Grammar Knowledge Base Integration

## Objective
Allow the user to pick **any grammar topic** from a 238-section knowledge base and practice writing about it. The AI correction must be **grounded in the chosen topic's reference material** (cite the exact rule from the KB in each error).

## Success criteria (how we know Phase 1 is done)
- [ ] User can browse/search the 238 grammar topics in the UI.
- [ ] User can pick a topic, write a text (up to ~800 words), and submit.
- [ ] The AI correction includes a `reference_quote` per error, pulled from the KB.
- [ ] The frontend displays the reference quote under each correction.
- [ ] Daily limit and char limit are raised to sensible values for serious practice.
- [ ] Existing functionality (random topic from `englishClass.WEEKS`, vocabulary review, mastery boost) keeps working unchanged.

## Inputs available
- `knowledge_base_clean.md` (provided by user) — 238 sections, each starting with `## Section NNN — Title`.
- Existing codebase (already explored; see `CLAUDE.md`).

---

## Tasks — execute IN ORDER, one at a time

### Task 1.1 — Add `GrammarTopic` model
**File:** `database/models.py`
**Action:** Add a new SQLAlchemy model `GrammarTopic` with these columns:
- `id` (PK)
- `slug` (String, unique, indexed) — e.g. `"section-049-first-conditional"`
- `section_number` (Integer, indexed) — e.g. `49`
- `title` (String) — e.g. `"First Conditional"`
- `level` (String, nullable) — A1/A2/B1/B2/C1, inferred from content or NULL if unknown
- `category` (String, nullable) — high-level group (e.g. `"conditionals"`, `"past tenses"`, `"connectors"`) — best-effort
- `content_md` (Text) — full markdown content of the section
- `keywords` (Text, nullable) — space-separated keywords for search
- `created_at` (DateTime, default `_utcnow`)

**Do NOT** alter existing models. Just append the new one.

**Verification:** show the diff of `models.py` before applying.

---

### Task 1.2 — Import script for the knowledge base
**New file:** `scripts/import_grammar_kb.py`
**Action:** Standalone script (not part of the app) that:
1. Reads `knowledge_base_clean.md` from a CLI arg (default: `./knowledge_base_clean.md`).
2. Splits it by `## Section NNN — Title` headings.
3. For each section, extracts: section_number, title, content_md (everything until the next `## Section` or `---` separator).
4. Infers `category` from the title using a hand-written keyword map (e.g. titles containing "Conditional" → `"conditionals"`, "Past" → `"past tenses"`, etc.). If no match, NULL.
5. Inferring `level`: try to find an A1/A2/B1/B2/C1 marker in the content; if none, leave NULL.
6. Builds `keywords` by extracting nouns/verbs from the title (simple: split title, lowercase, drop stopwords).
7. Upserts into `GrammarTopic` (by `slug`), so re-running the script updates instead of duplicating.

**CLI usage:**
```bash
python scripts/import_grammar_kb.py [path/to/knowledge_base_clean.md]
```

**Output:** print `Imported X topics, updated Y` at the end.

**Verification:** after running, the script reports 238 rows. Run a quick SQL query to confirm count.

---

### Task 1.3 — API endpoints for grammar topics
**New file:** `api/grammar.py`
**Action:** New router `/api/grammar` with:

1. `GET /api/grammar/topics`
   - Query params: `q` (search string, optional), `level` (optional), `category` (optional), `limit` (default 50, max 250).
   - Returns: `{ "topics": [{ id, slug, section_number, title, level, category }] }`
   - Search: `q` matches `title` OR `keywords` (case-insensitive `LIKE`).
   - Order: by `section_number` ASC.

2. `GET /api/grammar/topics/{slug}`
   - Returns full topic including `content_md`.
   - 404 if not found.

3. `GET /api/grammar/categories`
   - Returns distinct categories with their topic counts: `[{ category, count }]`.

**Schemas:** add to `api/schemas.py` (`GrammarTopicSummary`, `GrammarTopicFull`, `GrammarCategoryCount`).

**Wire it up:** include the router in `main.py` with the same `verify_api_key` dependency as the others.

**Verification:** with the dev server running:
- `GET /api/grammar/categories` returns >0 categories.
- `GET /api/grammar/topics?q=conditional` returns at least one result.
- `GET /api/grammar/topics/<some-slug>` returns the full content_md.

---

### Task 1.4 — Enriched writing prompt with KB grounding
**File:** `services/prompts.py`
**Action:** Add a new prompt `WRITING_CHALLENGE_PROMPT_V2` (don't delete the old one; keep it as fallback). New prompt:

- Takes `reference_material` (the topic's `content_md`) as an extra slot.
- Instructs the model to use the reference as **source of truth** for explanations.
- Adds a new field `reference_quote` to each error: the EXACT sentence(s) from the reference material that justify the correction. Empty string if no specific rule applies.
- Adds a new top-level field `vocabulary_suggestions`: 2-4 word/phrase suggestions from the user's text that are worth adding to vocabulary (C1+ level, useful collocations). Each item: `{ word, reason_es, example_en }`.

**Do NOT touch `LOOKUP_PROMPT`.**

---

### Task 1.5 — Update Groq service and writing endpoint
**Files:** `services/groq.py`, `api/writing.py`, `api/schemas.py`

1. In `services/groq.py`, add a new function `correct_writing_v2(*, topic_title, topic_content_md, target_words, user_text) -> dict`. Same single-call pattern, uses the new prompt, sets defaults for new fields (`reference_quote`, `vocabulary_suggestions`).
2. In `api/schemas.py`:
   - Add `reference_quote: str = ""` to `WritingError`.
   - Add `VocabularySuggestion` model: `{ word: str, reason_es: str, example_en: str }`.
   - Add `vocabulary_suggestions: list[VocabularySuggestion] = []` to `WritingSubmitOut`.
   - In `WritingSubmitIn`, add `grammar_topic_slug: str | None = None` (optional; if provided, use V2 flow).
3. In `api/writing.py`, in `submit_writing`:
   - If `data.grammar_topic_slug` is set, fetch the `GrammarTopic` by slug, call `correct_writing_v2()` with its `content_md`.
   - Otherwise, keep the existing `correct_writing()` flow for backward compatibility.
   - Map the new fields into the response.

**Verification:** submit a writing via curl with `grammar_topic_slug="section-049-first-conditional"` and confirm:
- Response includes `reference_quote` in errors.
- Response includes `vocabulary_suggestions`.
- Old submissions (without `grammar_topic_slug`) still work unchanged.

---

### Task 1.6 — Raise limits
**File:** `api/writing.py`
**Action:**
- Change `DAILY_LIMIT` from `10` to `50`.
- Change the `len(text) > 1500` check to `len(text) > 5000`.
- Update any frontend text that mentions "1500" or "150 palabras" to reflect new limits.

---

### Task 1.7 — Frontend: Grammar topic picker
**New file:** `frontend/js/components/grammarPicker.js`
**Action:** A new component that:
- Fetches `/api/grammar/categories` and `/api/grammar/topics`.
- Renders a searchable, categorized list (left sidebar: categories; right pane: topics in that category; topic click → emits an `onPick(topic)` callback).
- Includes a search box that filters across all topics (debounced).

**Integration:** in `writingChallenge.js`:
- Add a button "📚 Cambiar tema" (next to the existing "🎲 Cambiar tema") that opens the picker as a modal.
- When the user picks a topic via the picker, store it in state (`state.topic`) using the same shape the rest of the component expects, plus a new `state.topicSlug` field.
- When submitting, include `grammar_topic_slug: state.topicSlug` in the payload if set.
- When result comes back, render `reference_quote` under each error (small italic block under the explanation) and render `vocabulary_suggestions` as a new section with "+ Add" buttons that POST to the existing `/api/words` endpoint.

**Do NOT** rip out the random-from-`WEEKS` flow. Both must coexist.

---

### Task 1.8 — CSS for new UI elements
**File:** `frontend/css/styles.css`
**Action:** Add styles for:
- `.wc-reference-quote` — small italic block, muted color, left-border accent.
- `.wc-vocab-suggestions` — section similar to `.wc-section`.
- `.wc-vocab-item` — chip-like with "+ Add" button.
- `.gp-modal`, `.gp-sidebar`, `.gp-list`, `.gp-search`, `.gp-topic` — for the grammar picker modal.

Match existing visual style (look at `.wc-*` classes for reference).

---

## After Phase 1 is done
Stop. Do not start Phase 2 (error log + weaknesses) without the user's explicit go-ahead. Report what was built, what tests were run manually, and any deviations from the plan.
