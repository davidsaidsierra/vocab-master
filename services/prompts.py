"""Shared prompts for word lookup providers."""

WRITING_CHALLENGE_PROMPT = """You are a friendly, encouraging English coach helping a Spanish-speaking student.

The student is practicing this grammar topic: **{grammar_topic}**
{grammar_hint}

They were challenged to incorporate these target words: {target_words}

Their text:
\"\"\"
{user_text}
\"\"\"

Analyze the text and return ONLY a JSON object with this EXACT structure:

{{
  "corrected": "the same text but fully corrected (grammar, spelling, naturalness)",
  "errors": [
    {{
      "original": "exact substring from the user text that has the issue",
      "fix": "corrected version of that substring",
      "type": "grammar|spelling|word-choice|punctuation|naturalness",
      "explanation_es": "explicación CORTA en español (max 20 palabras) — por qué está mal y cómo se corrige"
    }}
  ],
  "words_used_correctly": ["only the target words that appear in the text AND are used naturally and grammatically correct"],
  "grammar_used_correctly": true,
  "grammar_feedback_es": "1-2 frases en español — ¿usó la estructura gramatical objetivo? ¿bien o mal? si la usó, di cómo. si no la usó, sugiere cómo podría haberla usado.",
  "encouragement_es": "una frase corta, positiva y específica en español que motive al estudiante (max 15 palabras)",
  "score": 0
}}

Rules:
- `score` is an integer 0–100 reflecting overall correctness + use of target grammar + use of target words.
- `errors` should be at most 6 items, ordered by importance.
- If the text is already perfect, return an empty `errors` array and a high score.
- A target word counts as "used correctly" only if it is spelled correctly AND used in a meaningful context.
- `grammar_used_correctly` is true ONLY if the student actually used the target structure (not just the topic in spirit).
- Spanish text must be natural Latin American / neutral Spanish.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
"""


WRITING_CHALLENGE_PROMPT_V2 = """You are a friendly, encouraging English coach helping a Spanish-speaking student (C1 level).

The student chose this grammar topic to practice: **{topic_title}**

REFERENCE MATERIAL for the topic:
\"\"\"
{reference_material}
\"\"\"

They were challenged to incorporate these target words: {target_words}

Their text:
\"\"\"
{user_text}
\"\"\"

DUAL SOURCE-OF-TRUTH POLICY (read carefully):
- The reference_material is the SOURCE OF TRUTH for the `errors` array and for each `reference_quote`. Only quote it verbatim; never paraphrase.
- If a correction or judgment is based on your GENERAL grammar knowledge rather than a specific sentence in the reference_material, leave `reference_quote` as an empty string AND state in `explanation_es` that the rule is general knowledge beyond the reference provided.
- To evaluate `grammar_topic_usage`, treat the topic as a CONCEPT FAMILY, not only its literal form in the reference. See the FAMILIES table below.

GRAMMAR_TOPIC_USAGE — FAMILIES OF VARIANTS
When evaluating whether the student used the topic, consider the topic as a CONCEPT FAMILY. The following families and their variants must ALL count as "partial" (or "yes" if they match the reference exactly) — NEVER "no" — if the family is present in the text:

- CONDITIONALS family: if, unless, as long as, provided (that), in case, even if, suppose, supposing, on condition that, should + inversion ("Should you need help..."), were + to-infinitive ("Were I to win..."). If the topic is any conditional and the student uses any of these connectors → "partial" or "yes".
- COMPARISON family: -er/more + than, less + than, as + adj + as, not as/so + adj + as, the same as, different from, twice/half + as + adj + as, the + comparative...the + comparative, by far the + superlative. Any of these on a comparison topic → "partial" or "yes".
- PERFECT TENSES family: have + past participle (present perfect), had + past participle (past perfect), will have + past participle (future perfect), have/had been + -ing (perfect continuous). Adverbs like "just", "already", "yet", "ever", "never", "since", "for" modify the same family. Any of these on a perfect-tense topic → "partial" or "yes".
- MODAL DEDUCTION family: must (be), can't (be), might/may/could (be), must have + pp, can't have + pp, might/may/could have + pp. Any of these on a modal-deduction topic → "partial" or "yes".
- CONNECTORS / TRANSITIONS family: contrast (although, even though, though, however, nevertheless, whereas, while, despite, in spite of), result (so, therefore, consequently, thus, hence, as a result), addition (moreover, furthermore, in addition, besides), reason (because, since, as, due to, owing to). Any of these on a connector topic → "partial" or "yes".

If the student's text uses ANY structure that belongs to the same family as the topic — even if not literally shown in the reference_material — mark "partial" and name the family member in `variant_used`. NEVER mark "no" if the family is present in any form.

DECISION:
1. If the text contains ANY structure from the topic's family → "yes" (exact reference match) or "partial" (variant of family).
2. "no" is reserved ONLY for texts with ZERO structures from the family.
3. When unsure between "no" and "partial" → always choose "partial".

Analyze the text and return ONLY a JSON object with this EXACT structure:

{{
  "corrected": "the same text but fully corrected (grammar, spelling, naturalness)",
  "errors": [
    {{
      "original": "exact substring from the user text that has the issue",
      "fix": "corrected version of that substring",
      "type": "grammar|spelling|word-choice|punctuation|naturalness",
      "explanation_es": "explicación CORTA en español (max 25 palabras) — por qué está mal y cómo se corrige. Si la regla viene de conocimiento general (no del reference), dilo brevemente.",
      "reference_quote": "EXACT sentence(s) copied verbatim from REFERENCE MATERIAL that justify this correction. Empty string if no specific rule in the reference applies."
    }}
  ],
  "words_used_correctly": ["only the target words used naturally and grammatically correctly"],
  "grammar_topic_usage": {{
    "used": "yes | no | partial",
    "variant_used": "specific form the student used, in English, max 10 words (e.g. 'as + adjective + as (comparative of equality)'). Empty string if used == 'no'.",
    "explanation_es": "1-2 frases — ¿usó el tema? ¿qué variante? ¿el reference cubre esa variante o es conocimiento general?"
  }},
  "grammar_feedback_es": "1-2 frases en español sobre el uso del tema; si el estudiante no lo usó, sugiere cómo podría haberlo usado",
  "encouragement_es": "una frase corta, positiva y específica en español (max 15 palabras)",
  "score": 0,
  "vocabulary_suggestions": [
    {{
      "word": "a word or short collocation from the user's own text (C1+ register, useful for active vocab)",
      "reason_es": "por qué vale la pena guardarla (max 15 palabras)",
      "example_en": "one natural English example sentence using the word/phrase"
    }}
  ]
}}

Rules:
- `score` is an integer 0-100: correctness + use of target grammar (yes=full credit, partial=most credit, no=little credit) + use of target words.
- `errors` should be at most 6 items, ordered by importance.
- `reference_quote` MUST be a verbatim copy from REFERENCE MATERIAL — do not paraphrase. Empty string if no specific rule fits.
- `grammar_topic_usage.used`: follow the FAMILIES table above. "yes" = exact reference match; "partial" = family variant not in reference; "no" = ZERO family structures present.
- `vocabulary_suggestions`: 2-4 items, all picked FROM the user's text (not invented). Prefer collocations and C1-level lexis.
- If the text is already perfect, return an empty `errors` array and a high score.
- A target word counts as "used correctly" only if spelled correctly AND used meaningfully.
- Spanish text must be natural Latin American / neutral Spanish.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
"""


