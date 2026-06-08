from datetime import datetime
from services.mongo_service import candidates_collection, roles_collection
from services.qdrant_service import client, RESUME_COLLECTION, JD_COLLECTION
from sklearn.metrics.pairwise import cosine_similarity
from services.resume_segmenter import split_resume_into_chunks
from services.ollama_utils import call_fitment_llm, build_prompt
# Reuse the ATS tokenizer + alias machinery so fitment skill-matching is
# deterministic and consistent with the ATS score (no new dependencies).
from services.ats_service import (
    _strip_html, _split_merged, _normalize,
    _extract_bigrams, _remove_bigrams_from_text, _tokenize_unigrams,
    ALIASES,
)
import numpy as np
import json
import re

# NOTE: SentenceTransformer/BGE is only needed in qdrant_service.py for
# storing vectors. fitment_service no longer does chunk-level encoding —
# the LLM handles skill extraction directly via the two-pass prompt.

# ─────────────────────────────────────────────────────────────────────────────
# SCORING DESIGN
#
# Final fitment_score = WEIGHTED BLEND of two independent signals:
#
#   1. Cosine Signal  (40% weight)
#      BGE cosine scores cluster 0.50–0.88 for resume↔JD pairs.
#      Normalised: floor=0.50 → 0 pts,  ceiling=0.88 → 100 pts.
#
#   2. LLM Skill Signal  (60% weight)
#      Derived from Mistral's actual skill-gap analysis:
#        matched skill  → 1.0 pt  (full credit)
#        minor gap      → 0.2 pt  (partial knowledge, reduced from 0.4 to
#                                   avoid over-rewarding candidates with zero
#                                   matched skills but many minor gaps)
#        major gap      → 0.0 pt  (missing entirely)
#      score = weighted_sum / total_skills × 100
#
#   Final = (cosine × 0.40) + (llm × 0.60),  hard-capped at 94.
#
# WHY BETTER THAN THE OLD FORMULA:
#   Old: (sim*1.3 + 0.15)*100  → almost always ≥100%, meaningless.
#   New: actual skill coverage drives the score; cosine is supporting signal.
#
# LLM FALLBACK:
#   If LLM returns no skills at all, llm_score defaults to 0.0 (not 50.0).
#   This lets the cosine signal carry the score alone rather than injecting
#   30 artificial points from a failed LLM call.
# ─────────────────────────────────────────────────────────────────────────────

COSINE_FLOOR   = 0.50
COSINE_CEILING = 0.88
HARD_CAP       = 94.0   # perfect score is never auto-awarded

WEIGHT_COSINE  = 0.40
WEIGHT_LLM     = 0.60

# FIX: reduced from 0.4 → 0.2.
# At 0.4, a candidate with 0 matched skills but 10 minor gaps scored
# (10×0.4)/10×100 = 40 LLM pts → ~24 blended pts from zero real matches.
# At 0.2, minor gaps are genuinely partial credit, not near-matches.
MINOR_GAP_WEIGHT = 0.2


def _normalise_cosine(raw: float) -> float:
    """Map raw BGE cosine [FLOOR, CEILING] → [0, 100]."""
    if raw <= COSINE_FLOOR:
        return 0.0
    if raw >= COSINE_CEILING:
        return 100.0
    return round((raw - COSINE_FLOOR) / (COSINE_CEILING - COSINE_FLOOR) * 100, 2)


def _llm_skill_score(matched: list, minor: list, major: list) -> float:
    """
    Compute a 0–100 score from LLM-extracted skill lists.
      matched → 1.0 pt,  minor gap → 0.2 pt,  major gap → 0.0 pt

    FIX: Returns 0.0 (not 50.0) if LLM returned no skills at all.
    Reason: injecting 50 pts when the LLM fails pollutes the blend with
    30 artificial points (50 × 0.60 = 30). Returning 0.0 lets the cosine
    signal carry the score alone, which is more honest.
    """
    n_matched = len(matched)
    n_minor   = len(minor)
    n_major   = len(major)
    total     = n_matched + n_minor + n_major

    if total == 0:
        return 0.0  # LLM returned nothing — don't inject artificial score

    weighted_sum = (n_matched * 1.0) + (n_minor * MINOR_GAP_WEIGHT) + (n_major * 0.0)
    return round((weighted_sum / total) * 100, 2)


