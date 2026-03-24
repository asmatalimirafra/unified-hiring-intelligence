import json
import re
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, Form, HTTPException, Body

from fastapi.middleware.cors import CORSMiddleware


from services.mongo_service import (
    store_job_description,
    store_candidate,
    get_role_id_by_name,
    update_candidate,
    update_role,
    delete_role,
    delete_candidate,
    get_all_roles,
    get_all_candidates,
    store_interviewer,
    get_all_interviewers,
    add_interview_to_candidate,
    add_interview_to_interviewer,
    get_candidate_interviews,
    candidates_collection,
    users_collection,
    close_role, get_all_closed_roles,
    db
)

from services.qdrant_service import (
    store_jd_embedding,
    store_resume_embedding,
    delete_resume_vector,
    delete_jd_vector
)

from services.jd_parser import extract_text_from_pdf, extract_text_from_docx

from services.resume_utils import (
    extract_text_from_resume,
    generate_numeric_id,
    extract_skills_with_llm,
    extract_all_contact_metadata_from_context
)

from services.fitment_service import score_fitment_logic

from services.ollama_utils import (
    build_aggregator_prompt,
    call_fitment_llm
)

from services.auth_utils import verify_password

from fastapi.responses import StreamingResponse
from bson import ObjectId
import io


app = FastAPI()

# Allow frontend requests from localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Thread-Id"] # 👈 CRITICAL
)

@app.post("/add-role/", status_code=201)
async def add_role(
    role_id: str = Form(...),
    role: str = Form(...),
    positions: int = Form(...),
    jd_text: Optional[str] = Form(None),
    jd_file: Optional[UploadFile] = Form(None)
):
    if not jd_text and (jd_file is None or jd_file.filename == ""):
        raise HTTPException(status_code=422, detail="Please provide either JD text or upload a JD file.")

    filename = f"{role.replace(' ', '_')}_{role_id}_jd"

    if jd_file and jd_file.filename:
        file_content = await jd_file.read()
        if jd_file.filename.endswith(".pdf"):
            jd_text = extract_text_from_pdf(file_content)
        elif jd_file.filename.endswith(".docx"):
            jd_text = extract_text_from_docx(file_content)
        else:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    mongo_status = store_job_description(role_id, role, positions, jd_text, filename)

    try:
        role_id_int = int(role_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="role_id must be numeric")

    qdrant_status = store_jd_embedding(role_id_int, jd_text)

    return {
        "role_id": role_id,
        "stored_as_filename": f"{filename}.ext",
        "mongo_status": mongo_status,
        "qdrant_status": qdrant_status
    }

@app.get("/get-roles/")
async def get_roles():
    return get_all_roles()

@app.put("/update-role/{role_id}")
async def update_role_api(role_id: str, update_data: dict = Body(...)):
    modified = update_role(role_id, update_data)
    if modified:
        return {"message": f"Role {role_id} updated."}
    else:
        raise HTTPException(status_code=404, detail="Role not found or no change applied.")

@app.delete("/delete-role/{role_id}")
async def delete_role_api(role_id: str):
    deleted = delete_role(role_id)
    if deleted:
        delete_jd_vector(int(role_id))
        return {"message": f"Role {role_id} deleted."}
    else:
        raise HTTPException(status_code=404, detail="Role not found.")

