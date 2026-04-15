from datetime import datetime
from services.mongo_service import candidates_collection, roles_collection
from services.qdrant_service import client, RESUME_COLLECTION, JD_COLLECTION
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
from services.resume_segmenter import split_resume_into_chunks
from services.ollama_utils import call_fitment_llm, build_prompt
import numpy as np
import time
import json
import re
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"
model = SentenceTransformer("BAAI/bge-large-en-v1.5", device=device)
model.max_seq_length = 512

# ─────────────────────────────────────────────────────────────────────────────
# CALIBRATION CONSTANTS  (tuned for BAAI/bge-large-en-v1.5)
#
# BGE cosine scores for resume↔JD pairs in practice:
#   ~0.50–0.58  →  poor match   (different domain entirely)
#   ~0.58–0.68  →  weak match   (some overlap, many gaps)
#   ~0.68–0.76  →  moderate     (relevant background, missing skills)
#   ~0.76–0.83  →  good match   (solid fit, minor gaps)
#   ~0.83–0.88  →  strong match (very relevant, small gaps remain)
#   >0.88       →  near-perfect (rare; almost never truly 100%)
#
# We map this [FLOOR, CEILING] range → [0%, MAX_SCORE%]
# MAX_SCORE is capped at 95 so no one ever hits 100% automatically.
# ─────────────────────────────────────────────────────────────────────────────
SIMILARITY_FLOOR   = 0.50   # scores at or below this → 0% fitment
SIMILARITY_CEILING = 0.90   # scores at or above this → MAX_SCORE fitment
MAX_FITMENT_SCORE  = 95.0   # practical ceiling — perfect score is never auto-awarded
MIN_FITMENT_SCORE  = 0.0


def normalize_similarity_to_fitment(sim_score: float) -> float:
    """
    Maps raw BGE cosine similarity → a practical fitment percentage.

    Formula:  linear interpolation between FLOOR and CEILING,
              then scaled to [MIN_FITMENT_SCORE, MAX_FITMENT_SCORE].

    Examples (with current constants):
        sim=0.50  →   0%
        sim=0.60  →  25%
        sim=0.68  →  45%
        sim=0.74  →  60%
        sim=0.78  →  70%
        sim=0.82  →  80%
        sim=0.86  →  90%
        sim=0.90  →  95%   (hard ceiling)
    """
    if sim_score <= SIMILARITY_FLOOR:
        return MIN_FITMENT_SCORE
    if sim_score >= SIMILARITY_CEILING:
        return MAX_FITMENT_SCORE

    normalized = (sim_score - SIMILARITY_FLOOR) / (SIMILARITY_CEILING - SIMILARITY_FLOOR)
    fitment = normalized * MAX_FITMENT_SCORE

    return round(fitment, 2)


def normalize_semantic_display(sim_score: float) -> float:
    """
    Maps raw BGE cosine similarity → a display-friendly semantic similarity %.

    The raw value (e.g. 0.82) is honest but misleading on a 0–100% gauge
    because 0.50 already represents "some relation". This re-maps it so:
        0.50  →  0%
        0.70  →  50%
        0.90  →  100%

    This makes the gauge actually meaningful to a human reader.
    """
    if sim_score <= SIMILARITY_FLOOR:
        return 0.0
    if sim_score >= SIMILARITY_CEILING:
        return 1.0

    normalized = (sim_score - SIMILARITY_FLOOR) / (SIMILARITY_CEILING - SIMILARITY_FLOOR)
    return round(normalized, 4)


def score_fitment_logic(candidate_id: str, force_rescore: bool = False):
    candidate = candidates_collection.find_one({"candidate_id": candidate_id})
    if not candidate:
        return None

    # Return cached result unless force_rescore is requested
    if "results" in candidate and not force_rescore:
        return candidate["results"]

    role_id = candidate["applied_role_id"]
    resume_id = int(candidate_id.replace("CND-", ""))

    resume_vector = get_vector_by_id(RESUME_COLLECTION, resume_id)
    jd_vector = get_vector_by_id(JD_COLLECTION, int(role_id))

    if resume_vector is None or jd_vector is None:
        return None

    raw_sim = compute_cosine_similarity(resume_vector, jd_vector)

    # ── NEW: use calibrated formulas instead of the old (sim*1.3+0.15)*100 ──
    fitment_percent        = normalize_similarity_to_fitment(raw_sim)
    semantic_display_score = normalize_semantic_display(raw_sim)

    jd_doc = roles_collection.find_one({"role_id": role_id})
    if not jd_doc:
        return None

    jd_text     = jd_doc["job_description"]
    resume_text = candidate["resume_text"]

    focused_resume = extract_top_relevant_chunks(jd_text, resume_text)
    llm_analysis   = get_cleaned_fitment_analysis(jd_text, focused_resume)

    result = {
        "candidate_id":        candidate_id,
        "applied_role_id":     role_id,
        "fitment_score":       fitment_percent,
        "semantic_similarity": semantic_display_score,   # normalised for display
        "raw_cosine":          round(raw_sim, 4),        # kept for debugging
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
# Helpers — unchanged from original
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

    top_chunks       = sorted(chunk_scores, key=lambda x: x[1], reverse=True)
    total_resume_chars = len(resume_text)
    threshold_chars  = max(min_coverage_chars, int(total_resume_chars * min_percent))

    selected    = []
    accumulated = 0
    for chunk, _ in top_chunks:
        selected.append(chunk)
        accumulated += len(chunk)
        if accumulated >= threshold_chars or len(selected) >= 8:
            break

    return "\n\n".join(selected)


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
        except:
            return empty_fitment_output()

    if not parsed:
        return empty_fitment_output()

    return clean_llm_gap_output(parsed)


def clean_llm_gap_output(raw_output):
    def normalize_list(items):
        cleaned = []
        for item in items:
            if isinstance(item, dict):
                cleaned.append(item.get("skill", ""))
            else:
                cleaned.append(str(item))
        return cleaned

    def canonicalize(skill):
        return (
            str(skill).strip().lower()
            .replace(" or similar", "")
            .replace("basic knowledge of", "")
            .replace("familiarity with", "")
            .replace("understanding of", "")
            .replace("experience in", "")
            .replace("advanced", "")
            .replace("basics", "")
            .replace("(", "")
            .replace(")", "")
            .strip()
        )

    def dedup_skills(skill_list):
        seen    = set()
        cleaned = []
        for skill in skill_list:
            canon = canonicalize(skill)
            if canon and canon not in seen:
                seen.add(canon)
                cleaned.append(skill)
        return sorted(cleaned)

    matched_skills = dedup_skills(normalize_list(raw_output.get("matched_skills", [])))
    gap_analysis   = raw_output.get("gap_analysis", {})
    suggestions    = raw_output.get("suggestions", {})

    minor_raw    = dedup_skills(normalize_list(gap_analysis.get("minor", [])))
    major_raw    = dedup_skills(normalize_list(gap_analysis.get("major", [])))
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
        "gap_analysis": {
            "minor": minor_raw,
            "major": major_raw
        },
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