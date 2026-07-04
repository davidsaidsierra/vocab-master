# VocabMaster — Project Context

## What this is
VocabMaster is a **personal English learning tool** for a single user (the owner of this repo). It is NOT a public product, NOT a Duolingo competitor, and NOT multi-tenant. Optimize for the owner's learning, not for generality.

## Who the user is
- Mechanical engineer, native Spanish speaker, currently at C1 English.
- Learned English empirically (US travel, immersion, media) → high speaking fluency but **important gaps in formal grammar theory**.
- Already takes a formal English course (handles speaking practice there).
- Uses this app specifically for: **writing practice + active vocabulary building**.

## Core philosophy
- Efficiency over entertainment. No gamification, no streaks, no badges.
- Deep understanding > memorization. Every correction must explain **WHY**.
- Free forever (single-user, runs on `localhost`, uses Groq free tier).
- Minimize AI calls: one round-trip per writing submission. Cache aggressively.
- Combine deterministic logic with AI intelligently. AI only where it adds real value.

## Current architecture (already built — do NOT rewrite)
- **Backend:** FastAPI + SQLAlchemy + SQLite (`data/vocab.db`).
- **Auth:** multi-user JWT (invite-only, roles admin/premium/free) via `api/auth.py`. Local dev without login requires `ALLOW_OPEN_MODE=1`.
- **AI:** Groq (`openai/gpt-oss-120b` — migrated 2026-07 because Groq deprecated llama-3.3-70b, decommission 2026-08-16) with `response_format=json_object`. Gemini as fallback for word lookups.
- **Frontend:** vanilla JS modules (no framework), served from `frontend/`.
- **Chrome extension:** for quick word lookup while browsing.

## Key existing modules
- `database/models.py` — `Category`, `Word`, `Review`, `WritingChallenge`, `WordLookup`.
  - `Word` already has SM-2 fields (`ease_factor`, `interval`, `repetitions`, `mastery_level`, `next_review`).
  - `WritingChallenge` stores each writing submission + AI correction.
- `api/writing.py` — daily-quota writing challenge endpoint (currently 10/day, 1500 chars).
- `services/groq.py` — Groq client. `correct_writing()` does the single round-trip.
- `services/prompts.py` — `WRITING_CHALLENGE_PROMPT` and `LOOKUP_PROMPT`.
- `frontend/js/components/writingChallenge.js` — UI for the writing flow.
- `frontend/js/components/englishClass.js` — `WEEKS` array with topics seen in the user's formal class (used to pick a random grammar topic).

## What's being added — Grammar Knowledge Base integration
We are integrating a knowledge base of **238 grammar sections** (from `knowledge_base_clean.md`) so the user can:
1. **Pick any grammar topic** (not only those from his weekly class) to practice writing about.
2. Get AI corrections that **ground their explanations in the knowledge base** (with `reference_quote` citing the exact rule).
3. Build over time an **error history per topic** that personalizes future corrections.
4. Receive **vocabulary suggestions** from his own writing to add to his repository.

## Rules of engagement when working in this repo
1. **Read before writing.** Always view the relevant existing files before proposing changes. Do NOT recreate files that already exist.
2. **Minimal surface area.** Prefer editing existing modules over creating new ones. New files only when there's a clear architectural reason.
3. **Match existing style.** Spanish comments where existing code uses Spanish. Same naming conventions, same error-handling patterns, same JSON-shape conventions (snake_case keys, `*_es` for Spanish fields).
4. **One round-trip rule.** Writing corrections MUST stay at exactly one Groq call per submission. Do not split into multiple AI calls.
5. **Cache anything reusable.** If a piece of data can be computed once and reused, store it (DB row or in-memory).
6. **Spanish for the user, English for the schema.** All user-facing text (errors, explanations, encouragements) in neutral Latin American Spanish. All identifiers, types, keys, and code in English.
7. **No external dependencies without asking.** Stick to what's in `requirements.txt`.
8. **No tests scaffold unless requested.** This is a personal tool; ship features, don't build CI.

## What NOT to do
- Don't add user accounts, multi-tenancy, OAuth, or anything that implies multiple users.
- Don't add gamification (streaks, XP, levels, achievements).
- Don't replace SQLite with Postgres / "for scale". Single user, local file is correct.
- Don't add a new framework (React, Vue, etc.) to the frontend. Vanilla JS is intentional.
- Don't suggest paid services (ElevenLabs, OpenAI, Anthropic API). Groq free tier + Gemini fallback is the budget.
- Don't add speaking / audio features. Speaking is handled outside this app.

## Current task focus
**Phase 1 — Grammar Knowledge Base integration.** See `TASK.md` in the repo root (or the user's current message) for the specific task being worked on right now.
