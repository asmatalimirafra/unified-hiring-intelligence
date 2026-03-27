import json
import requests
import re
from sentence_transformers import SentenceTransformer
from services.mongo_service import candidates_collection
from services.qdrant_service import qdrant_client as client
import torch

# Initialize embedding model
device = "cuda" if torch.cuda.is_available() else "cpu"
# embedder = SentenceTransformer('all-MiniLM-L6-v2', device=device)
embedder = SentenceTransformer("BAAI/bge-large-en-v1.5", device=device)
embedder.max_seq_length = 512 # Crucial for reading full queries/context


def get_hr_chat_response(user_query: str, stream: bool = False):
    try:
        context_blocks = []

        # 1. Name Detection
        candidate = candidates_collection.find_one(
            {"name": {"$regex": user_query, "$options": "i"}}
        )

        if candidate:
            context_blocks.append(f"CANDIDATE: {candidate.get('name')}\nROLE: {candidate.get('applied_role')}\nRESUME: {candidate.get('resume_text')}")
        else:
            # 2. Semantic Search
            query_vector = embedder.encode(user_query).tolist()
            response = client.query_points(
                collection_name="resumes",
                query=query_vector,
                limit=3,
                with_payload=True
            )

            for hit in response.points:
                # IMPORTANT: Ensure this matches how you stored IDs in add-candidate
                c_id = hit.payload.get("candidate_id") 
                # If your IDs in Mongo are "CND-123" but Qdrant stores "123", keep this logic:
                mongo_id = f"CND-{c_id}" if not str(c_id).startswith("CND-") else c_id
                
                candidate = candidates_collection.find_one({"candidate_id": mongo_id})
                if candidate:
                    context_blocks.append(f"CANDIDATE: {candidate.get('name')}\nRESUME: {candidate.get('resume_text')}")

        final_context = "\n---\n".join(context_blocks) if context_blocks else "No matching candidates found."

        prompt = f"""You are an HR assistant. Use the context to answer.
        CONTEXT:
        {final_context}
        QUESTION:
        {user_query}"""

        # 3. Call Ollama
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2:8b", # Ensure this model is pulled in Colab!
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