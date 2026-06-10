import requests
import re

from config import OLLAMA_GENERATE_URL as OLLAMA_BASE_URL, LLM_MODEL as MODEL

# OLLAMA_BASE_URL = "http://localhost:11434/api/generate"
# MODEL = "llama3.1:8b"


def call_fitment_llm(prompt: str, max_tokens: int = 2000) -> str:
    try:
        response = requests.post(
            OLLAMA_BASE_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",   # forces valid JSON output
                "options": {
                    "num_predict": max_tokens,
                    "temperature": 0.0,   # fully deterministic
                    "num_ctx": 8192       # enough for full JD + full resume
                }
            },
            timeout=300
        )

        if response.status_code != 200:
            print("❌ Ollama returned:", response.status_code)
            return ""

        data = response.json()
        return data.get("response", "").strip()

    except Exception as e:
        print("❌ LLM call failed:", e)
        return ""


def build_prompt(jd_text: str, resume_text: str) -> str:
    """
    Two-pass chain-of-thought prompt.

    WHY TWO-PASS:
    Small models (llama3.1:8b) hallucinate when asked to compare and output
    simultaneously. Forcing the model to first extract what is literally in
    the resume (Pass 1), then compare that exact list against JD requirements
    (Pass 2), grounds every decision in explicit text evidence.

    The old prompt said "search the resume carefully before calling something
    a gap" — that caused over-generosity (model found vague word proximity
    and decided skills were present). The new prompt builds a verified list
    first, then does strict set-difference comparison.
    """
    return f"""You are a strict technical recruiter performing a factual skill audit.
You will work in two passes. Follow each step exactly.

════════════════════════════════════════
PASS 1 — EXTRACT CANDIDATE SKILLS FROM RESUME
════════════════════════════════════════
Read the RESUME TEXT below word by word.
List every technical skill, tool, framework, programming language, platform,
methodology, or domain knowledge that is EXPLICITLY written in the resume.

Rules for Pass 1:
- Include skills from ALL sections: Skills, Projects, Experience, Certifications.
- Do NOT infer or assume. If "data analysis" is written, list "data analysis".
  Do NOT convert it to "Python" or "SQL" unless those exact words appear.
- Soft skills (communication, leadership, teamwork) are NOT technical skills.
- Business skills (sales, marketing, negotiation, MBA, CRM, B2B) are NOT technical skills.
- If the resume contains NO technical skills at all, candidate_skills_found = []

════════════════════════════════════════
PASS 2 — COMPARE AGAINST JD REQUIREMENTS
════════════════════════════════════════
Now read the JD TEXT. Extract all required and preferred technical skills.

For each JD skill, check your Pass 1 candidate_skills_found list:
- Skill IS in candidate_skills_found (or direct synonym below) → matched_skills
- Skill is a CORE/REQUIRED JD requirement NOT in candidate_skills_found → gap_analysis.major
- Skill is PREFERRED/NICE-TO-HAVE NOT in candidate_skills_found → gap_analysis.minor

Permitted synonyms ONLY:
- "PostgreSQL", "MySQL", "SQLite" = "SQL"
- "GCP", "Azure" = "cloud platform"
- "git", "GitHub", "GitLab" = "version control"
- No other inferences are allowed.

════════════════════════════════════════
ABSOLUTE RULES — NEVER VIOLATE THESE
════════════════════════════════════════
1. A skill CANNOT appear in both matched_skills AND gap_analysis. Never. Ever.
2. skills_to_add must ONLY contain skills already in gap_analysis. Nothing else.
3. learning_resources must ONLY address gap_analysis skills. Nothing else.
4. If candidate_skills_found is empty [], then matched_skills MUST be [].
5. If the candidate has only an MBA/business/sales background and the JD requires
   Python, ML, Cloud, Docker, etc. — ALL those technical skills go into
   gap_analysis.major. matched_skills stays []. This is correct and expected.
6. Do NOT award credit for business skills like "data-driven decision making",
   "analytical mindset", "technology adoption" when JD asks for Python or SQL.
   Those are not the same thing.

════════════════════════════════════════
OUTPUT — Return ONLY this exact JSON
════════════════════════════════════════
{{
  "candidate_skills_found": ["exact skills extracted from resume in Pass 1"],
  "matched_skills": ["JD skills confirmed present in resume"],
  "gap_analysis": {{
    "major": ["Core JD requirements completely absent from resume"],
    "minor": ["Preferred JD skills absent from resume"]
  }},
  "suggestions": {{
    "resume_improvements": "Honest, specific advice. If the profile is a poor fit, say so clearly and suggest what the candidate needs to do.",
    "skills_to_add": ["Only skills from gap_analysis — nothing else"],
    "learning_resources": [
      {{
        "skill": "Skill name from gap_analysis",
        "resource": "Specific course or platform name (e.g. fast.ai, Coursera Deep Learning, AWS Training)"
      }}
    ]
  }}
}}

════════════════════════════════════════
RESUME TEXT:
════════════════════════════════════════
{resume_text}

════════════════════════════════════════
JD TEXT:
════════════════════════════════════════
{jd_text}

════════════════════════════════════════
Produce the JSON output now. Start with {{ and end with }}.
════════════════════════════════════════"""


def build_aggregator_prompt(average_scores, combined_comments):
    return f"""You are an interview evaluation assistant. Analyze the scores and comments.
Return ONLY valid JSON. No explanation outside the JSON.

Scores:
Communication: {average_scores['communication']}
Problem Solving: {average_scores['problem_solving']}
Domain Knowledge: {average_scores['domain_knowledge']}
Overall Average: {average_scores['overall_average']}

Comments:
{combined_comments}

Expected Format:
{{
  "verdict": "Hire/No Hire",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"]
}}"""