def _blend(cosine_score: float, llm_score: float) -> float:
    """Blend the two signals and apply the hard cap."""
    blended = (cosine_score * WEIGHT_COSINE) + (llm_score * WEIGHT_LLM)
    return round(min(blended, HARD_CAP), 2)


def _display_semantic(raw: float) -> float:
    """
    Re-map raw BGE cosine → 0.0–1.0 for the gauge display.
    raw=0.50 → 0.0  (no meaningful match)
    raw=0.69 → ~0.5
    raw=0.88 → 1.0
    Without this, the gauge shows 0.82 as "82%" even for weak matches.
    """
    if raw <= COSINE_FLOOR:
        return 0.0
    if raw >= COSINE_CEILING:
        return 1.0
    return round((raw - COSINE_FLOOR) / (COSINE_CEILING - COSINE_FLOOR), 4)


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def score_fitment_logic(candidate_id: str, force_rescore: bool = False):
    candidate = candidates_collection.find_one({"candidate_id": candidate_id})
    if not candidate:
        return None

    # Return cached result unless caller wants a fresh score
    if "results" in candidate and not force_rescore:
        return candidate["results"]

    role_id   = candidate["applied_role_id"]
    resume_id = int(candidate_id.replace("CND-", ""))

    resume_vector = get_vector_by_id(RESUME_COLLECTION, resume_id)
    jd_vector     = get_vector_by_id(JD_COLLECTION, int(role_id))

    # FIX: log the specific reason for vector miss instead of silently returning None.
    if resume_vector is None or jd_vector is None:
        missing = []
        if resume_vector is None:
            missing.append(f"resume vector (id={resume_id})")
        if jd_vector is None:
            missing.append(f"JD vector (role_id={role_id})")
        print(f"⚠️  score_fitment_logic: missing {' and '.join(missing)} for {candidate_id}")
        return None

    raw_cosine   = compute_cosine_similarity(resume_vector, jd_vector)
    cosine_score = _normalise_cosine(raw_cosine)

    jd_doc = roles_collection.find_one({"role_id": role_id})
    if not jd_doc:
        print(f"⚠️  score_fitment_logic: role {role_id} not found in roles_collection")
        return None

    jd_text     = jd_doc["job_description"]
    resume_text = candidate["resume_text"]

    llm_analysis = get_cleaned_fitment_analysis(jd_text, resume_text)

    # Derive LLM score from actual skill lists Mistral returned
    matched = llm_analysis.get("matched_skills", [])
    minor   = llm_analysis.get("gap_analysis", {}).get("minor", [])
    major   = llm_analysis.get("gap_analysis", {}).get("major", [])

    llm_score     = _llm_skill_score(matched, minor, major)
    fitment_score = _blend(cosine_score, llm_score)
    semantic_disp = _display_semantic(raw_cosine)

    print(
        f"📊 Fitment [{candidate_id}] → "
        f"raw_cos={raw_cosine:.4f}  cos_norm={cosine_score:.1f}  "
        f"llm={llm_score:.1f}  blend={fitment_score:.1f}"
    )

    result = {
        "candidate_id":        candidate_id,
        "applied_role_id":     role_id,
        "fitment_score":       fitment_score,   # blended, 0–94
        "semantic_similarity": semantic_disp,   # normalised 0.0–1.0 for gauge
        # debug fields — stored in DB, not shown in UI
        "raw_cosine":          round(raw_cosine, 4),
        "cosine_component":    round(cosine_score, 2),
        "llm_component":       round(llm_score, 2),
        **llm_analysis
    }

    result_to_store = result.copy()
    result_to_store["scored_at"] = datetime.now()

    candidates_collection.update_one(
        {"candidate_id": candidate_id},
        {"$set": {"results": result_to_store}}
    )

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Vector helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_vector_by_id(collection, id):
    result = client.retrieve(
        collection_name=collection,
        ids=[id],
        with_vectors=True
    )
    if result and len(result) > 0 and result[0].vector:
        return np.array(result[0].vector).reshape(1, -1)
    return None


def compute_cosine_similarity(v1, v2):
    return float(cosine_similarity(v1, v2)[0][0])


