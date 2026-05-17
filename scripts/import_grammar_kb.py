"""
Import the grammar knowledge base (238 sections) into the GrammarTopic table.

Re-runnable: upserts by `slug`. After parsing, prints an audit breakdown
(counts by category, by level, slugs with no category) so the human can
sanity-check the result.

Usage:
    python scripts/import_grammar_kb.py [path/to/knowledge_base_clean.md]
    (default path: ./knowledge_base_clean.md, relative to the project root)
"""

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

# Bootstrap: this script lives in scripts/, so project root is its parent.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from database.connection import SessionLocal, init_db
from database.models import GrammarTopic


# ── Parsing ────────────────────────────────────────────────────────────────
SECTION_RE = re.compile(r'^## Section (\d+)\s+—\s+(.+?)\s*$', re.MULTILINE)
TRAILING_SEP_RE = re.compile(r'\n+---\s*$')
# Cross-reference placeholders: "Same content as Section NNN".
# Detectado en cualquier parte del body; se materializa appendendo el
# contenido de la sección referenciada (preserva notas tipo "...plus X" o
# "...with additional collocations:" de la sección original).
CROSS_REF_RE = re.compile(r'Same content as Section (\d+)', re.IGNORECASE)
LEVEL_RE = re.compile(r'\b(A1|A2|B1|B2|C1|C2)\b')
SLUG_NON_ALNUM_RE = re.compile(r'[^a-z0-9]+')
STOPWORDS = {"the", "a", "an", "of", "in", "and", "or", "with", "to", "for", "&"}

# Category map: order matters (first match wins). More specific rules first.
# "Past Perfect" → perfect tenses (not past). "Past Continuous" → continuous.
# Change order or move keywords if a different grouping is desired.
CATEGORY_RULES = [
    ("conditional",                 "conditionals"),
    ("phrasal verb",                "phrasal verbs"),
    ("reported speech",             "reported speech"),
    ("indirect",                    "reported speech"),
    ("relative",                    "relative clauses"),
    ("subjunctive",                 "subjunctive"),
    ("passive",                     "passive"),
    ("modal",                       "modals"),
    ("gerund",                      "gerunds & infinitives"),
    ("infinitive",                  "gerunds & infinitives"),
    ("comparative",                 "comparison"),
    ("superlative",                 "comparison"),
    ("question",                    "questions"),
    ("word order",                  "questions"),
    ("connector",                   "connectors"),
    ("linker",                      "connectors"),
    ("conjunction",                 "connectors"),
    ("preposition",                 "prepositions"),
    ("pronoun",                     "pronouns"),
    ("article",                     "articles"),
    ("perfect",                     "perfect tenses"),
    ("continuous",                  "continuous tenses"),
    ("past",                        "past tenses"),
    ("present",                     "present tenses"),
    ("future",                      "future tenses"),
]


def slugify(text: str) -> str:
    s = SLUG_NON_ALNUM_RE.sub('-', text.lower()).strip('-')
    return re.sub(r'-{2,}', '-', s)


def infer_category(title_lc: str) -> str | None:
    for needle, cat in CATEGORY_RULES:
        if needle in title_lc:
            return cat
    return None


def infer_level(title: str) -> str | None:
    """Solo el título. El body puede contener referencias cruzadas
    (ej. 'for B2 learners') que falsearían el nivel real."""
    m = LEVEL_RE.search(title)
    return m.group(1) if m else None


def extract_keywords(title: str) -> str:
    tokens = SLUG_NON_ALNUM_RE.sub(' ', title.lower()).split()
    kept = [t for t in tokens if t and t not in STOPWORDS and not t.isdigit()]
    return ' '.join(kept)


def parse_sections(md_text: str) -> list[dict]:
    """Split on ## Section headings. re.split returns
    [pre_text, num1, title1, body1, num2, title2, body2, ...]."""
    parts = SECTION_RE.split(md_text)
    if (len(parts) - 1) % 3 != 0:
        raise ValueError(
            f"Parser desincronizado: {len(parts)} fragmentos no encajan en chunks de 3"
        )

    sections = []
    for i in range(1, len(parts), 3):
        num_str, title, body = parts[i], parts[i + 1], parts[i + 2]
        body = TRAILING_SEP_RE.sub('', body).strip()
        title = title.strip()
        sections.append({
            "section_number": int(num_str),
            "title": title,
            "content_md": body,
        })
    return sections


