from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams, PointIdsList
from sentence_transformers import SentenceTransformer
import torch
import numpy as np

# Reuse existing machinery — no new dependencies.
#   _strip_html: converts WYSIWYG JD HTML → plaintext (block tags → newlines)
#   split_resume_into_chunks: semantic chunking used elsewhere for the LLM
from services.ats_service import _strip_html
from services.resume_segmenter import split_resume_into_chunks

# Initialize Qdrant client
#client = QdrantClient(host="localhost", port=7000)
# client = QdrantClient(host="127.0.0.1", port=6333)
client = QdrantClient(
    url="https://1b6f8eb5-ecc0-405c-b80f-f3e686272de1.europe-west3-0.gcp.cloud.qdrant.io:6333", 
    api_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.A65FYUgndGwk8r4qMN5RB94IUIqNliMA8wYTVaclsqs",
)
# Load SentenceTransformer model (384-dimensional)
device = "cuda" if torch.cuda.is_available() else "cpu"
# model = SentenceTransformer("all-MiniLM-L6-v2", device=device)
model = SentenceTransformer("BAAI/bge-large-en-v1.5", device=device)
model.max_seq_length = 512 # Added for more details
# Collection names
JD_COLLECTION = "job_descriptions"
RESUME_COLLECTION = "resumes"

# ─────────────────────────────────────────────────────────────────────────────
# Document embedding — chunk + mean-pool
#
# WHY (this is the fix for low/erratic semantic similarity):
#   bge-large-en-v1.5 has a HARD 512-token limit (~350-400 words). Calling
#   model.encode(full_resume) silently truncates everything past the first
#   ~400 words BEFORE the vector is built — so skills/experience at the bottom
#   of a resume (and the body of a long JD) never reach the embedding. The
#   vector ends up representing the contact block + summary only.
#
# FIX:
#   1. Strip HTML first (JDs from the WYSIWYG editor are one HTML blob; the raw
#      tags pollute the vector and there are no real newlines to chunk on).
#   2. Split into chunks that each fit comfortably under 512 tokens.
#   3. Encode each chunk normalized, mean-pool, then re-normalize.
#      The pooled unit vector represents the WHOLE document, and cosine on
#      normalized vectors is well-behaved.
#
# NOTE: existing stored vectors were built the OLD (truncated) way. They must
# be re-embedded for cosine to be consistent — see reembed_all.py.
# ─────────────────────────────────────────────────────────────────────────────

# ~1500 chars ≈ ~375 tokens — safely under the 512-token ceiling.
_MAX_CHUNK_CHARS = 1500


def _window_long_chunk(chunk: str, max_chars: int = _MAX_CHUNK_CHARS):
    """Hard-wrap an oversized chunk on whitespace so no chunk exceeds the
    token ceiling. The segmenter's no-heading fallback returns the whole text
    as one chunk; for a long JD that would re-trigger truncation, so we guard
    against it here."""
    if len(chunk) <= max_chars:
        return [chunk]
    words, windows, cur = chunk.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > max_chars:
            if cur:
                windows.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        windows.append(cur)
    return windows


def _embed_document(text: str):
    """Strip HTML → chunk → encode each chunk normalized → mean-pool →
    re-normalize. Returns a unit vector (list[float]) representing the whole
    document. Falls back to a single direct encode if anything goes wrong."""
    if not text or not text.strip():
        # Encode empty string rather than crash; cosine will simply be low.
        return model.encode("", normalize_embeddings=True).tolist()

    plain = _strip_html(text)

    raw_chunks = split_resume_into_chunks(plain) or [plain]
    chunks = []
    for c in raw_chunks:
        chunks.extend(_window_long_chunk(c))
    chunks = [c for c in chunks if c and c.strip()]
    if not chunks:
        chunks = [plain[:_MAX_CHUNK_CHARS]]

    vectors = model.encode(chunks, normalize_embeddings=True)
    vectors = np.asarray(vectors, dtype=np.float32)
    if vectors.ndim == 1:
        vectors = vectors.reshape(1, -1)

    pooled = vectors.mean(axis=0)
    norm = np.linalg.norm(pooled)
    if norm > 0:
        pooled = pooled / norm
    return pooled.tolist()

# Qdrant vector config for both collections
vector_config = VectorParams(size=1024, distance=Distance.COSINE)

# Ensure both collections exist
for collection in [JD_COLLECTION, RESUME_COLLECTION]:
    try:
        client.get_collection(collection)
    except:
        client.recreate_collection(collection, vectors_config=vector_config)

def store_jd_embedding(role_id, jd_text):
    """Generate vector from JD text and store in Qdrant.
    JD arrives as WYSIWYG HTML — _embed_document strips it before encoding."""
    vector = _embed_document(jd_text)
    client.upsert(
        collection_name=JD_COLLECTION,
        points=[
            PointStruct(id=role_id, vector=vector, payload={"role_id": role_id})
        ]
    )
    return "JD embedded in Qdrant"

def store_resume_embedding(candidate_id, resume_text, name, applied_role):
    """Generate vector from resume text and store in Qdrant.
    Chunk + mean-pool so the WHOLE resume is represented, not just the
    first ~400 words (the 512-token truncation that was capping cosine)."""
    vector = _embed_document(resume_text)
    client.upsert(
        collection_name=RESUME_COLLECTION,
        points=[
            PointStruct(
                id=candidate_id,
                vector=vector,
                payload={
                    "candidate_id": candidate_id,
                    "name": name,
                    "applied_role": applied_role
                }
            )
        ]
    )
    return "Resume embedded in Qdrant"

# def store_resume_embedding(candidate_id, resume_text, name, applied_role):

#     if isinstance(candidate_id, str):
#         numeric_id = int(''.join(filter(str.isdigit, candidate_id)))
#     else:
#         numeric_id = candidate_id

#     vector = model.encode(resume_text).tolist()

#     client.upsert(
#         collection_name=RESUME_COLLECTION,
#         points=[
#             PointStruct(
#                 id=numeric_id,
#                 vector=vector,
#                 payload={
#                     "candidate_id": candidate_id,
#                     "name": name,
#                     "applied_role": applied_role
#                 }
#             )
#         ]
#     )

#     print("✅ Stored embedding for:", candidate_id)

def delete_resume_vector(candidate_id):
    """Delete a resume vector by candidate_id string like 'CND-4907'."""
    try:
        numeric_id = int(candidate_id.replace("CND-", ""))
        client.delete(
            collection_name=RESUME_COLLECTION,
            points_selector=PointIdsList(points=[numeric_id])
        )
    except Exception as e:
        print("❌ Failed to delete from Qdrant:", e)

def delete_jd_vector(role_id):
    """Delete a job description vector by role_id."""
    client.delete(
        collection_name=JD_COLLECTION,
        points_selector=PointIdsList(points=[role_id])
    )

qdrant_client = client  # This creates an alias so both names work