@app.post("/add-candidate/", status_code=201)
async def add_candidate(
    name: str = Form(...),
    applied_role: str = Form(...),
    resume_file: UploadFile = Form(...)
):
    if not resume_file.filename.endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    file_bytes = await resume_file.read()

    applied_role_id = get_role_id_by_name(applied_role)
    if applied_role_id is None:
        raise HTTPException(status_code=404, detail=f"Role '{applied_role}' not found.")

    candidate_id_num = generate_numeric_id()
    candidate_id_str = f"CND-{candidate_id_num}"

    resume_text = extract_text_from_resume(file_bytes, resume_file.filename)
    # resume_text = clean_resume_text(resume_text)
    print("🔎 Extracted resume text preview:\n", resume_text[:3000])

    # ✅ Only extract metadata using LLM (no skills/education)
    # metadata = extract_all_contact_metadata_from_context(resume_text)
    from services.resume_utils import extract_contact_metadata
    metadata = extract_contact_metadata(resume_text)
    email = metadata.get("email", "")
    github = metadata.get("github", "")
    phone = metadata.get("phone", "")
    location = metadata.get("location", "")

    print("📬 Extracted metadata:", metadata)

    ext = resume_file.filename.split(".")[-1]
    stored_file_name = f"{name.replace(' ', '_')}_{applied_role.replace(' ', '_')}_{candidate_id_str}.{ext}"

    mongo_status = store_candidate(
        candidate_id=candidate_id_str,
        name=name,
        applied_role=applied_role,
        applied_role_id=applied_role_id,
        resume_text=resume_text,
        file_bytes=file_bytes,
        stored_file_name=stored_file_name,
        email=email,
        github=github,
        location=location,
        phone=phone,
        timestamp=datetime.now()
    )

    if mongo_status is None:
        raise HTTPException(status_code=409, detail=f"Candidate ID '{candidate_id_str}' already exists.")

    # qdrant_status = store_resume_embedding(candidate_id_num, resume_text, name, applied_role)
    # qdrant_status = store_resume_embedding(candidate_id_str, resume_text, name, applied_role)
    qdrant_status = store_resume_embedding(candidate_id_num, resume_text, name, applied_role)


    return {
        "candidate_id": candidate_id_str,
        "stored_as": stored_file_name,
        "applied_role_id": applied_role_id,
        "mongo_status": mongo_status,
        "qdrant_status": qdrant_status
    }

@app.get("/get-candidates/")
async def get_candidates():
    return get_all_candidates()

@app.put("/update-candidate/{candidate_id}")
async def update_candidate_api(candidate_id: str, update_data: dict = Body(...)):
    modified = update_candidate(candidate_id, update_data)
    if modified:
        return {"message": f"Candidate {candidate_id} updated."}
    else:
        raise HTTPException(status_code=404, detail="Candidate not found or no change applied.")

@app.delete("/delete-candidate/{candidate_id}")
async def delete_candidate_api(candidate_id: str):
    deleted = delete_candidate(candidate_id)
    if deleted:
        delete_resume_vector(candidate_id)
        return {"message": f"Candidate {candidate_id} deleted."}
    else:
        raise HTTPException(status_code=404, detail="Candidate not found.")

# @app.get("/score-fitment/{candidate_id}")
# async def score_fitment(candidate_id: str):
#     result = score_fitment_logic(candidate_id)
#     if result:
#         return result
#     else:
#         raise HTTPException(status_code=404, detail="Candidate or Role not found.")

@app.get("/score-fitment/{candidate_id}")
async def score_fitment(candidate_id: str):

    try:
        result = score_fitment_logic(candidate_id)

        if result:
            return result
        else:
            return {"error": "Fitment returned empty result"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}



@app.post("/add-interviewer/", status_code=201)
async def add_interviewer(
    interviewer_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    department: str = Form(...)
):
    from datetime import datetime
    joined_on = datetime.now()
    mongo_status = store_interviewer(interviewer_id, name, email, department, joined_on)
    if mongo_status is None:
        raise HTTPException(status_code=409, detail=f"Interviewer ID '{interviewer_id}' already exists.")
    return {
        "interviewer_id": interviewer_id,
        "mongo_status": mongo_status
    }


@app.get("/get-interviewers/")
async def list_interviewers():
    return get_all_interviewers()



