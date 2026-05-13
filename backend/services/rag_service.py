import json
import requests
import re
from sentence_transformers import SentenceTransformer
from services.mongo_service import candidates_collection
from services.qdrant_service import qdrant_client as client
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"
embedder = SentenceTransformer("BAAI/bge-large-en-v1.5", device=device)
embedder.max_seq_length = 512

# Projection used for ALL candidate fetches in this service.
# Excludes resume_file (binary PDF blob) — pulling it into RAM on every
# RAG call wastes memory and can silently corrupt the LLM prompt.
# resume_text (the extracted plain-text version) is all the LLM needs.
_CANDIDATE_PROJECTION = {"_id": 0, "resume_file": 0}


def _normalise_mongo_id(raw_id) -> str:
    """
    Safely convert any form of candidate ID coming from Qdrant payload
    into the canonical MongoDB format 'CND-XXXX'.

    Qdrant stores the numeric part as both the point ID and payload value
    (e.g. 4907). MongoDB stores 'CND-4907'. This function bridges the gap
    regardless of whether raw_id arrives as int, float, or string.
    """
    s = str(raw_id).strip()
    if s.upper().startswith("CND-"):
        return s  # already canonical
    # Strip any non-digit prefix/suffix just in case
    digits = re.sub(r"[^\d]", "", s)
    if digits:
        return f"CND-{digits}"
    return s  # fallback — let MongoDB miss gracefully


def get_hr_chat_response(user_query: str, chat_history: list = None, stream: bool = False):
    """
    Global RAG assistant — searches ALL candidates in the database.
    No hr_id filter: intentionally company-wide for scalability.

    user_query   : latest message from the user
    chat_history : list of {"sender": "user"|"bot", "text": "..."} dicts (oldest first)
    stream       : whether to stream tokens back
    """
    try:
        chat_history = chat_history or []

        # ── 1. Name-based candidate resolution ───────────────────────────────
        def safe_name_search(text: str):
            """
            Extract proper-noun tokens from text and match against ALL candidate
            names in MongoDB (no hr_id filter — global visibility).
            Returns the full candidate doc (minus binary blob) or None.
            """
            tokens = [w for w in re.findall(r'[A-Z][a-z]{2,}', text)]
            if not tokens:
                return None

            # Lightweight index scan — only name + id, no resume data
            all_candidates = list(candidates_collection.find(
                {},
                {"name": 1, "candidate_id": 1, "_id": 0}
            ))

            for token in tokens:
                token_lower = token.lower()
                for c in all_candidates:
                    if token_lower in c.get("name", "").lower():
                        # Fetch full doc but exclude binary resume_file
                        return candidates_collection.find_one(
                            {"candidate_id": c["candidate_id"]},
                            _CANDIDATE_PROJECTION
                        )
            return None

        # Try current query first, then walk back through history
        candidate = safe_name_search(user_query)
        if not candidate and chat_history:
            for past_msg in reversed(chat_history):
                candidate = safe_name_search(past_msg.get("text", ""))
                if candidate:
                    break

        context_blocks = []

        if candidate:
            context_blocks.append(
                f"CANDIDATE: {candidate.get('name')}\n"
                f"ROLE: {candidate.get('applied_role')}\n"
                f"RESUME: {candidate.get('resume_text', '')}"
            )
        else:
            # ── 2. Semantic vector search fallback ────────────────────────────
            # Enrich with recent history so the vector captures pronouns
            enriched_query = user_query
            if chat_history:
                recent = " ".join(m.get("text", "") for m in chat_history[-4:])
                enriched_query = f"{recent} {user_query}"

            query_vector = embedder.encode(enriched_query).tolist()
            qdrant_response = client.query_points(
                collection_name="resumes",
                query=query_vector,
                limit=8,
                with_payload=True
            )

            for hit in qdrant_response.points:
                # Payload stores the numeric candidate_id (e.g. 4907)
                # Point ID is also numeric. Normalise both to "CND-XXXX".
                raw_payload_id = hit.payload.get("candidate_id")
                mongo_id = _normalise_mongo_id(
                    raw_payload_id if raw_payload_id is not None else hit.id
                )

                doc = candidates_collection.find_one(
                    {"candidate_id": mongo_id},
                    _CANDIDATE_PROJECTION
                )
                if doc:
                    context_blocks.append(
                        f"CANDIDATE: {doc.get('name')}\n"
                        f"ROLE: {doc.get('applied_role')}\n"
                        f"RESUME: {doc.get('resume_text', '')}"
                    )

        final_context = (
            "\n---\n".join(context_blocks)
            if context_blocks
            else "No matching candidates found."
        )

        # ── 3. Conversation history for prompt ───────────────────────────────
        history_text = ""
        if chat_history:
            history_lines = []
            for msg in chat_history[-10:]:
                role = "HR" if msg.get("sender") == "user" else "Assistant"
                history_lines.append(f"{role}: {msg.get('text', '')}")
            history_text = "\n".join(history_lines)

        # ── 4. Prompt ─────────────────────────────────────────────────────────
        prompt = f"""You are an HR assistant with access to candidate resumes across the entire company database.
Use the resume context and conversation history below to answer accurately.
Always refer to the same candidate that was discussed in recent messages unless the HR explicitly asks about someone new.
When listing items, use properly incrementing numbers: 1. first item 2. second item 3. third item and so on.
Never repeat the same number. Never output 1. 1. or 1. 1. 1.

RESUME CONTEXT:
{final_context}

CONVERSATION HISTORY:
{history_text if history_text else "No previous conversation."}

HR: {user_query}
Assistant:"""

        # ── 5. Ollama call ────────────────────────────────────────────────────
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": "llama3.1:8b", "prompt": prompt, "stream": stream},
            stream=stream,
            timeout=300
        )

        if stream:
            def generator():
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line.decode())
                        yield data.get("response", "")
                        if data.get("done"):
                            break
            return generator()
        else:
            return response.json().get("response", "")

    except Exception as e:
        error_msg = f"Lion encountered an issue: {str(e)}"
        print(f"DEBUG ERROR: {error_msg}")
        if stream:
            def error_gen():
                yield error_msg
            return error_gen()
        return error_msg