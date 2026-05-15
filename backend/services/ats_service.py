# ─────────────────────────────────────────────────────────────────────────────
# ATS Score — Keyword-based fit measurement
#
# WHAT THIS FUNCTION DOES
#   Compares a resume against a job description and returns a 0-100 score
#   based on how many of the JD's keyword requirements appear in the resume,
#   weighted by frequency. This is the "gate" score: candidates below 30%
#   are auto-rejected (unless HR manually overrides).
#
# WHY THIS REWRITE (vs the previous implementation)
#   Matched candidates were stuck at 25-35% due to several silent bugs:
#
#   1. FREQUENCY WAS BROKEN: tokens were de-duplicated (`set()`) before being
#      counted, so frequency weighting never actually happened.
#
#   2. EXPANSION INFLATED THE DENOMINATOR: abbreviation expansion added
#      synonyms to the JD side, multiplying the cost of each concept.
#
#   3. TWO ALIAS SYSTEMS DIDN'T TALK: ABBREV (expansion) and KNOWN_VARIANTS
#      (matching) were separate dicts.
#
#   4. OVER-AGGRESSIVE FILLER: words like "data", "backend", "engineer" were
#      stripped, killing legitimate signal.
#
#   5. NO BIGRAM AWARENESS: "machine learning" was treated as two unigrams.
#
#   6. RESUME FREQUENCY IGNORED.
#
#   7. JD SECTIONS WERE NOT DISTINGUISHED: "About the company" boilerplate
#      contributed as many keywords to the denominator as actual requirements.
#
# NEW DESIGN PRINCIPLES
#   - Tokenize with frequencies preserved (no premature deduplication).
#   - Unified alias map: one source of truth for all variants/abbreviations.
#   - Detect skill BIGRAMS as first-class concepts before unigram tokenization.
#   - Section-aware: only count keywords from skill/requirement-bearing
#     sections of the JD (not "About the company", "Why join us", etc).
#   - Required-section keywords weighted 2x.
#   - Resume frequency capped at JD frequency (Jobscan-style partial credit).
#   - Protected words: PostgreSQL, MongoDB, etc. stay whole through tokenizing.
# ─────────────────────────────────────────────────────────────────────────────

import re as _re
from collections import Counter


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# True boilerplate only — no role-related or domain words.
FILLER = {
    # Articles / prepositions / conjunctions / pronouns
    "the", "and", "for", "are", "was", "were", "with", "this", "that", "have",
    "has", "had", "not", "from", "you", "your", "will", "can", "should",
    "would", "could", "may", "our", "their", "its", "also", "all", "any",
    "but", "more", "than", "into", "over", "such", "being", "been", "each",
    "which", "when", "they", "some", "who", "what", "how", "about", "other",
    "like", "just", "then", "there", "these", "those", "an", "in", "on", "of",
    "or", "at", "to", "is", "it", "be", "by", "as", "we", "us", "up", "do",
    "go", "no", "so", "if", "he", "she", "me", "my", "am", "a", "i",
    # Generic verbs / fillers
    "use", "used", "using", "must", "able", "good", "well", "per", "etc",
    "via", "want", "get", "make", "take", "see", "come", "title", "built",
    "designed", "deployed", "serving", "requests", "worked", "extensively",
    "transactional", "workloads",
    # HR boilerplate
    "year", "years", "role", "roles", "position", "company", "candidate",
    "qualifications", "requirements", "responsibilities", "duties",
    "following", "including", "minimum", "preferred", "plus", "bonus",
    "apply", "join", "seeking", "hire", "looking", "ability", "working",
    "related", "relevant", "strong", "excellent", "proven", "hands",
    "degree", "bachelor", "master", "equivalent", "field", "growing",
    "passionate", "enthusiastic", "motivated", "innovative", "ownership",
    "analytical", "detail", "oriented", "paced", "environment",
    "experience", "knowledge", "skills", "skill",
    "required", "nice", "must", "have", "essential", "mandatory",
    "basics", "basic", "familiarity", "understanding", "proficiency",
    # Filler adjectives / adverbs
    "effectively", "efficiently", "accurately", "consistently", "proactively",
    "responsible", "mindset", "attitude", "collaborative", "dynamic",
    "various", "different", "across", "within", "between", "without",
    "around", "along", "both", "based", "driven", "focused", "ready",
    "native", "enabled", "existing", "internal", "external", "global",
    "current", "future", "general", "specific",
    # JD connective words — generic verbs/nouns that surround skills but
    # aren't themselves skills. Including these in the JD denominator
    # punishes candidates whose resumes don't echo the exact JD phrasing.
    "programming", "development", "deployment", "design", "build",
    "maintain", "develop", "deliver", "create", "manage", "build",
    "implement", "integrate", "deploy", "write", "communicate",
    "exposure", "streaming", "message", "messages", "salary",
    "competitive", "hybrid", "offer", "offers", "version",
    "control", "cloud", "database", "databases", "service", "services",
    # Time / quantity
    "day", "days", "week", "weeks", "month", "months", "fast", "real",
    "high", "low", "complex", "simple", "multiple", "large", "scale",
    "senior", "junior", "mid", "level",
}

