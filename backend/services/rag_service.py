import json
import requests
import re
from collections import Counter
from sentence_transformers import SentenceTransformer
from services.mongo_service import candidates_collection
from services.qdrant_service import qdrant_client as client
import torch

from config import OLLAMA_GENERATE_URL as OLLAMA_URL, LLM_MODEL as CHAT_MODEL, EMBEDDING_MODEL

device = "cuda" if torch.cuda.is_available() else "cpu"
embedder = SentenceTransformer(EMBEDDING_MODEL, device=device)
embedder.max_seq_length = 512

# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────
from config import QDRANT_URL, QDRANT_API_KEY, EMBEDDING_MODEL

# IMPORTANT: Ollama's default context window is small (~2048 tokens). Without
# this, stuffing several full resumes into the prompt overflows and is silently
# truncated — the model then "sees" only the first resume and miscounts /
# hallucinates. This is the same num_ctx the fitment path uses.
NUM_CTX = 8192

# Context budget for candidate Q&A — keeps the prompt within NUM_CTX.
MAX_SEMANTIC_CANDIDATES = 5      # how many resumes to retrieve for "who knows X"
MAX_RESUME_CHARS_SEMANTIC = 1800 # per-candidate cap when several are in context
MAX_RESUME_CHARS_SPECIFIC = 6000 # generous cap when answering about ONE candidate
MAX_LIST_ROWS = 100              # cap the deterministic "list all" output

# Projection for ALL candidate fetches — excludes the binary PDF blob.
_CANDIDATE_PROJECTION = {"_id": 0, "resume_file": 0}

# ─────────────────────────────────────────────────────────────────────────────
# Intent routing vocabulary
# ─────────────────────────────────────────────────────────────────────────────
_CANDIDATE_NOUNS = (
    "candidate", "candidates", "applicant", "applicants",
    "cv", "cvs", "resume", "resumes", "profile", "profiles",
)
_COUNT_CUES = ("how many", "number of", "count of", "total number", "how much")
_LIST_CUES  = ("list", "show all", "show me all", "show me the", "display",
               "names of", "name all", "who are", "give me all", "all candidates")
_SEARCH_CUES = (
    "who has", "who knows", "who can", "anyone with", "anyone who",
    "someone with", "people with", "candidates with", "find someone",
    "search for", "expertise in", "proficient in", "skilled in",
    "experience with", "experience in", "good at", "worked with",
    "familiar with", "best fit", "suitable for", "matches",
)