@app.post("/add-interview/", status_code=201)
async def add_interview(
    candidate_id: str = Form(...),
    round_num: int = Form(...),  # renamed from 'round' to avoid shadowing built-in
    interviewer_id: str = Form(...),
    communication: int = Form(...),
    problem_solving: int = Form(...),
    domain_knowledge: int = Form(...),
    comments: str = Form(...)
):
    from datetime import datetime
    now = datetime.now()

    # Ratings dictionary
    ratings = {
        "communication": communication,
        "problem_solving": problem_solving,
        "domain_knowledge": domain_knowledge
    }

    # Validate rating ranges
    for rating, value in ratings.items():
        if not 1 <= value <= 5:
            raise HTTPException(status_code=400, detail=f"Rating '{rating}' must be between 1 and 5.")

    # Prepare detailed interview record for candidate
    interview_data = {
        "round": round_num,
        "interviewer_id": interviewer_id,
        "ratings": ratings,
        "comments": comments,
        "datetime": now
    }

    candidate_updated = add_interview_to_candidate(candidate_id, interview_data)
    if candidate_updated == 0:
        raise HTTPException(status_code=404, detail=f"Candidate ID '{candidate_id}' not found.")

    # Prepare lightweight log for interviewer
    interview_log = {
        "candidate_id": candidate_id,
        "round": round_num,
        "datetime": now
    }

    interviewer_updated = add_interview_to_interviewer(interviewer_id, interview_log)
    # if interviewer_updated == 0:
    #     raise HTTPException(status_code=404, detail=f"Interviewer ID '{interviewer_id}' not found.")

    # return {
    #     "candidate_id": candidate_id,
    #     "round": round_num,
    #     "interviewer_id": interviewer_id,
    #     "timestamp": now.isoformat(),
    #     "message": "Interview successfully recorded."
    # }

    return {
        "status": "success",
        "candidate_id": candidate_id,
        "round": round_num,
        "interviewer_id": interviewer_id,
        "timestamp": now.isoformat(),
        "message": "Interview successfully recorded."
    }




@app.get("/aggregate-interviews/{candidate_id}")
async def aggregate_interviews(candidate_id: str):

    # Fetch interviews & existing aggregate
    candidate = get_candidate_interviews(candidate_id)

    if not candidate or "interviews" not in candidate:
        raise HTTPException(status_code=404, detail=f"No interviews found for candidate ID '{candidate_id}'.")

    # Return cached aggregate if already exists
    if "interview_aggregate" in candidate and candidate["interview_aggregate"]:
        return candidate["interview_aggregate"]

    interviews = candidate["interviews"]

    # Check both rounds exist
    rounds = {interview["round"] for interview in interviews}
    if not {1, 2}.issubset(rounds):
        raise HTTPException(status_code=400, detail="Candidate must complete both rounds before aggregation.")

    # Get round 1 and round 2 interview details
    round1 = next((i for i in interviews if i["round"] == 1), None)
    round2 = next((i for i in interviews if i["round"] == 2), None)

    if not round1 or not round2:
        raise HTTPException(status_code=400, detail="Both round 1 and round 2 must be completed for aggregation.")

    # Compute average scores
    average_scores = {}
    categories = ["communication", "problem_solving", "domain_knowledge"]
    for category in categories:
        avg = (round1["ratings"][category] + round2["ratings"][category]) / 2.0
        average_scores[category] = round(avg, 2)
    overall_avg = round(sum(average_scores.values()) / len(categories), 2)
    average_scores["overall_average"] = overall_avg

    # Combine comments
    combined_comments = f"Round 1 Comments: {round1['comments']}\nRound 2 Comments: {round2['comments']}"

    # Build prompt with helper function + call LLM
    prompt = build_aggregator_prompt(average_scores, combined_comments)
    raw_output = call_fitment_llm(prompt, max_tokens=300)

    # Parse LLM JSON output
    json_match = re.search(r"\{[\s\S]*\}", raw_output)
    if not json_match:
        raise HTTPException(status_code=500, detail="LLM did not return valid JSON.")

    try:
        parsed = json.loads(json_match.group())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse LLM JSON output.")

    # Build and store aggregate result
    aggregate_result = {
        "average_scores": average_scores,
        "verdict": parsed.get("verdict", "Unknown"),
        "strengths": parsed.get("strengths", []),
        "weaknesses": parsed.get("weaknesses", []),
        "combined_comments": combined_comments,
        "aggregated_at": datetime.now()
    }

    candidates_collection.update_one(
        {"candidate_id": candidate_id},
        {"$set": {"interview_aggregate": aggregate_result}}
    )

    return aggregate_result