# Unified alias map. Each canonical form maps to a list of equivalents.
# Resume tokens get translated to the JD's canonical form via this map.
ALIASES = {
    # Programming languages
    "python":     ["python2", "python3", "python3.8", "python3.9",
                   "python3.10", "python3.11", "python3.12"],
    "javascript": ["js", "ecmascript"],
    "typescript": ["ts"],
    "golang":     ["go"],

    # Frameworks / libraries
    "react":      ["reactjs"],
    "node":       ["nodejs"],
    "vue":        ["vuejs"],
    "angular":    ["angularjs"],
    "next":       ["nextjs"],
    "nuxt":       ["nuxtjs"],
    "express":    ["expressjs"],

    # Databases
    "postgresql": ["postgres"],
    "mongodb":    ["mongo"],
    "elasticsearch": ["elastic"],
    "mysql":      [],
    "redis":      [],

    # Cloud / infra
    "aws":        ["amazon_web_services"],
    "gcp":        ["google_cloud", "google_cloud_platform"],
    "azure":      ["microsoft_azure"],
    "kubernetes": ["k8s"],
    "docker":     [],
    "kafka":      [],
    "rabbitmq":   ["rabbit"],

    # ML / data
    "tensorflow": ["tf"],
    "pytorch":    ["torch"],
    "sklearn":    ["scikit_learn"],
    "ml":         ["machine_learning"],
    "ai":         ["artificial_intelligence"],
    "dl":         ["deep_learning"],
    "nlp":        ["natural_language_processing"],
    "cv":         ["computer_vision"],
    "llm":        ["large_language_model", "large_language_models", "llms"],
    "rag":        ["retrieval_augmented_generation"],
    "eda":        ["exploratory_data_analysis"],
    "etl":        ["extract_transform_load"],
    "mlops":      ["machine_learning_operations"],

    # APIs / web
    "api":        ["apis"],
    "rest":       ["restful"],
    "graphql":    ["graph_ql"],
    "grpc":       [],
    "rest_api":   ["rest_apis"],   # bigram alias

    # DevOps
    "cicd":       ["ci_cd", "continuous_integration",
                   "continuous_deployment", "continuous_delivery"],
    "devops":     [],

    # UI / UX
    "ui":         ["user_interface"],
    "ux":         ["user_experience"],

    # General concepts
    "sql":        ["structured_query_language"],
    "nosql":      [],
    "oop":        ["object_oriented_programming"],
    "qa":         ["quality_assurance"],
}

# Multi-word skills. Detected before unigram tokenization so they stay
# as one concept. Stored as canonical underscore form internally.
SKILL_BIGRAMS = {
    "machine learning", "deep learning", "data science", "data engineering",
    "data analysis", "data analytics", "data visualization", "data warehouse",
    "data pipeline", "data modeling", "data engineer", "data scientist",
    "natural language", "natural language processing", "computer vision",
    "neural network", "neural networks",
    "reinforcement learning", "supervised learning", "unsupervised learning",
    "feature engineering", "model training", "hyperparameter tuning",
    "react native", "react js", "node js", "vue js", "angular js",
    "next js", "nuxt js", "express js",
    "rest api", "rest apis", "graph ql", "web services", "micro services",
    "cloud computing", "amazon web services", "google cloud",
    "object oriented", "functional programming", "test driven",
    "version control", "source control", "code review",
    "back end", "front end", "full stack",
    "software engineering", "software development", "agile methodology",
    "ci cd", "continuous integration", "continuous deployment",
    "unit testing", "integration testing",
    "system design", "distributed systems",
    "user interface", "user experience", "responsive design",
    "business intelligence", "product management", "project management",
    "large language model", "large language models",
    "retrieval augmented generation", "prompt engineering",
    "transfer learning", "fine tuning",
    "exploratory data analysis", "extract transform load",
    "object oriented programming",
    "scikit learn",
}

