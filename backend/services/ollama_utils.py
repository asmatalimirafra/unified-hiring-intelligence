# import requests
# import re

# # Ollama API endpoint
# OLLAMA_BASE_URL = "http://localhost:11434/api/generate"

# # Small local model for speed
# MODEL = "llama3.1:8b"


# def call_fitment_llm(prompt: str, max_tokens: int = 1500) -> str:
#     """
#     Calls Ollama local LLM and returns the raw text response.
#     JSON parsing will be handled later in fitment_service.py.
#     """

#     try:
#         response = requests.post(
#             OLLAMA_BASE_URL,
#             json={
#                 "model": MODEL,
#                 "prompt": prompt,
#                 "stream": False,
#                 "options": {
#                     "num_predict": max_tokens,
#                     "temperature": 0.0,
#                     "num_ctx": 4096
#                 }
#             },
#             timeout=300
#         )

#         if response.status_code != 200:
#             print("❌ Ollama returned:", response.status_code)
#             return ""

#         data = response.json()

#         raw_output = data.get("response", "").strip()

#         # Remove markdown formatting if LLM adds it
#         raw_output = re.sub(r'^```json\s*|\s*```$', '', raw_output, flags=re.MULTILINE)

#         return raw_output

#     except Exception as e:
#         print("❌ LLM call failed:", e)
#         return ""


# def build_prompt(jd_text: str, resume_text: str) -> str:
#     """
#     Builds the prompt for candidate fitment analysis.
#     """

#     return f"""
# You are a strict hiring analysis assistant.

# TASK:
# Compare the Job Description and Candidate Resume.

# Rules:
# 1. Only count a skill as matched if it appears explicitly in the resume.
# 2. If a JD skill is missing from the resume, classify it as a gap.
# 3. Skills mentioned in projects, work experience, or responsibilities count.
# 4. Do NOT guess skills.

# Return ONLY valid JSON with this structure:

# {{
#   "matched_skills": [],
#   "gap_analysis": {{
#     "minor": [],
#     "major": []
#   }},
#   "suggestions": {{
#       "resume_improvements": "specific advice",
#       "skills_to_add": [],
#       "learning_resources": [
#         {{
#           "skill": "skill name",
#           "resource": "learning platform or link"
#         }}
#       ]
#   }}
# }}

# JOB DESCRIPTION:
# {jd_text}

# CANDIDATE RESUME:
# {resume_text}

# Respond ONLY with JSON.
# """.strip()


# def build_aggregator_prompt(average_scores, combined_comments):
#     """
#     Prompt for interview aggregation verdict.
#     """

#     return f"""
# You are an interview evaluation assistant.

# Analyze the following interview scores and comments.

# Return ONLY valid JSON with keys:
# - verdict
# - strengths
# - weaknesses

# Example:
# {{
#  "verdict": "Hire",
#  "strengths": [],
#  "weaknesses": []
# }}

# Scores:
# Communication: {average_scores['communication']}
# Problem Solving: {average_scores['problem_solving']}
# Domain Knowledge: {average_scores['domain_knowledge']}
# Overall Average: {average_scores['overall_average']}

# Comments:
# {combined_comments}

# Return ONLY JSON.
# """.strip()

import requests
import re

# Ollama API endpoint
OLLAMA_BASE_URL = "http://localhost:11434/api/generate"

# Recommended model for better reasoning
MODEL = "llama3.1:8b"

def call_fitment_llm(prompt: str, max_tokens: int = 1500) -> str:
    try:
        response = requests.post(
            OLLAMA_BASE_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",  # ✅ Forces the model to respond in JSON only
                "options": {
                    "num_predict": max_tokens,
                    "temperature": 0.0,
                    "num_ctx": 6144     # ✅ Increased context for JD + Resume
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
    Builds a high-precision prompt with explicit factual verification.
    """
    return f"""
You are a highly logical and strict Recruitment Analyst. 
Compare the provided Job Description (JD) and Candidate Resume with 100% factual accuracy.

**INSTRUCTION: PLEASE SEE RESUMES DATA CORRECTLY.**
Before categorizing a skill as a "Gap," you must search the entire resume (projects, skills section, and work history) to ensure it is truly missing.

CRITICAL LOGIC RULES:
1. **NO OVERLAP (MUTUAL EXCLUSIVITY):** If a skill (e.g., SQL, Python, AWS) is mentioned ANYWHERE in the resume, it MUST be in 'matched_skills'. It is STRICTLY FORBIDDEN from appearing in 'gap_analysis' or 'skills_to_add'.
2. **SYNONYM AWARENESS:** If the JD asks for "SQL" and the resume mentions "PostgreSQL," "MySQL," or "Database querying," this is a MATCH. Do not list it as a gap.
3. **DEFINITION OF MATCHED:** Only match a skill if it is explicitly stated or clearly demonstrated in the resume.
4. **DEFINITION OF GAP:** Only list a skill as a gap if it is a CORE requirement in the JD and is completely absent from the resume.
5. **SUGGESTIONS:** 'skills_to_add' and 'learning_resources' must ONLY address the skills identified in the 'gap_analysis'. Do not suggest learning things the candidate already knows.

Return ONLY valid JSON with this exact structure:

{{
  "matched_skills": ["Skill 1", "Skill 2"],
  "gap_analysis": {{
    "minor": ["Missing secondary tool/skill"],
    "major": ["Missing core requirement"]
  }},
  "suggestions": {{
      "resume_improvements": "Actionable advice to better highlight existing skills",
      "skills_to_add": ["Skill from gap_analysis only"],
      "learning_resources": [
        {{
          "skill": "Skill from gap_analysis",
          "resource": "Specific platform or course name"
        }}
      ]
  }}
}}

JOB DESCRIPTION:
{jd_text}

CANDIDATE RESUME:
{resume_text}

Respond ONLY with valid JSON.
""".strip()

def build_aggregator_prompt(average_scores, combined_comments):
    # (Kept as is, but added Respond ONLY with JSON for safety)
    return f"""
You are an interview evaluation assistant. Analyze the scores and comments.
Return ONLY valid JSON.

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
 "strengths": [],
 "weaknesses": []
}}
""".strip()