# ─────────────────────────────────────────────────────────────────────────────
# Resume text preparation for LLM
#
# OLD APPROACH (broken):
#   Ranked chunks by cosine + keyword overlap against the JD. For an MBA
#   resume, generic words like "management", "strategy", "project", "team"
#   overlapped heavily with JD text → wrong chunks got boosted → LLM never
#   saw "no Python here" → hallucinated matches.
#
# NEW APPROACH:
#   Send ALL chunks in section order with their section labels intact.
#   The two-pass prompt handles a full resume — it extracts skills itself
#   in Pass 1. Section labels ("Skills:", "Experience:") give the LLM
#   critical context about what it is reading.
# ─────────────────────────────────────────────────────────────────────────────

MAX_RESUME_CHARS = 6000   # leaves room for JD + prompt within 8192-token ctx


def prepare_resume_for_llm(resume_text: str) -> str:
    """
    Return the full resume structured with section labels,
    truncated only if it exceeds the context window limit.
    """
    chunks = split_resume_into_chunks(resume_text)

    if not chunks:
        return resume_text[:MAX_RESUME_CHARS]

    full_text = "\n\n".join(chunks)

    if len(full_text) <= MAX_RESUME_CHARS:
        return full_text

    # Truncate: keep as many complete chunks as fit, trim the last one
    result, total = [], 0
    for chunk in chunks:
        if total + len(chunk) + 2 <= MAX_RESUME_CHARS:
            result.append(chunk)
            total += len(chunk) + 2
        else:
            remaining = MAX_RESUME_CHARS - total
            if remaining > 100:
                result.append(chunk[:remaining] + "…")
            break

    print(f"⚠️  Resume truncated to {MAX_RESUME_CHARS} chars for LLM context.")
    return "\n\n".join(result)


# ─────────────────────────────────────────────────────────────────────────────
# LLM analysis & output cleaning
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Grounding layer — validate every LLM skill against the actual resume
#
# WHY (fixes hallucinated matches AND false gaps like "C/C++", "SQL"):
#   llama3.1:8b does literal set-difference and gets it wrong both ways:
#     • claims skills are matched that aren't in the resume (hallucination)
#     • puts skills in major/minor gaps that ARE in the resume (false gap)
#   This layer re-derives ground truth from the resume itself using the same
#   tokenizer + alias map the ATS score uses, then:
#     • drops matched skills not actually present  (kills hallucination)
#     • rescues gap skills that ARE present → moves them to matched
#   Because suggestions are filtered to gaps-only, vague advice on skills the
#   candidate already has disappears automatically once those skills are rescued.
#
#   Token-level robustness: "C/C++" and "C++" both normalize to {"c++"};
#   "scikit-learn"/"sklearn", "k8s"/"kubernetes", "js"/"javascript", etc. are
#   unified via ALIASES — so present skills stop being reported as gaps.
# ─────────────────────────────────────────────────────────────────────────────

# alias form → canonical form (e.g. "k8s" → "kubernetes", "js" → "javascript")
_ALIAS_TO_CANON = {}
for _canon, _variants in ALIASES.items():
    _ALIAS_TO_CANON[_canon] = _canon
    for _v in _variants:
        _ALIAS_TO_CANON[_v] = _canon


def _canon_tok(tok: str) -> str:
    return _ALIAS_TO_CANON.get(tok, tok)


def _resume_token_set(resume_text: str) -> set:
    """Canonical set of skill tokens (unigrams + skill bigrams) present in the
    resume. Uses the ATS normalizer (strips HTML, de-merges glued words,
    lowercases) so it sees the same clean tokens the ATS score does."""
    norm = _normalize(resume_text)
    bigrams = _extract_bigrams(norm)                 # Counter of underscore bigrams
    remainder = _remove_bigrams_from_text(norm)
    unigrams = _tokenize_unigrams(remainder)
    toks = set(unigrams) | set(bigrams.keys())
    return {_canon_tok(t) for t in toks}