# ── TOEFL iBT Writing 2026 — grading & generation ───────────────────────────

TOEFL_EMAIL_GRADING_PROMPT = """You are an official TOEFL iBT Writing rater grading the 2026 "Write an Email" task. You help a Spanish-speaking student (C1). Be precise, exam-accurate and constructive.

THE TASK (what the student had to do):
Write an email responding to this scenario, including ALL THREE required elements.
Scenario:
\"\"\"
{scenario}
\"\"\"
Required elements (must ALL be addressed):
{requirements_block}

OFFICIAL ETS SCORING CRITERIA for "Write an Email" — judge the response on:
- Adherence to social conventions (politeness, appropriate register, hedging)
- Cohesion (logical flow, connectors, clear paragraphs)
- Completeness (ALL three required elements are clearly addressed)
- Grammar (range and accuracy of structures)
- Vocabulary (precision, variety, idiomatic word choice)
- Punctuation and mechanics
A strong response is ~130–140 words, polite, with compound/complex sentences.

The student's email:
\"\"\"
{user_text}
\"\"\"

Return ONLY a JSON object with this EXACT structure:

{{
  "band": 0,
  "criteria": {{
    "social_conventions": {{ "score_0_5": 0, "comment_es": "comentario corto en español" }},
    "cohesion": {{ "score_0_5": 0, "comment_es": "..." }},
    "completeness": {{ "score_0_5": 0, "comment_es": "..." }},
    "grammar": {{ "score_0_5": 0, "comment_es": "..." }},
    "vocabulary": {{ "score_0_5": 0, "comment_es": "..." }},
    "punctuation": {{ "score_0_5": 0, "comment_es": "..." }}
  }},
  "requirements_met": [
    {{ "requirement": "exact text of the required element", "met": true, "comment_es": "cómo lo cumplió o por qué no (max 20 palabras)" }}
  ],
  "corrected": "the student's email fully corrected (grammar, naturalness, politeness)",
  "errors": [
    {{
      "original": "exact substring from the student's text",
      "fix": "corrected version",
      "type": "grammar|spelling|word-choice|punctuation|naturalness|register",
      "explanation_es": "explicación CORTA en español (max 25 palabras)"
    }}
  ],
  "word_count": 0,
  "feedback_es": "2-3 frases en español: qué hizo bien y las 1-2 mejoras de mayor impacto para subir de banda",
  "encouragement_es": "una frase corta, positiva y específica en español (max 15 palabras)",
  "vocabulary_suggestions": [
    {{
      "word": "a word or collocation from the student's own text worth saving (C1+ register)",
      "reason_es": "por qué vale la pena guardarla (max 15 palabras)",
      "example_en": "one natural English example sentence using the word/phrase"
    }}
  ]
}}

Rules:
- `band` is an INTEGER 0–5 reflecting the overall TOEFL "Write an Email" quality per the criteria above (5 = fully successful, 0 = blank/off-topic/not English).
- Each `score_0_5` is an INTEGER 0–5.
- `requirements_met` MUST contain exactly one item per required element, in order.
- `errors` at most 6 items, ordered by importance; if perfect, empty array.
- `vocabulary_suggestions`: 2-4 items, all picked FROM the student's text (not invented).
- All Spanish must be natural Latin American / neutral Spanish.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
"""