# ── Cross-reference resolution ─────────────────────────────────────────────
def resolve_references(sections: list[dict]) -> list[str]:
    """Mutate sections in-place: append referenced content where a section
    body says 'Same content as Section NNN'. Returns the list of slugs that
    were materialized (for the audit log)."""
    by_number = {s["section_number"]: s for s in sections}
    materialized = []
    for s in sections:
        m = CROSS_REF_RE.search(s["content_md"])
        if not m:
            continue
        ref_num = int(m.group(1))
        ref = by_number.get(ref_num)
        if ref is None or ref["section_number"] == s["section_number"]:
            continue  # broken reference or self-loop; skip silently
        # Don't recurse: if the referenced section is itself a placeholder,
        # just append its raw body. The chain is shallow in this KB.
        s["content_md"] = (
            f"{s['content_md']}\n\n---\n\n"
            f"**Contenido referenciado (Sección {ref_num:03d}):**\n\n"
            f"{ref['content_md']}"
        )
        materialized.append(f"{s['section_number']:03d} → {ref_num:03d}")
    return materialized


# ── Validation ─────────────────────────────────────────────────────────────
def validate(sections: list[dict]) -> None:
    # Originally the KB had 238 sections. New sections are appended over time;
    # we only require we never go below that baseline (catches accidental
    # parser failures that would silently drop sections).
    if len(sections) < 238:
        raise AssertionError(
            f"Esperaba al menos 238 secciones, encontré {len(sections)}. "
            "El parser pudo haber fallado."
        )

    seen_numbers = set()
    for s in sections:
        if not s["content_md"] or len(s["content_md"]) < 50:
            raise AssertionError(
                f"Sección {s['section_number']:03d} ({s['title']!r}) tiene "
                f"content_md vacío o muy corto ({len(s['content_md'])} chars). "
                "Probablemente el parser falló silenciosamente."
            )
        if s["section_number"] in seen_numbers:
            raise AssertionError(f"Sección {s['section_number']} duplicada")
        seen_numbers.add(s["section_number"])


# ── Upsert ─────────────────────────────────────────────────────────────────
def upsert_topics(sections: list[dict]) -> tuple[int, int, list[dict]]:
    """Returns (inserted_count, updated_count, enriched_rows_for_audit)."""
    init_db()  # ensures grammar_topics table exists
    db = SessionLocal()
    inserted = updated = 0
    enriched = []
    try:
        for s in sections:
            title_lc = s["title"].lower()
            slug = f"section-{s['section_number']:03d}-{slugify(s['title'])}"
            level = infer_level(s["title"])
            category = infer_category(title_lc)
            keywords = extract_keywords(s["title"])

            row = db.query(GrammarTopic).filter(GrammarTopic.slug == slug).one_or_none()
            if row is None:
                row = GrammarTopic(
                    slug=slug,
                    section_number=s["section_number"],
                    title=s["title"],
                    level=level,
                    category=category,
                    content_md=s["content_md"],
                    keywords=keywords,
                )
                db.add(row)
                inserted += 1
            else:
                row.title = s["title"]
                row.level = level
                row.category = category
                row.content_md = s["content_md"]
                row.keywords = keywords
                updated += 1

            enriched.append({
                "slug": slug,
                "section_number": s["section_number"],
                "title": s["title"],
                "level": level,
                "category": category,
            })
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return inserted, updated, enriched


# ── Audit report ───────────────────────────────────────────────────────────
def print_audit(inserted: int, updated: int, rows: list[dict]) -> None:
    cat_counts = Counter(r["category"] or "(no category)" for r in rows)
    level_counts = Counter(r["level"] or "(unspecified)" for r in rows)
    uncategorized = [r["slug"] for r in rows if r["category"] is None]

    print()
    print("=" * 60)
    print(f"Imported {inserted} topics, updated {updated}")
    print("=" * 60)

    print("\nCategorías encontradas (orden por count desc):")
    for cat, n in sorted(cat_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:>4}  {cat}")

    print("\nNiveles encontrados:")
    for lvl, n in sorted(level_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:>4}  {lvl}")

    print(f"\nSecciones sin categoría ({len(uncategorized)}):")
    if uncategorized:
        for slug in uncategorized:
            print(f"  - {slug}")
    else:
        print("  (ninguna — todas las secciones cayeron en alguna categoría)")
    print()


# ── Main ───────────────────────────────────────────────────────────────────
def main() -> int:
    # Windows default console is cp1252; force UTF-8 so audit output with
    # acentos y flechas no rompa el script al imprimir.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "path", nargs="?",
        default=str(PROJECT_ROOT / "knowledge_base_clean.md"),
        help="Path to knowledge_base_clean.md",
    )
    args = ap.parse_args()

    md_path = Path(args.path)
    if not md_path.is_file():
        print(f"ERROR: no existe el archivo {md_path}", file=sys.stderr)
        return 1

    md_text = md_path.read_text(encoding="utf-8")
    sections = parse_sections(md_text)
    materialized = resolve_references(sections)
    validate(sections)
    inserted, updated, enriched = upsert_topics(sections)
    print_audit(inserted, updated, enriched)
    if materialized:
        print(f"Referencias cruzadas materializadas ({len(materialized)}):")
        for m in materialized:
            print(f"  - Sección {m}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