def _skill_present(skill: str, resume_canon: set) -> bool:
    """True iff every meaningful token of `skill` is present in the resume
    (alias-aware). Multi-word skills require all their tokens; this avoids
    crediting 'AWS Lambda' when only 'AWS' appears."""
    norm = _normalize(skill)
    bigrams = _extract_bigrams(norm)
    remainder = _remove_bigrams_from_text(norm)
    unigrams = _tokenize_unigrams(remainder)
    cand = set(unigrams) | set(bigrams.keys())
    if not cand:
        return False
    for t in cand:
        ct = _canon_tok(t)
        forms = {ct} | set(ALIASES.get(ct, []))
        forms = {_canon_tok(f) for f in forms} | {ct}
        if not (forms & resume_canon):
            return False
    return True


def _dedup_by_canon(skills: list) -> list:
    seen, out = set(), []
    for s in skills:
        key = _normalize(str(s)).strip()
        if key and key not in seen:
            seen.add(key)
            out.append(s)
    return out


def ground_fitment_against_resume(cleaned: dict, resume_text: str) -> dict:
    """Post-process a cleaned LLM analysis against the real resume tokens.
    Drops hallucinated matches; rescues present-but-gapped skills into matched;
    re-filters suggestions so they only address genuine gaps."""
    resume_canon = _resume_token_set(resume_text)
    if not resume_canon:
        # Nothing reliable to ground against — leave the LLM output untouched.
        return cleaned

    matched = cleaned.get("matched_skills", [])
    minor   = cleaned.get("gap_analysis", {}).get("minor", [])
    major   = cleaned.get("gap_analysis", {}).get("major", [])

    grounded_matched = [s for s in matched if _skill_present(s, resume_canon)]
    dropped = [s for s in matched if s not in grounded_matched]

    true_minor, true_major, rescued = [], [], []
    for s in minor:
        (rescued if _skill_present(s, resume_canon) else true_minor).append(s)
    for s in major:
        (rescued if _skill_present(s, resume_canon) else true_major).append(s)

    final_matched = _dedup_by_canon(grounded_matched + rescued)

    # Re-filter suggestions to genuine gaps only.
    gap_keys = {_normalize(str(s)).strip() for s in (true_minor + true_major)}
    sugg = cleaned.get("suggestions", {})

    skills_to_add = [s for s in sugg.get("skills_to_add", [])
                     if _normalize(str(s)).strip() in gap_keys]

    learning_resources = []
    for res in sugg.get("learning_resources", []):
        name = res.get("skill", "") if isinstance(res, dict) else ""
        if name and _normalize(name).strip() in gap_keys:
            learning_resources.append(res)
    if gap_keys and not learning_resources:
        learning_resources = [{
            "skill": "Core Technical Skills",
            "resource": "https://www.google.com/search?q=best+technical+courses+online"
        }]

    if dropped or rescued:
        print(f"🛠️  Grounding → dropped {len(dropped)} hallucinated match(es), "
              f"rescued {len(rescued)} false gap(s) into matched.")

    return {
        "gap_analysis": {"minor": sorted(true_minor), "major": sorted(true_major)},
        "suggestions": {
            "resume_improvements": sugg.get("resume_improvements", ""),
            "skills_to_add":       sorted(skills_to_add),
            "learning_resources":  learning_resources,
        },
        "matched_skills": sorted(final_matched),
    }


def get_cleaned_fitment_analysis(jd_text, resume_text):
    # Clean both inputs BEFORE the LLM sees them:
    #   • JD comes from the WYSIWYG editor as HTML — strip tags so the model
    #     isn't reading <p>/<li>/&nbsp; markup instead of skills.
    #   • Resume from pdfplumber/fitz often has glued words (PythonSQLC++);
    #     _split_merged de-merges them WITHOUT destroying newlines (so section
    #     labels survive), unlike clean_resume_text which collapses all space.
    jd_clean        = _strip_html(jd_text)
    resume_clean    = _split_merged(_strip_html(resume_text))

    prepared_resume = prepare_resume_for_llm(resume_clean)
    prompt          = build_prompt(jd_clean, prepared_resume)
    raw_output      = call_fitment_llm(prompt, max_tokens=2000)

    if not raw_output:
        return empty_fitment_output()

    parsed = None
    if isinstance(raw_output, dict):
        parsed = raw_output
    elif isinstance(raw_output, str):
        try:
            json_match = re.search(r"\{[\s\S]*\}", raw_output)
            if json_match:
                parsed = json.loads(json_match.group())
        except Exception:
            return empty_fitment_output()

    if not parsed:
        return empty_fitment_output()

    cleaned = clean_llm_gap_output(parsed)
    # Ground against the real resume: kill hallucinated matches, rescue
    # present-but-gapped skills (C/C++, SQL, etc.) into matched.
    return ground_fitment_against_resume(cleaned, resume_clean)