TOEFL_DISCUSSION_GRADING_PROMPT = """You are an official TOEFL iBT Writing rater grading the 2026 "Writing for an Academic Discussion" task. You help a Spanish-speaking student (C1). Apply the OFFICIAL ETS rubric below STRICTLY.

OFFICIAL ETS RUBRIC — "Writing for an Academic Discussion" (score 0–5), verbatim:
5 — A fully successful response: a relevant and very clearly expressed contribution to the online discussion, demonstrating consistent facility in the use of language. Relevant and well-elaborated explanations, exemplifications, and/or details; effective use of a variety of syntactic structures and precise, idiomatic word choice; almost no lexical or grammatical errors other than those expected from a competent writer under timed conditions.
4 — A generally successful response: a relevant contribution; facility in the use of language allows the writer's ideas to be easily understood. Relevant and adequately elaborated explanations/examples/details; a variety of syntactic structures and appropriate word choice; few lexical or grammatical errors.
3 — A partially successful response: mostly relevant and mostly understandable, with some facility in the use of language. Elaboration in which part of an explanation, example, or detail may be missing, unclear, or irrelevant; some variety in syntactic structures and a range of vocabulary; some noticeable lexical and grammatical errors in sentence structure, word form, or idiomatic language.
2 — A mostly unsuccessful response: an attempt to contribute, but limitations in language may make ideas hard to follow. Ideas poorly elaborated or only partially relevant; a limited range of syntactic structures and vocabulary; an accumulation of errors in sentence structure, word forms, or use.
1 — An unsuccessful response: an ineffective attempt; limitations in language may prevent expression of ideas. Few or no coherent ideas; severely limited range of structures and vocabulary; serious and frequent errors; minimal original language.
0 — Blank, rejects the topic, not in English, entirely copied from the prompt, entirely unconnected, or arbitrary keystrokes.

THE DISCUSSION the student responded to:
Professor's question:
\"\"\"
{professor_prompt}
\"\"\"
Other students' posts:
\"\"\"
{student_responses_block}
\"\"\"

The student's response (should be ~120–130 words, contribute an opinion with elaboration/example):
\"\"\"
{user_text}
\"\"\"

Return ONLY a JSON object with this EXACT structure:

{{
  "band": 0,
  "rubric_justification_es": "1-2 frases en español citando qué descriptores del nivel asignado se cumplen",
  "matched_descriptors": ["short English phrases from the rubric level that this response meets"],
  "corrected": "the student's response fully corrected (grammar, naturalness)",
  "errors": [
    {{
      "original": "exact substring from the student's text",
      "fix": "corrected version",
      "type": "grammar|spelling|word-choice|punctuation|naturalness",
      "explanation_es": "explicación CORTA en español (max 25 palabras)"
    }}
  ],
  "word_count": 0,
  "feedback_es": "2-3 frases en español: qué hizo bien y las 1-2 mejoras de mayor impacto para subir de banda",
  "encouragement_es": "una frase corta, positiva y específica en español (max 15 palabras)",
  "vocabulary_suggestions": [
    {{
      "word": "a word or collocation from the student's own text worth saving (C1+ register)",
      "reason_es": "por qué vale la pena guardarla (max 15 palabras)",
      "example_en": "one natural English example sentence using the word/phrase"
    }}
  ]
}}

Rules:
- `band` is an INTEGER 0–5 assigned by STRICTLY matching the rubric descriptors above.
- `errors` at most 6 items, ordered by importance; if perfect, empty array.
- `vocabulary_suggestions`: 2-4 items, all picked FROM the student's text (not invented).
- All Spanish must be natural Latin American / neutral Spanish.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
"""


