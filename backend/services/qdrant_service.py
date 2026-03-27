from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Distance, VectorParams, PointIdsList
from sentence_transformers import SentenceTransformer
import torch

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

# Qdrant vector config for both collections
vector_config = VectorParams(size=1024, distance=Distance.COSINE)

# Ensure both collections exist
for collection in [JD_COLLECTION, RESUME_COLLECTION]:
    try:
        client.get_collection(collection)
    except:
        client.recreate_collection(collection, vectors_config=vector_config)

def store_jd_embedding(role_id, jd_text):
    """Generate vector from JD text and store in Qdrant."""
    vector = model.encode(jd_text).tolist()
    client.upsert(
        collection_name=JD_COLLECTION,
        points=[
            PointStruct(id=role_id, vector=vector, payload={"role_id": role_id})
        ]
    )
    return "JD embedded in Qdrant"

def store_resume_embedding(candidate_id, resume_text, name, applied_role):
    """Generate vector from resume text and store in Qdrant."""
    vector = model.encode(resume_text).tolist()
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