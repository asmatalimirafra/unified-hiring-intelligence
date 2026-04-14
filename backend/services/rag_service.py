import json
import requests
import re
from sentence_transformers import SentenceTransformer
from services.mongo_service import candidates_collection
from services.qdrant_service import qdrant_client as client
import torch

# Initialize embedding model
device = "cuda" if torch.cuda.is_available() else "cpu"
embedder = SentenceTransformer("BAAI/bge-large-en-v1.5", device=device)
embedder.max_seq_length = 512


def get_hr_chat_response(user_query: str, chat_history: list = None, stream: bool = False):
    """
    user_query   : the latest message from the user
    chat_history : list of {"sender": "user"|"bot", "text": "..."} dicts
                   representing the conversation so far (oldest first)
    stream       : whether to stream tokens back
    """
    try:
        chat_history = chat_history or []

        # ── 1. Resolve candidate from context ────────────────────────────────
        # First try to find a name in the CURRENT query
        candidate = candidates_collection.find_one(
            {"name": {"$regex": user_query, "$options": "i"}}
        )

        # If no name in current query, scan recent history for a name mention
        # (this is what fixes "tell me about HIS projects")
        if not candidate and chat_history:
            for past_msg in reversed(chat_history):
                past_text = past_msg.get("text", "")
                candidate = candidates_collection.find_one(
                    {"name": {"$regex": past_text, "$options": "i"}}
                )
                if candidate:
                    break

        context_blocks = []

        if candidate:
            context_blocks.append(
                f"CANDIDATE: {candidate.get('name')}\n"
                f"ROLE: {candidate.get('applied_role')}\n"
                f"RESUME: {candidate.get('resume_text')}"
            )
        else:
            # ── 2. Semantic search fallback ───────────────────────────────────
            # Enrich the query with recent chat context so the vector search
            # understands pronouns like "his", "her", "their"
            enriched_query = user_query
            if chat_history:
                recent = " ".join(
                    m.get("text", "") for m in chat_history[-4:]  # last 4 messages
                )
                enriched_query = f"{recent} {user_query}"

            query_vector = embedder.encode(enriched_query).tolist()
            response = client.query_points(
                collection_name="resumes",
                query=query_vector,
                limit=3,
                with_payload=True
            )

            for hit in response.points:
                c_id = hit.payload.get("candidate_id")
                mongo_id = f"CND-{c_id}" if not str(c_id).startswith("CND-") else c_id
                candidate = candidates_collection.find_one({"candidate_id": mongo_id})
                if candidate:
                    context_blocks.append(
                        f"CANDIDATE: {candidate.get('name')}\n"
                        f"RESUME: {candidate.get('resume_text')}"
                    )

        final_context = "\n---\n".join(context_blocks) if context_blocks else "No matching candidates found."

        # ── 3. Build conversation history string for the prompt ───────────────
        history_text = ""
        if chat_history:
            history_lines = []
            for msg in chat_history[-10:]:  # keep last 10 messages to avoid token overflow
                role = "HR" if msg.get("sender") == "user" else "Assistant"
                history_lines.append(f"{role}: {msg.get('text', '')}")
            history_text = "\n".join(history_lines)

        # ── 4. Build prompt with context + history ────────────────────────────
        prompt = f"""You are an HR assistant with access to candidate resumes. 
Use the resume context and conversation history below to answer accurately.
Always refer to the same candidate that was discussed in recent messages unless the HR explicitly asks about someone new.

RESUME CONTEXT:
{final_context}

CONVERSATION HISTORY:
{history_text if history_text else "No previous conversation."}

HR: {user_query}
Assistant:"""

        # ── 5. Call Ollama ────────────────────────────────────────────────────
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.1:8b",
                "prompt": prompt,
                "stream": stream
            },
            stream=stream,
            timeout=300
        )

        if stream:
            def generator():
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line.decode())
                        token = data.get("response", "")
                        yield token
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