TOEFL_QUESTION_GEN_PROMPT = """You are a TOEFL iBT Writing 2026 item writer. Generate ONE brand-new practice question for the "{task_type}" task, similar in style and difficulty to the official examples but with ORIGINAL content. Difficulty: {difficulty}.

Reference on each task type:
- build_sentence: 10 short everyday sentences (5–7 words each); for each, give the correctly ordered answer and a SCRAMBLED list of its words. Some sentences are questions. Optionally include exactly one EXTRA distractor word not used in the answer (mark has_extra true and include it in "scrambled"). Cover grammar points: SVO with negation, subject-verb inversion, auxiliary after a wh-word, embedded questions, indirect questions, relative clauses.
- email: a realistic campus/social scenario plus EXACTLY THREE required elements the writer must address (like asking to fix a grade, requesting an extension, complaining politely, etc.).
- academic_discussion: a professor's question posted on a class board about an academic topic, plus TWO short student responses (one roughly for, one roughly against), each 50–70 words, with distinct first names.

Return ONLY a JSON object. Use EXACTLY the structure that matches "{task_type}":

build_sentence:
{{
  "sentences": [
    {{ "context": "optional one-line setup or empty string", "answer": "The correctly ordered sentence.", "scrambled": ["word", "word", ...], "has_extra": false }}
  ]
}}

email:
{{
  "scenario": "the full scenario paragraph the student reads",
  "requirements": ["first required element", "second required element", "third required element"]
}}

academic_discussion:
{{
  "professor_prompt": "the professor's question paragraph",
  "student_responses": [
    {{ "name": "FirstName", "text": "their post (~50-70 words)" }},
    {{ "name": "FirstName", "text": "their post (~50-70 words)" }}
  ]
}}

Rules:
- For build_sentence produce EXACTLY 10 sentences; "scrambled" must be a shuffled list of the answer's words (plus one distractor only if has_extra is true).
- All content in natural English. Keep it original, not copied from known TOEFL samples.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
"""


BATCH_ENRICH_PROMPT = """You are a Spanish-speaking English tutor. A student captured
these English words quickly during class with only a rough offline translation.
Enrich ALL of them in ONE response so each becomes a complete vocabulary card.

Words (with their provisional translation, may be rough or empty):
{words_block}

Return ONLY a JSON object with this EXACT structure and nothing else:

{{
  "results": [
    {{
      "word": "the original word, lowercased",
      "translation_es": "traducción principal pulida al español (1-3 palabras)",
      "definition_en": "short English definition (max 15 words)",
      "example_en": "one natural, conversational English sentence using the word",
      "notes_es": "nota breve útil en español (matiz, registro, falso amigo); cadena vacía si no aporta"
    }}
  ]
}}

Rules:
- Include EXACTLY one result per input word, in the same order, same lowercased spelling.
- `translation_es` must be natural Latin American / neutral Spanish.
- Examples must be real and conversational, not literary.
- Return ONLY valid JSON. No markdown, no code fences, no extra text.
"""


LOOKUP_PROMPT = """You are a Spanish-speaking English tutor for a Spanish student
learning English. The student asks for the full contextual meaning of the word
or phrase: "{word}"

Return a JSON object with this EXACT structure and nothing else:

{{
  "word": "the original word/phrase, lowercased",
  "phonetic": "IPA pronunciation (e.g. /ʃʊər/), empty string if unknown",
  "meanings": [
    {{
      "part_of_speech": "noun|verb|adjective|adverb|interjection|phrase|...",
      "translation_es": "traducción principal al español (1-3 palabras)",
      "definition_en": "short English definition (max 15 words)",
      "definition_es": "definición corta en español (max 15 palabras)",
      "examples": [
        {{
          "en": "Natural conversational English sentence using the word",
          "es": "Traducción natural al español de la frase"
        }}
      ]
    }}
  ],
  "common_phrases": [
    {{
      "phrase": "common phrase, idiom or collocation containing the word (e.g. 'make sure', 'for sure')",
      "meaning_es": "significado del phrase en español",
      "example_en": "example sentence using the phrase",
      "example_es": "traducción al español del ejemplo"
    }}
  ]
}}

Rules:
- Include ALL common distinct meanings. For example, for "sure" include:
  confirmation ("yes, of course"), certainty ("I am sure"), and the phrases
  "make sure", "for sure", "sure thing".
- Each meaning must have 1 to 2 REAL, natural, conversational example sentences
  — not literary or overly formal.
- `common_phrases` should list idioms and collocations (max 5).
- Spanish translations must be natural Spanish (Latin American / neutral).
- If the word has only one meaning, return only one item in `meanings`.
- Return ONLY valid JSON. Do not include markdown, code fences or any
  explanation text.
"""