def clean_llm_gap_output(raw_output):
    def normalize_list(items):
        if not isinstance(items, list):
            return []
        return [item.get("skill", "") if isinstance(item, dict) else str(item) for item in items]

    def canonicalize(skill):
        return (
            str(skill).strip().lower()
            .replace(" or similar", "").replace("basic knowledge of", "")
            .replace("familiarity with", "").replace("understanding of", "")
            .replace("experience in", "").replace("advanced", "")
            .replace("basics", "").replace("(", "").replace(")", "").strip()
        )

    def dedup_skills(skill_list):
        seen, cleaned = set(), []
        for skill in skill_list:
            canon = canonicalize(skill)
            if canon and canon not in seen:
                seen.add(canon)
                cleaned.append(skill)
        return sorted(cleaned)

    matched_skills = dedup_skills(normalize_list(raw_output.get("matched_skills", [])))
    gap_analysis   = raw_output.get("gap_analysis", {})
    suggestions    = raw_output.get("suggestions", {})

    minor_raw = dedup_skills(normalize_list(gap_analysis.get("minor", [])))
    major_raw = dedup_skills(normalize_list(gap_analysis.get("major", [])))

    # ── ENFORCE MUTUAL EXCLUSIVITY ────────────────────────────────────────────
    # Even if the LLM violates the prompt rules and puts a skill in both
    # matched AND gaps, we fix it here: matched takes priority, gaps are cleaned.
    matched_canons = {canonicalize(s) for s in matched_skills}
    minor_raw = [s for s in minor_raw if canonicalize(s) not in matched_canons]
    major_raw = [s for s in major_raw if canonicalize(s) not in matched_canons]

    # gap_canons for validating skills_to_add
    gap_canons = {canonicalize(s) for s in minor_raw + major_raw}

    # skills_to_add must ONLY contain gap skills — strip any matched ones
    skills_to_add_raw = dedup_skills(normalize_list(suggestions.get("skills_to_add", [])))
    skills_to_add = [s for s in skills_to_add_raw if canonicalize(s) not in matched_canons]

    # learning_resources must ONLY address gap skills — strip matched ones
    learning_resources_raw = suggestions.get("learning_resources", [])
    final_resources = []

    if not isinstance(learning_resources_raw, list) or not learning_resources_raw:
        if gap_canons:
            final_resources = [{
                "skill":    "Core Technical Skills",
                "resource": "https://www.google.com/search?q=best+technical+courses+online"
            }]
    else:
        for res in learning_resources_raw:
            skill_name    = res.get("skill", "")
            if not skill_name:
                continue
            if canonicalize(skill_name) in matched_canons:
                continue
            original_link = str(res.get("resource", res.get("url", "")))
            if "http" not in original_link or " " in original_link or len(original_link) < 10:
                search_query = skill_name.replace(" ", "+")
                resource_url = f"https://www.google.com/search?q={search_query}+course+tutorial"
            else:
                resource_url = original_link
            final_resources.append({"skill": skill_name, "resource": resource_url})

    resume_improvements = suggestions.get("resume_improvements", "")
    if isinstance(resume_improvements, list):
        resume_improvements = " ".join(resume_improvements)

    print(f"✅ LLM output cleaned — matched: {len(matched_skills)}, "
          f"minor gaps: {len(minor_raw)}, major gaps: {len(major_raw)}")

    return {
        "gap_analysis": {"minor": minor_raw, "major": major_raw},
        "suggestions": {
            "resume_improvements": resume_improvements,
            "skills_to_add":       skills_to_add,
            "learning_resources":  final_resources
        },
        "matched_skills": matched_skills
    }


def empty_fitment_output():
    return {
        "gap_analysis": {"minor": [], "major": []},
        "suggestions": {
            "resume_improvements": "",
            "skills_to_add":       [],
            "learning_resources":  []
        },
        "matched_skills": []
    }