# Section header categories
REQUIRED_HEADERS = (
    "required skills", "required qualifications", "requirements",
    "must have", "must-have", "must haves", "essential skills",
    "essential requirements", "mandatory skills", "key requirements",
    "minimum requirements", "minimum qualifications", "you have",
    "what you bring", "what you'll need", "what we're looking for",
    "required",
)
NICE_HEADERS = (
    "nice to have", "nice-to-have", "preferred", "preferred qualifications",
    "good to have", "good-to-have", "bonus", "bonus points",
    "nice to haves",
)
SKILL_SECTION_HEADERS = (
    "skills", "technical skills", "responsibilities", "what you'll do",
    "what you will do", "the role", "role description", "job description",
    "duties", "key responsibilities", "your role",
)
IGNORE_HEADERS = (
    "about us", "about the company", "about the team", "who we are",
    "why join", "why join us", "perks", "benefits", "what we offer",
    "compensation", "equal opportunity", "eeo",
)

REQUIRED_WEIGHT = 2.0
NICE_WEIGHT     = 1.0
DEFAULT_WEIGHT  = 1.0


# ─────────────────────────────────────────────────────────────────────────────
# Tokenization helpers
# ─────────────────────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    """
    Convert HTML to plaintext while preserving block structure as newlines.

    WHY THIS MATTERS
        JDs created in rich-text editors (TinyMCE, CKEditor, etc) come back as
        one giant HTML blob with NO real newlines — every line break is a
        `<p>` or `<br>` tag, and every space is `&nbsp;`. If we just regex
        out the tags, the entire JD collapses to one long line, which breaks
        the section parser (it can't see "Required Skills:" on its own line)
        AND breaks bigram detection at line boundaries.

    APPROACH
        1. Convert block-level tags (`<p>`, `<br>`, `<div>`, `<li>`, `<h1>`–
           `<h6>`, `<tr>`, `<table>`, `<ul>`, `<ol>`) to newlines BEFORE
           stripping tags. The closing tag is what we substitute, so the
           content stays intact.
        2. Then strip remaining inline tags (`<span>`, `<strong>`, etc).
        3. Decode HTML entities (`&nbsp;` → space, `&amp;` → `&`, …).
        4. Collapse multiple consecutive newlines/spaces.
    """
    if not text:
        return text

    # Step 1: convert block-level tags to newlines.
    # Pattern: opening tag, closing tag, OR self-closing (like <br/>).
    BLOCK_TAGS = (
        r"p|div|br|li|ul|ol|tr|table|thead|tbody|tfoot|"
        r"h[1-6]|section|article|header|footer|nav|aside|"
        r"blockquote|pre|hr"
    )
    # Closing tags → newline
    text = _re.sub(
        rf"</\s*(?:{BLOCK_TAGS})\s*>", "\n", text, flags=_re.IGNORECASE
    )
    # Self-closing or void tags (<br>, <br/>, <hr>, <hr/>) → newline
    text = _re.sub(
        rf"<\s*(?:{BLOCK_TAGS})(?:\s[^>]*)?/?\s*>",
        "\n", text, flags=_re.IGNORECASE,
    )

    # Step 2: strip remaining inline tags (and any block tags we missed).
    text = _re.sub(r"<[^>]+>", " ", text)

    # Step 3: decode HTML entities.
    text = (text.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", '"')
                .replace("&#39;", "'")
                .replace("&apos;", "'")
                .replace("&rsquo;", "'")
                .replace("&lsquo;", "'")
                .replace("&rdquo;", '"')
                .replace("&ldquo;", '"')
                .replace("&mdash;", "—")
                .replace("&ndash;", "–")
                .replace("&hellip;", "…"))
    # Numeric entities like &#xNN; or &#NN;
    text = _re.sub(r"&#x([0-9a-fA-F]+);",
                   lambda m: chr(int(m.group(1), 16)), text)
    text = _re.sub(r"&#(\d+);",
                   lambda m: chr(int(m.group(1))), text)

    # Step 4: tidy whitespace.
    # Collapse runs of spaces/tabs (but keep newlines).
    text = _re.sub(r"[ \t]+", " ", text)
    # Collapse 3+ newlines down to 2 (preserve paragraph breaks).
    text = _re.sub(r"\n{3,}", "\n\n", text)
    # Strip trailing whitespace on each line.
    text = _re.sub(r"[ \t]+\n", "\n", text)

    return text


# Brand-name tech words whose internal casing shouldn't trigger camelCase split.
_PROTECTED_WORDS = {
    "postgresql", "mongodb", "mysql", "nosql", "graphql", "javascript",
    "typescript", "nodejs", "reactjs", "vuejs", "angularjs", "expressjs",
    "nextjs", "nuxtjs", "fastapi", "tensorflow", "pytorch", "elasticsearch",
    "rabbitmq", "github", "gitlab", "bitbucket", "kubernetes", "devops",
    "cicd", "mlops", "openai", "huggingface", "linkedin",
}


def _split_merged(text: str) -> str:
    """
    Split camelCase / merged words, protecting brand-name tech terms.
    Placeholders are made of lowercase letters only so the camelCase and
    digit splitters can't break them apart.
    """
    def _index_to_letters(n: int) -> str:
        # 0→'a', 1→'b', ..., 25→'z', 26→'ba', 27→'bb', ...
        s = ""
        n += 1
        while n > 0:
            n, r = divmod(n - 1, 26)
            s = chr(ord("a") + r) + s
        return s

    placeholders = {}
    sorted_protected = sorted(_PROTECTED_WORDS, key=len, reverse=True)
    for i, word in enumerate(sorted_protected):
        placeholder = f"xprotxx{_index_to_letters(i)}xprotxx"
        text = _re.sub(
            r"\b" + word + r"\b", placeholder, text, flags=_re.IGNORECASE
        )
        placeholders[placeholder] = word.lower()

    text = _re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    text = _re.sub(r"([a-zA-Z])([0-9])", r"\1 \2", text)
    text = _re.sub(r"([0-9])([a-zA-Z])", r"\1 \2", text)

    for placeholder, original in placeholders.items():
        text = text.replace(placeholder, original)
        text = text.replace(placeholder.upper(), original)
    return text


def _normalize(text: str) -> str:
    """Strip HTML, protect brand words, split merged words, lowercase.
    Hyphens inside tech terms (like scikit-learn) are converted to spaces so
    they get picked up correctly by the bigram and unigram tokenizers; the
    canonical alias form uses underscores."""
    text = _strip_html(text)
    text = _split_merged(text)
    # Hyphen between two letters → space (so "scikit-learn" tokenizes as
    # two words, then the SKILL_BIGRAMS detector catches "scikit learn"
    # via its alias mapping). Doesn't touch numbers or punctuation around.
    text = _re.sub(r"([a-zA-Z])-([a-zA-Z])", r"\1 \2", text)
    return text.lower()


def _extract_bigrams(text: str) -> Counter:
    """Detect skill bigrams in normalized text. Returns Counter of canonical underscore forms."""
    found = Counter()
    for bigram in SKILL_BIGRAMS:
        pattern = r"\b" + _re.escape(bigram) + r"\b"
        matches = _re.findall(pattern, text)
        if matches:
            found[bigram.replace(" ", "_")] = len(matches)
    return found


def _remove_bigrams_from_text(text: str) -> str:
    for bigram in SKILL_BIGRAMS:
        pattern = r"\b" + _re.escape(bigram) + r"\b"
        text = _re.sub(pattern, " ", text)
    return text


def _tokenize_unigrams(text: str) -> list:
    """Tokenize unigrams (frequencies preserved). Drop filler & short tokens."""
    # Pattern allows + and # (for C++ / C#) but stops at periods/commas.
    words = _re.findall(r"[a-zA-Z][a-zA-Z0-9+#]*", text)
    return [w for w in words if len(w) >= 2 and w not in FILLER]


# ─────────────────────────────────────────────────────────────────────────────
# JD section parsing
# ─────────────────────────────────────────────────────────────────────────────

def _classify_header(header: str) -> str:
    """Return 'required', 'nice', 'skill', 'ignore', or 'other'."""
    h = header.strip().lower().rstrip(":").rstrip("-").strip()
    if not h:
        return "other"
    for rh in REQUIRED_HEADERS:
        if h == rh or h.startswith(rh + " ") or h.endswith(" " + rh):
            return "required"
    for nh in NICE_HEADERS:
        if h == nh or h.startswith(nh + " ") or h.endswith(" " + nh):
            return "nice"
    for ih in IGNORE_HEADERS:
        if h == ih or h.startswith(ih + " ") or h.endswith(" " + ih):
            return "ignore"
    for sh in SKILL_SECTION_HEADERS:
        if h == sh or h.startswith(sh + " ") or h.endswith(" " + sh):
            return "skill"
    return "other"


def _parse_jd_sections(jd_text: str) -> list:
    """Split JD into (section_type, section_text) tuples."""
    lines = jd_text.split("\n")
    sections = []
    current_type = "other"
    current_buf = []

    for line in lines:
        stripped = line.strip()
        # A line is a candidate header if it's short, mostly letters,
        # and either ends with ':' or classifies as a known section type.
        is_short = 0 < len(stripped) <= 60
        ends_colon = stripped.endswith(":")
        classification = _classify_header(stripped) if is_short else "other"

        is_header = is_short and (ends_colon or classification != "other")

        if is_header:
            if current_buf:
                sections.append((current_type, "\n".join(current_buf)))
            current_type = classification if classification != "other" else "other"
            current_buf = []
        else:
            current_buf.append(line)

    if current_buf:
        sections.append((current_type, "\n".join(current_buf)))

    return sections


def _extract_or_alternatives(text: str) -> list:
    """
    Detect 'X or Y' / 'X / Y' alternatives within JD lines. Each pair of
    alternatives is a *single* requirement satisfied by either side.

    Returns a list of frozensets, each containing the lowercased tokens
    of one alternative group. e.g. for "PostgreSQL or MongoDB":
        [frozenset({'postgresql', 'mongodb'})]

    Only single-token alternatives are detected here (bigrams need separate
    handling and are rare in "X or Y" form anyway).
    """
    alternatives = []
    pattern = _re.compile(
        r"\b([a-zA-Z][a-zA-Z0-9+#]{1,20})"
        r"\s*(?:,\s*)?(?:or|/)\s*"
        r"([a-zA-Z][a-zA-Z0-9+#]{1,20})\b",
        _re.IGNORECASE,
    )
    for match in pattern.finditer(text):
        left = match.group(1).lower()
        right = match.group(2).lower()
        if left in FILLER or right in FILLER:
            continue
        if len(left) < 2 or len(right) < 2:
            continue
        alternatives.append(frozenset([left, right]))
    return alternatives


def _extract_jd_tokens(jd_text: str) -> tuple:
    """
    Build weighted Counter of JD keywords + list of OR-alternative groups.

      - 'required' sections → weight × 2.0
      - 'nice'/'skill' sections → weight × 1.0
      - 'ignore' sections → skipped
      - 'other' sections → counted only if JD has no structured sections

    Returns (counts, or_groups) where or_groups is a list of
    (frozenset_of_tokens, weight) tuples. Matching ANY token in a group
    satisfies the whole group.

    IMPORTANT: HTML stripping happens HERE, before section parsing. JDs from
    rich-text editors arrive as one long HTML blob with no real newlines —
    parsing sections on raw HTML treats the entire JD as one undifferentiated
    block, losing all required/nice weighting and bloating the denominator
    with company-description tokens. Running _strip_html first converts
    `<p>...</p>` boundaries into real newlines so the section parser works.
    """
    # Convert HTML→plaintext FIRST so section headers appear on their own lines.
    jd_plain = _strip_html(jd_text)

    sections = _parse_jd_sections(jd_plain)

    has_structured = any(
        s_type in ("required", "skill", "nice") for s_type, _ in sections
    )

    counts = Counter()
    or_groups = []

    for s_type, s_text in sections:
        if s_type == "ignore":
            continue
        if has_structured and s_type == "other":
            continue

        if s_type == "required":
            weight = REQUIRED_WEIGHT
        elif s_type == "nice":
            weight = NICE_WEIGHT
        else:
            weight = DEFAULT_WEIGHT

        # Section text is already plaintext (HTML stripped above), but
        # _normalize still does camelCase splitting and lowercasing.
        normalized = _normalize(s_text)

        section_alternatives = _extract_or_alternatives(normalized)

        bigrams = _extract_bigrams(normalized)
        remainder = _remove_bigrams_from_text(normalized)
        unigrams = _tokenize_unigrams(remainder)

        section_counts = Counter(unigrams)
        section_counts.update(bigrams)

        for tok, freq in section_counts.items():
            counts[tok] += freq * weight

        for group in section_alternatives:
            or_groups.append((group, weight))

    return counts, or_groups


# ─────────────────────────────────────────────────────────────────────────────
# Alias resolution
# ─────────────────────────────────────────────────────────────────────────────

def _build_match_index(jd_tokens: set) -> dict:
    """
    Map every alias form → the JD's canonical token, so resume can match in
    any form.

    IMPORTANT: A JD token mapping to itself is *protected* — alias rules can
    add new entries (for forms NOT in the JD) but cannot overwrite a token
    that the JD itself uses. Without this protection, if the JD contained
    both `rest_api` and `rest_apis` (because they're listed as aliases of
    each other in ALIASES), the index would end up swapping them: resume's
    `rest_api` would translate to `rest_apis` and vice versa, breaking
    exact matches.
    """
    index = {tok: tok for tok in jd_tokens}

    def _maybe_register(alias: str, canonical: str) -> None:
        # Never overwrite a token that is itself in the JD.
        if alias in jd_tokens:
            return
        # First write wins (deterministic). If the alias has already been
        # mapped to a different canonical, keep the first mapping.
        if alias in index:
            return
        index[alias] = canonical

    for jd_tok in jd_tokens:
        # If this JD token is a canonical alias key, register its variants
        # so the resume can express the skill in any equivalent form.
        if jd_tok in ALIASES:
            for variant in ALIASES[jd_tok]:
                _maybe_register(variant, jd_tok)

        # If this JD token is itself a variant of some canonical form,
        # register the canonical AND all sibling variants pointing to
        # this JD token.
        for canonical, variants in ALIASES.items():
            if jd_tok == canonical:
                continue
            if jd_tok in variants:
                _maybe_register(canonical, jd_tok)
                for sibling in variants:
                    if sibling != jd_tok:
                        _maybe_register(sibling, jd_tok)

    return index


# ─────────────────────────────────────────────────────────────────────────────
# Main scoring function
# ─────────────────────────────────────────────────────────────────────────────

def calculate_ats_score(resume_text: str, jd_text: str) -> float:
    """Frequency-weighted keyword match between resume and JD. Returns 0-100."""
    if not resume_text or not jd_text:
        return 0.0

    jd_counts, or_groups = _extract_jd_tokens(jd_text)
    if not jd_counts:
        return 0.0

    total_weight = sum(jd_counts.values())

    res_normalized = _normalize(resume_text)
    res_bigrams = _extract_bigrams(res_normalized)
    res_remainder = _remove_bigrams_from_text(res_normalized)
    res_unigrams = _tokenize_unigrams(res_remainder)

    resume_counts = Counter(res_unigrams)
    resume_counts.update(res_bigrams)

    match_index = _build_match_index(set(jd_counts.keys()))
    translated = Counter()
    for tok, count in resume_counts.items():
        canonical = match_index.get(tok, tok)
        translated[canonical] += count

    # ── Base matching: Jobscan-style capped frequency ────────────────────────
    matched_weight = 0.0
    for kw, jd_count in jd_counts.items():
        rc = translated.get(kw, 0)
        matched_weight += min(rc, jd_count)

    # ── OR-alternative refund ────────────────────────────────────────────────
    # For each "X or Y" group: if the resume matches at least one side, the
    # other side's missed weight is refunded. This prevents double-penalizing
    # for not having alternatives that the JD explicitly accepts as substitutes.
    refunded = 0.0
    for group, group_weight in or_groups:
        # Translate group members through alias index too — so "postgres" in the
        # JD's "X or Y" still matches "postgresql" in the canonical map.
        group_canonical = {match_index.get(g, g) for g in group}
        # Did the resume match any side?
        matched_any = any(translated.get(g, 0) > 0 for g in group_canonical)
        if not matched_any:
            continue
        # For each side that wasn't matched, refund its unmatched portion.
        for g in group_canonical:
            jd_c = jd_counts.get(g, 0)
            rc = translated.get(g, 0)
            unmatched_portion = max(0, jd_c - rc)
            refunded += unmatched_portion

    matched_weight += refunded
    matched_weight = min(matched_weight, total_weight)

    score = (matched_weight / total_weight) * 100
    return round(min(score, 100.0), 2)