# @app.post("/login/")
# async def login_user(email: str = Form(...), password: str = Form(...)):
#     user = users_collection.find_one({"email": email})
#     if not user or not verify_password(password, user["password_hash"]):
#         raise HTTPException(status_code=401, detail="Invalid email or password")

#     return {
#         "user_id": user["user_id"],
#         "name": user["name"],
#         "role": user["role"]
#     }

# @app.post("/login/")
# async def login_user(email: str = Form(...), password: str = Form(...)):
#     # This ignores the DB and lets you in immediately
#     return {
#         "user_id": "U001",
#         "name": "Admin User",
#         "role": "Interviewer",
#         "email":email
#     }
    
@app.post("/login/")
async def login_user(email: str = Form(...), password: str = Form(...)):
    user_payload = {
        "user_id": "U001",
        "name": "Admin User",
        "role": "HR",
        "email": email
    }
    
    # This ensures the Dashboard always finds a record for this ID
    db.interviewers.update_one(
        {"interviewer_id": user_payload["user_id"]},
        {"$setOnInsert": {
            "name": user_payload["name"],
            "email": user_payload["email"],
            "interviews_taken": [] 
        }},
        upsert=True
    )
    
    return user_payload

from fastapi import HTTPException, Response
from fastapi.responses import StreamingResponse
import io

@app.get("/get-resume/{candidate_id}")
async def get_resume(candidate_id: str):
    candidate = candidates_collection.find_one({"candidate_id": candidate_id})
    if not candidate or "resume_file" not in candidate:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Use the actual file name from your DB
    file_name = candidate.get("file_name", f"{candidate_id}.pdf")

    return StreamingResponse(
        io.BytesIO(candidate["resume_file"]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{file_name}"'
        }
    )

@app.post("/close-role/{role_id}")
async def close_role_api(role_id: str):
    success = close_role(role_id)
    if success:
        return {"message": f"Role {role_id} successfully closed."}
    else:
        raise HTTPException(status_code=400, detail="Role not found or already closed.")

@app.get("/roles-closed/")
async def get_roles_closed():
    return get_all_closed_roles()


# RAG Implementation

from services.rag_service import get_hr_chat_response # Import your function
# from datetime import datetime

# @app.post("/hr-chat/")
# async def hr_chat(request: dict):
#     query = request.get("query")
#     if not query:
#         return {"error": "No query provided"}
    
#     response = get_hr_chat_response(query)
#     return {"reply": response}

from uuid import uuid4 # For unique thread IDs
from fastapi.responses import StreamingResponse

chat_collection = db["chat_history"]

# 1. Fetch all unique thread summaries for the sidebar
@app.get("/hr/threads/{user_email}")
async def get_user_threads(user_email: str):
    if not user_email or user_email == "undefined":
        return []

    # Pipeline searches for messages belonging to the user
    pipeline = [
        {"$match": {"user_email": user_email}},
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$thread_id",
            "title": {"$first": "$text"},
            "last_updated": {"$last": "$timestamp"}
        }},
        {"$sort": {"last_updated": -1}}
    ]
    threads = list(chat_collection.aggregate(pipeline))
    # Safety check on title to prevent empty sidebar items
    return [{"id": t["_id"], "title": (t.get("title", "New Conversation")[:30] + "...")} for t in threads]
# 2. Fetch all messages for a specific thread
@app.get("/hr/chat-history/{thread_id}")
async def get_thread_history(thread_id: str):
    messages = list(chat_collection.find({"thread_id": thread_id}).sort("timestamp", 1))
    for msg in messages:
        msg["_id"] = str(msg["_id"])
    return messages

# 3. Updated Chat Endpoint to save history
# @app.post("/hr-chat/")
# async def hr_chat(request: dict):
#     query = request.get("query")
#     user_email = request.get("user_email", "admin@company.com")
#     thread_id = request.get("thread_id") or str(uuid4()) # Create new ID if none exists
    
#     # Get LLM Response
#     response_text = get_hr_chat_response(query)
    