# Words that are NOT name evidence (stopwords + frequent words that double as
# names, so a general question never silently pulls up the wrong candidate —
# this is what fixes the old "Are" → "Karen" substring bug).
_COMMON_WORDS = {
    "the", "and", "for", "are", "was", "were", "with", "this", "that", "have",
    "has", "had", "not", "from", "you", "your", "yours", "will", "can", "could",
    "would", "should", "may", "our", "their", "its", "also", "all", "any", "but",
    "more", "than", "into", "over", "such", "been", "each", "which", "when",
    "they", "some", "who", "what", "how", "about", "other", "like", "just",
    "then", "there", "these", "those", "give", "show", "list", "tell", "find",
    "many", "much", "number", "total", "count", "display", "names", "name",
    "candidate", "candidates", "applicant", "applicants", "resume", "resumes",
    "profile", "profiles", "skill", "skills", "experience", "role", "roles",
    "please", "help", "want", "need", "looking", "good", "best", "know",
    "knows", "does", "did", "done", "make", "made", "draft", "write", "hello",
    "hey", "thanks", "thank", "okay", "sure", "yes", "company", "database",
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _normalise_mongo_id(raw_id) -> str:
    """Convert a Qdrant payload id (int/float/str like 4907 or 'CND-4907')
    into the canonical MongoDB form 'CND-XXXX'."""
    s = str(raw_id).strip()
    if s.upper().startswith("CND-"):
        return s
    digits = re.sub(r"[^\d]", "", s)
    return f"CND-{digits}" if digits else s


def _ollama_generate(prompt: str, stream: bool):
    """Single entry point to Ollama. Always sets num_ctx so the prompt isn't
    silently truncated. Returns a token generator (stream) or a string."""
    response = requests.post(
        OLLAMA_URL,
        json={
            "model": CHAT_MODEL,
            "prompt": prompt,
            "stream": stream,
            "options": {"num_ctx": NUM_CTX, "temperature": 0.3},
        },
        stream=stream,
        timeout=300,
    )
    if stream:
        def gen():
            for line in response.iter_lines():
                if line:
                    data = json.loads(line.decode())
                    yield data.get("response", "")
                    if data.get("done"):
                        break
        return gen()
    return response.json().get("response", "")


def _as_stream(text: str):
    """Wrap a deterministic answer as a one-chunk generator (for stream=True)."""
    def gen():
        yield text
    return gen()


def _query_tokens(text: str) -> set:
    toks = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z'\-]{2,}", text or "")}
    return toks - _COMMON_WORDS


def _resolve_named_candidate(text: str):
    """Find a candidate whose NAME appears as whole word(s) in `text`.
    Pushes filtering to MongoDB (scalable — returns only matching names, not
    the whole collection) then prefers a full-name match over a single token."""
    toks = list(_query_tokens(text))[:10]
    if not toks:
        return None

    pattern = r"\b(" + "|".join(re.escape(t) for t in toks) + r")\b"
    try:
        matches = list(candidates_collection.find(
            {"name": {"$regex": pattern, "$options": "i"}},
            {"name": 1, "candidate_id": 1, "_id": 0},
        ))
    except Exception as e:
        print(f"⚠️ name lookup failed: {e}")
        return None
    if not matches:
        return None

    tok_set = set(toks)
    best_single = None
    for c in matches:
        parts = {p.lower() for p in re.findall(r"[A-Za-z][A-Za-z'\-]{2,}", c.get("name", ""))}
        parts -= _COMMON_WORDS
        if not parts:
            continue
        if parts.issubset(tok_set):           # full name present → confident match
            return _fetch_candidate(c["candidate_id"])
        if parts & tok_set and best_single is None:
            best_single = c
    if best_single:
        return _fetch_candidate(best_single["candidate_id"])
    return None


def _fetch_candidate(candidate_id: str):
    return candidates_collection.find_one(
        {"candidate_id": _normalise_mongo_id(candidate_id)}, _CANDIDATE_PROJECTION
    )


def _block(doc: dict, cap: int) -> str:
    txt = (doc.get("resume_text") or "").strip()
    if len(txt) > cap:
        txt = txt[:cap] + " …[truncated]"
    return (f"CANDIDATE: {doc.get('name', 'Unknown')}\n"
            f"ROLE: {doc.get('applied_role', 'N/A')}\n"
            f"CANDIDATE_ID: {doc.get('candidate_id', 'N/A')}\n"
            f"RESUME:\n{txt}")


def _semantic_blocks(user_query: str, chat_history: list):
    """Vector search → batched $in fetch → budgeted context blocks (rank order)."""
    enriched = user_query
    if chat_history:
        recent = " ".join(m.get("text", "") for m in chat_history[-4:])
        enriched = f"{recent} {user_query}"

    query_vector = embedder.encode(enriched, normalize_embeddings=True).tolist()
    resp = client.query_points(
        collection_name="resumes",
        query=query_vector,
        limit=MAX_SEMANTIC_CANDIDATES,
        with_payload=True,
    )

    ordered_ids = []
    for hit in resp.points:
        raw = hit.payload.get("candidate_id")
        ordered_ids.append(_normalise_mongo_id(raw if raw is not None else hit.id))
    if not ordered_ids:
        return []

    docs = {d["candidate_id"]: d for d in candidates_collection.find(
        {"candidate_id": {"$in": ordered_ids}}, _CANDIDATE_PROJECTION
    )}
    blocks = []
    for cid in ordered_ids:                    # preserve similarity ranking
        doc = docs.get(cid)
        if doc:
            blocks.append(_block(doc, MAX_RESUME_CHARS_SEMANTIC))
    return blocks


# ─────────────────────────────────────────────────────────────────────────────
# Deterministic DB answers (NEVER go through the LLM → always exact)
# ─────────────────────────────────────────────────────────────────────────────
def _answer_count() -> str:
    total = candidates_collection.count_documents({})
    if total == 0:
        return "There are no candidates in the database yet."

    by_role = Counter()
    for c in candidates_collection.find({}, {"applied_role": 1, "_id": 0}):
        by_role[c.get("applied_role") or "Unspecified"] += 1

    lines = [f"There are currently {total} candidate(s) in the database."]
    if len(by_role) > 1:
        lines.append("\nBreakdown by role:")
        for i, (role, n) in enumerate(sorted(by_role.items(), key=lambda x: -x[1]), 1):
            lines.append(f"{i}. {role}: {n}")
    return "\n".join(lines)


def _answer_list() -> str:
    rows = list(candidates_collection.find(
        {}, {"name": 1, "applied_role": 1, "_id": 0}
    ).limit(MAX_LIST_ROWS + 1))
    if not rows:
        return "There are no candidates in the database yet."

    capped = rows[:MAX_LIST_ROWS]
    lines = ["Candidates in the database:"]
    for i, r in enumerate(capped, 1):
        lines.append(f"{i}. {r.get('name', 'Unknown')} — {r.get('applied_role', 'N/A')}")
    if len(rows) > MAX_LIST_ROWS:
        lines.append(f"\n…and more (showing the first {MAX_LIST_ROWS}).")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Intent router
# ─────────────────────────────────────────────────────────────────────────────
def _classify_intent(user_query: str, named_doc) -> str:
    q = (user_query or "").lower()
    has_noun  = any(re.search(rf"\b{n}\b", q) for n in _CANDIDATE_NOUNS)
    count_cue = any(c in q for c in _COUNT_CUES)
    list_cue  = any(c in q for c in _LIST_CUES)
    search_cue = any(c in q for c in _SEARCH_CUES)

    # COUNT / LIST require an explicit candidate noun → about the whole DB.
    if has_noun and count_cue:
        return "count"
    if has_noun and list_cue:
        return "list"
    # A named candidate that is NOT a whole-DB count/list → specific.
    if named_doc:
        return "specific"
    # Candidate search ("who knows CUDA", "candidates with React").
    if has_noun or search_cue:
        return "semantic"
    # Everything else → behave like a normal assistant, no retrieval.
    return "general"


# ─────────────────────────────────────────────────────────────────────────────
# Prompts
# ─────────────────────────────────────────────────────────────────────────────
def _general_prompt(user_query: str, history_text: str) -> str:
    return f"""You are a helpful, friendly HR assistant chatbot. Answer the user's
message conversationally. You can help with general HR work: drafting job
descriptions, suggesting interview questions, explaining concepts, and general
questions. Do NOT bring up specific candidates or any candidate database unless
the user explicitly asks about candidates.

CONVERSATION HISTORY:
{history_text or "No previous conversation."}

User: {user_query}
Assistant:"""


def _candidate_prompt(user_query: str, context: str, history_text: str) -> str:
    return f"""You are an HR assistant answering questions about job candidates.

STRICT RULES:
- Use ONLY the facts in CANDIDATE CONTEXT below. Do not invent skills,
  experience, projects, numbers, or names.
- If the answer is not in the context, say you don't have that information in
  the candidate records — do not guess.
- Stay on the candidate(s) discussed in recent messages unless the user clearly
  asks about someone new.
- When listing items, number them correctly: 1. 2. 3. (never repeat a number).

CANDIDATE CONTEXT:
{context}

CONVERSATION HISTORY:
{history_text or "No previous conversation."}

User: {user_query}
Assistant:"""


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point (signature unchanged — HR & interviewer chat both use this)
# ─────────────────────────────────────────────────────────────────────────────
def get_hr_chat_response(user_query: str, chat_history: list = None, stream: bool = False):
    try:
        chat_history = chat_history or []

        # Build conversation history string once.
        history_text = ""
        if chat_history:
            lines = []
            for msg in chat_history[-10:]:
                role = "User" if msg.get("sender") == "user" else "Assistant"
                lines.append(f"{role}: {msg.get('text', '')}")
            history_text = "\n".join(lines)

        # Resolve a named candidate from the current query, then recent history.
        named_doc = _resolve_named_candidate(user_query)
        if not named_doc:
            for past in reversed(chat_history):
                if past.get("sender") == "user":
                    named_doc = _resolve_named_candidate(past.get("text", ""))
                    if named_doc:
                        break

        intent = _classify_intent(user_query, named_doc)
        print(f"🤖 RAG intent: {intent}")

        # ── Deterministic DB answers — exact, no hallucination ────────────────
        if intent == "count":
            ans = _answer_count()
            return _as_stream(ans) if stream else ans
        if intent == "list":
            ans = _answer_list()
            return _as_stream(ans) if stream else ans

        # ── General chatbot — no retrieval ────────────────────────────────────
        if intent == "general":
            return _ollama_generate(_general_prompt(user_query, history_text), stream)

        # ── Candidate Q&A (specific or semantic) ──────────────────────────────
        if intent == "specific" and named_doc:
            context = _block(named_doc, MAX_RESUME_CHARS_SPECIFIC)
        else:  # semantic
            blocks = _semantic_blocks(user_query, chat_history)
            context = "\n---\n".join(blocks) if blocks else \
                "No matching candidates were found in the database."

        return _ollama_generate(_candidate_prompt(user_query, context, history_text), stream)

    except Exception as e:
        error_msg = f"Lion encountered an issue: {str(e)}"
        print(f"DEBUG ERROR: {error_msg}")

        return _as_stream(error_msg) if stream else error_msg
