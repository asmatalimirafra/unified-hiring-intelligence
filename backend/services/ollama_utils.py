import requests
import re

# Ollama API endpoint
OLLAMA_BASE_URL = "http://localhost:11434/api/generate"

# Small local model for speed
MODEL = "llama3.2:8b"


def call_fitment_llm(prompt: str, max_tokens: int = 1500) -> str:
    """
    Calls Ollama local LLM and returns the raw text response.
    JSON parsing will be handled later in fitment_service.py.
    """

    try:
        response = requests.post(
            OLLAMA_BASE_URL,
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": 0.0,
                    "num_ctx": 4096
                }
            },
            timeout=300
        )

        if response.status_code != 200:
            print("❌ Ollama returned:", response.status_code)
            return ""

        data = response.json()

        raw_output = data.get("response", "").strip()

        # Remove markdown formatting if LLM adds it
        raw_output = re.sub(r'^```json\s*|\s*```$', '', raw_output, flags=re.MULTILINE)

        return raw_output

    except Exception as e:
        print("❌ LLM call failed:", e)
        return ""


def build_prompt(jd_text: str, resume_text: str) -> str:
    """
    Builds the prompt for candidate fitment analysis.
    """

    return f"""
You are a strict hiring analysis assistant.

TASK:
Compare the Job Description and Candidate Resume.

Rules:
1. Only count a skill as matched if it appears explicitly in the resume.
2. If a JD skill is missing from the resume, classify it as a gap.
3. Skills mentioned in projects, work experience, or responsibilities count.
4. Do NOT guess skills.

Return ONLY valid JSON with this structure:

{{
  "matched_skills": [],
  "gap_analysis": {{
    "minor": [],
    "major": []
  }},
  "suggestions": {{
      "resume_improvements": "specific advice",
      "skills_to_add": [],
      "learning_resources": [
        {{
          "skill": "skill name",
          "resource": "learning platform or link"
        }}
      ]
  }}
}}

JOB DESCRIPTION:
{jd_text}

CANDIDATE RESUME:
{resume_text}

Respond ONLY with JSON.
""".strip()


def build_aggregator_prompt(average_scores, combined_comments):
    """
    Prompt for interview aggregation verdict.
    """

    return f"""
You are an interview evaluation assistant.

Analyze the following interview scores and comments.

Return ONLY valid JSON with keys:
- verdict
- strengths
- weaknesses

Example:
{{
 "verdict": "Hire",
 "strengths": [],
 "weaknesses": []
}}

Scores:
Communication: {average_scores['communication']}
Problem Solving: {average_scores['problem_solving']}
Domain Knowledge: {average_scores['domain_knowledge']}
Overall Average: {average_scores['overall_average']}

Comments:
{combined_comments}

Return ONLY JSON.
""".strip()