#     # Save to MongoDB
#     timestamp = datetime.utcnow()
#     chat_collection.insert_many([
#         {
#             "thread_id": thread_id, "user_email": user_email, 
#             "sender": "user", "text": query, "timestamp": timestamp
#         },
#         {
#             "thread_id": thread_id, "user_email": user_email, 
#             "sender": "bot", "text": response_text, "timestamp": timestamp
#         }
#     ])
    
#     return {"reply": response_text, "thread_id": thread_id}


from fastapi.responses import StreamingResponse
from uuid import uuid4
from datetime import datetime

@app.post("/hr-chat/")
async def hr_chat(request: dict):
    query = request.get("query")
    # Defaulting to admin@company.com if React fails to send email
    user_email = request.get("user_email")
    if not user_email or user_email == "null":
        user_email = "admin@company.com"
        
    thread_id = request.get("thread_id")
    if not thread_id or thread_id == "null":
        thread_id = str(uuid4())
    
    timestamp = datetime.utcnow()
    chat_collection.insert_one({
        "thread_id": thread_id, 
        "user_email": user_email, 
        "sender": "user", 
        "text": query, 
        "timestamp": timestamp
    })

    def stream_generator():
        full_response = ""
        # iterate through generator from rag_service
        for chunk in get_hr_chat_response(query, stream=True):
            full_response += chunk
            yield chunk

        # Only save if we actually got a response
        if full_response.strip():
            chat_collection.insert_one({
                "thread_id": thread_id, 
                "user_email": user_email, 
                "sender": "bot", 
                "text": full_response, 
                "timestamp": datetime.utcnow()
            })

    return StreamingResponse(
        stream_generator(), 
        media_type="text/plain",
        headers={"X-Thread-Id": thread_id}
    )

    # Interviewer Page

    # --- INTERVIEWER CHAT IMPLEMENTATION ---

# 1. Fetch Interviewer unique threads
@app.get("/interviewer/threads/{user_email}")
async def get_interviewer_threads(user_email: str):
    pipeline = [
        {"$match": {"user_email": user_email, "context": "interviewer"}}, # Filter by interviewer context
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$thread_id",
            "title": {"$first": "$text"},
            "last_updated": {"$last": "$timestamp"}
        }},
        {"$sort": {"last_updated": -1}}
    ]
    threads = list(chat_collection.aggregate(pipeline))
    return [{"id": t["_id"], "title": t["title"][:30] + "..."} for t in threads]

# 2. Fetch Interviewer history
@app.get("/interviewer/chat-history/{thread_id}")
async def get_interviewer_history(thread_id: str):
    messages = list(chat_collection.find({"thread_id": thread_id}).sort("timestamp", 1))
    for msg in messages:
        msg["_id"] = str(msg["_id"])
    return messages

# 3. Interviewer Chat Streaming Endpoint
@app.post("/interviewer-chat/")
async def interviewer_chat(request: dict):
    query = request.get("query")
    user_email = request.get("user_email", "interviewer@company.com")
    thread_id = request.get("thread_id")
    
    if not thread_id or thread_id == "null":
        thread_id = str(uuid4())
    
    # Save User Message with context="interviewer"
    timestamp = datetime.utcnow()
    chat_collection.insert_one({
        "thread_id": thread_id, 
        "user_email": user_email, 
        "sender": "user", 
        "text": query, 
        "context": "interviewer",
        "timestamp": timestamp
    })

    def stream_generator():
        full_response = ""
        # We can reuse the same RAG service but we will handle the "Interviewer" prompt later
        for chunk in get_hr_chat_response(query, stream=True):
            full_response += chunk
            yield chunk

        # Save Bot Response
        chat_collection.insert_one({
            "thread_id": thread_id, 
            "user_email": user_email, 
            "sender": "bot", 
            "text": full_response, 
            "context": "interviewer",
            "timestamp": datetime.utcnow()
        })

    return StreamingResponse(
        stream_generator(), 
        media_type="text/plain",
        headers={"X-Thread-Id": thread_id}
    )
