from datetime import datetime
from services.mongo_service import candidates_collection, roles_collection
from services.qdrant_service import client, RESUME_COLLECTION, JD_COLLECTION
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
from services.resume_segmenter import split_resume_into_chunks
from services.ollama_utils import call_fitment_llm, build_prompt
import numpy as np
import json
import re
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"
model = SentenceTransformer("BAAI/bge-large-en-v1.5", device=device)
model.max_seq_length = 512

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
#        minor gap      → 0.4 pt  (partial knowledge)
#        major gap      → 0.0 pt  (missing entirely)
#      score = weighted_sum / total_skills × 100
#
#   Final = (cosine × 0.40) + (llm × 0.60),  hard-capped at 94.
#
# WHY BETTER THAN THE OLD FORMULA:
#   Old: (sim*1.3 + 0.15)*100  → almost always ≥100%, meaningless.
#   New: actual skill coverage drives the score; cosine is supporting signal.
# ─────────────────────────────────────────────────────────────────────────────

COSINE_FLOOR   = 0.50
COSINE_CEILING = 0.88
HARD_CAP       = 94.0   # perfect score is never auto-awarded

WEIGHT_COSINE  = 0.40
WEIGHT_LLM     = 0.60


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
      matched → 1.0 pt,  minor gap → 0.4 pt,  major gap → 0.0 pt
    Returns 50.0 if LLM returned no skills at all (neutral fallback).
    """
    n_matched = len(matched)
    n_minor   = len(minor)
    n_major   = len(major)
    total     = n_matched + n_minor + n_major

    if total == 0:
        return 50.0  # neutral — LLM returned nothing useful

    weighted_sum = (n_matched * 1.0) + (n_minor * 0.4) + (n_major * 0.0)
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

    if resume_vector is None or jd_vector is None:
        return None

    raw_cosine   = compute_cosine_similarity(resume_vector, jd_vector)
    cosine_score = _normalise_cosine(raw_cosine)

    jd_doc = roles_collection.find_one({"role_id": role_id})
    if not jd_doc:
        return None

    jd_text     = jd_doc["job_description"]
    resume_text = candidate["resume_text"]

    focused_resume = extract_top_relevant_chunks(jd_text, resume_text)
    llm_analysis   = get_cleaned_fitment_analysis(jd_text, focused_resume)

    # Derive LLM score from actual skill lists Mistral returned
    matched = llm_analysis.get("matched_skills", [])
    minor   = llm_analysis.get("gap_analysis", {}).get("minor", [])
    major   = llm_analysis.get("gap_analysis", {}).get("major", [])

    llm_score     = _llm_skill_score(matched, minor, major)
    fitment_score = _blend(cosine_score, llm_score)
    semantic_disp = _display_semantic(raw_cosine)

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
# Resume chunk extraction (logic was correct — kept unchanged)
# ─────────────────────────────────────────────────────────────────────────────

def extract_top_relevant_chunks(jd_text, resume_text, min_percent=0.25, min_coverage_chars=1500):
    jd_vector     = model.encode(jd_text).reshape(1, -1)
    resume_chunks = split_resume_into_chunks(resume_text)
    jd_keywords   = set([w.lower() for w in jd_text.split() if len(w) > 2])

    chunk_scores = []
    for chunk in resume_chunks:
        chunk_vec       = model.encode(chunk).reshape(1, -1)
        score           = compute_cosine_similarity(chunk_vec, jd_vector)
        keyword_overlap = sum(1 for word in jd_keywords if word in chunk.lower())
        bonus           = 0.05 * min(keyword_overlap, 4)
        boosted_score   = min(score + bonus, 1.0)
        chunk_scores.append((chunk, boosted_score))

    top_chunks      = sorted(chunk_scores, key=lambda x: x[1], reverse=True)
    threshold_chars = max(min_coverage_chars, int(len(resume_text) * min_percent))

    selected, accumulated = [], 0
    for chunk, _ in top_chunks:
        selected.append(chunk)
        accumulated += len(chunk)
        if accumulated >= threshold_chars or len(selected) >= 8:
            break

    return "\n\n".join(selected)


# ─────────────────────────────────────────────────────────────────────────────
# LLM analysis & output cleaning (logic was correct — kept unchanged)
# ─────────────────────────────────────────────────────────────────────────────

def get_cleaned_fitment_analysis(jd_text, resume_text):
    prompt     = build_prompt(jd_text, resume_text)
    raw_output = call_fitment_llm(prompt, max_tokens=1500)

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

    return clean_llm_gap_output(parsed)


def clean_llm_gap_output(raw_output):
    def normalize_list(items):
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

    minor_raw     = dedup_skills(normalize_list(gap_analysis.get("minor", [])))
    major_raw     = dedup_skills(normalize_list(gap_analysis.get("major", [])))
    skills_to_add = dedup_skills(normalize_list(suggestions.get("skills_to_add", [])))

    learning_resources_raw = suggestions.get("learning_resources", [])
    final_resources = []

    if not isinstance(learning_resources_raw, list) or not learning_resources_raw:
        final_resources = [{
            "skill":    "Core Technology Stack",
            "resource": "https://www.google.com/search?q=best+technical+courses+online"
        }]
    else:
        for res in learning_resources_raw:
            skill_name    = res.get("skill", "Technology")
            original_link = str(res.get("resource", res.get("url", "")))
            if "http" not in original_link or " " in original_link or len(original_link) < 10:
                search_query = skill_name.replace(" ", "+")
                resource_url = f"https://www.google.com/search?q={search_query}+best+course+tutorial+documentation"
            else:
                resource_url = original_link
            final_resources.append({"skill": skill_name, "resource": resource_url})

    resume_improvements = suggestions.get("resume_improvements", "")
    if isinstance(resume_improvements, list):
        resume_improvements = " ".join(resume_improvements)

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