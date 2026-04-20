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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Thread-Id"]
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

    try:
        role_id_int = int(role_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="role_id must be numeric.")

    existing_role = db["roles"].find_one({"role_id": role_id})
    if existing_role:
        raise HTTPException(
            status_code=400,
            detail=f"Role ID '{role_id}' already exists. Please use a unique Role ID."
        )

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

    if mongo_status is None:
        raise HTTPException(
            status_code=400,
            detail=f"Role ID '{role_id}' already exists. Please use a unique Role ID."
        )

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
    print("🔎 Extracted resume text preview:\n", resume_text[:3000])

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
    round_num: int = Form(...),
    interviewer_id: str = Form(...),
    communication: int = Form(...),
    problem_solving: int = Form(...),
    domain_knowledge: int = Form(...),
    comments: str = Form(...)
):
    now = datetime.now()

    ratings = {
        "communication": communication,
        "problem_solving": problem_solving,
        "domain_knowledge": domain_knowledge
    }

    for rating, value in ratings.items():
        if not 1 <= value <= 5:
            raise HTTPException(status_code=400, detail=f"Rating '{rating}' must be between 1 and 5.")

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

    interview_log = {
        "candidate_id": candidate_id,
        "round": round_num,
        "datetime": now
    }

    add_interview_to_interviewer(interviewer_id, interview_log)

    return {
        "status": "success",
        "candidate_id": candidate_id,
        "round": round_num,
        "interviewer_id": interviewer_id,
        "timestamp": now.isoformat(),
        "message": "Interview successfully recorded."
    }

@app.get("/aggregate-interviews/{candidate_id}")
# async def aggregate_interviews(candidate_id: str):
async def aggregate_interviews(candidate_id: str, force: bool = True):
    candidate = get_candidate_interviews(candidate_id)

    if not candidate or "interviews" not in candidate:
        raise HTTPException(status_code=404, detail=f"No interviews found for candidate ID '{candidate_id}'.")

    # if "interview_aggregate" in candidate and candidate["interview_aggregate"]:
    #     return candidate["interview_aggregate"]
    if "interview_aggregate" in candidate and candidate["interview_aggregate"] and not force:
        return candidate["interview_aggregate"]

    interviews = candidate["interviews"]

    if len(interviews) < 1:
        raise HTTPException(status_code=400, detail="Candidate must have at least one interview round.")

    # Average across ALL rounds (L1-L10)
    categories = ["communication", "problem_solving", "domain_knowledge"]
    category_totals = {c: 0.0 for c in categories}
    category_counts = {c: 0   for c in categories}

    for interview in interviews:
        ratings = interview.get("ratings", {})
        for cat in categories:
            if cat in ratings:
                category_totals[cat] += ratings[cat]
                category_counts[cat] += 1

    average_scores = {}
    for cat in categories:
        if category_counts[cat] > 0:
            average_scores[cat] = round(category_totals[cat] / category_counts[cat], 2)
        else:
            average_scores[cat] = 0.0

    overall_avg = round(sum(average_scores.values()) / len(categories), 2)
    average_scores["overall_average"] = overall_avg

    # Hire verdict based on numeric average (your rules)
    if overall_avg >= 4:
        numeric_verdict = "Strong Hire"
    elif overall_avg >= 3:
        numeric_verdict = "Hire"
    elif overall_avg >= 2.5:
        numeric_verdict = "Weak Hire"
    else:
        numeric_verdict = "No Hire"

    # Combined comments from all rounds
    sorted_interviews = sorted(interviews, key=lambda i: i["round"])
    combined_comments = "\n".join(
        f"Round {i['round']} Comments: {i.get('comments', '')}"
        for i in sorted_interviews
    )

    prompt = build_aggregator_prompt(average_scores, combined_comments)
    raw_output = call_fitment_llm(prompt, max_tokens=300)

    json_match = re.search(r"\{[\s\S]*\}", raw_output)
    parsed = {}
    if json_match:
        try:
            parsed = json.loads(json_match.group())
        except Exception:
            parsed = {}

    aggregate_result = {
        "average_scores": average_scores,
        "verdict": numeric_verdict,
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

@app.post("/login/")
async def login_user(email: str = Form(...), password: str = Form(...)):
    user = users_collection.find_one({"email": email})

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_hash = user.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=500, detail="User data error")

    if not verify_password(password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "user_id": user["user_id"],
        "name": user["name"],
        "role": user["role"]
    }

@app.get("/get-resume/{candidate_id}")
async def get_resume(candidate_id: str):
    candidate = candidates_collection.find_one({"candidate_id": candidate_id})
    if not candidate or "resume_file" not in candidate:
        raise HTTPException(status_code=404, detail="Resume not found")

    file_name = candidate.get("file_name", f"{candidate_id}.pdf")

    return StreamingResponse(
        io.BytesIO(candidate["resume_file"]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{file_name}"'}
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


# ═══════════════════════════════════════════════════════════════════════════════
# CHAT SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

from services.rag_service import get_hr_chat_response
from uuid import uuid4

chat_collection = db["chat_history"]


def load_thread_history(thread_id: str) -> list:
    """
    Loads the full conversation for a thread from MongoDB.
    Returns list of {sender, text} dicts, oldest first.
    """
    messages = list(
        chat_collection.find(
            {"thread_id": thread_id},
            {"_id": 0, "sender": 1, "text": 1}
        ).sort("timestamp", 1)
    )
    return messages


# ── HR Endpoints ──────────────────────────────────────────────────────────────

@app.get("/hr/threads/{user_email}")
async def get_hr_threads(user_email: str):
    pipeline = [
        {"$match": {"user_email": user_email, "context": "hr"}},
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$thread_id",
            "title": {"$first": "$text"},
            # $max picks the non-null custom_title over null from newer messages
            "custom_title": {"$max": "$custom_title"},
            "last_updated": {"$last": "$timestamp"}
        }},
        {"$sort": {"last_updated": -1}}
    ]
    threads = list(chat_collection.aggregate(pipeline))
    result = []
    for t in threads:
        display_title = t.get("custom_title") or t["title"]
        result.append({"id": t["_id"], "title": display_title[:40] + ("..." if len(display_title) > 40 else "")})
    return result


@app.get("/hr/chat-history/{thread_id}")
async def get_hr_history(thread_id: str):
    messages = list(chat_collection.find({"thread_id": thread_id}).sort("timestamp", 1))
    for msg in messages:
        msg["_id"] = str(msg["_id"])
    return messages


@app.patch("/hr/threads/{thread_id}/rename")
async def rename_hr_thread(thread_id: str, body: dict = Body(...)):
    """Rename a chat thread. Stores custom_title on all messages in the thread."""
    new_title = body.get("title", "").strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    chat_collection.update_many(
        {"thread_id": thread_id},
        {"$set": {"custom_title": new_title}}
    )
    return {"message": "Thread renamed successfully."}


@app.delete("/hr/threads/{thread_id}")
async def delete_hr_thread(thread_id: str):
    """Delete all messages belonging to a thread."""
    result = chat_collection.delete_many({"thread_id": thread_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return {"message": f"Thread {thread_id} deleted ({result.deleted_count} messages removed)."}


@app.post("/hr-chat/")
async def hr_chat(request: dict):
    query = request.get("query")
    user_email = request.get("user_email", "hr@company.com")
    thread_id = request.get("thread_id")

    if not thread_id or thread_id == "null":
        thread_id = str(uuid4())

    # ✅ Load full conversation history before calling LLM
    chat_history = load_thread_history(thread_id)

    # Carry forward custom_title if thread was already renamed
    existing = chat_collection.find_one(
        {"thread_id": thread_id, "custom_title": {"$exists": True, "$ne": None}},
        {"custom_title": 1}
    )
    custom_title = existing.get("custom_title") if existing else None

    chat_collection.insert_one({
        "thread_id": thread_id,
        "user_email": user_email,
        "sender": "user",
        "text": query,
        "context": "hr",
        "timestamp": datetime.utcnow(),
        **({"custom_title": custom_title} if custom_title else {})
    })

    def stream_generator():
        full_response = ""
        # ✅ Pass history so LLM understands pronouns and follow-up questions
        for chunk in get_hr_chat_response(query, chat_history=chat_history, stream=True):
            full_response += chunk
            yield chunk

        chat_collection.insert_one({
            "thread_id": thread_id,
            "user_email": user_email,
            "sender": "bot",
            "text": full_response,
            "context": "hr",
            "timestamp": datetime.utcnow(),
            **({"custom_title": custom_title} if custom_title else {})
        })

    return StreamingResponse(
        stream_generator(),
        media_type="text/plain",
        headers={"X-Thread-Id": thread_id}
    )


# ── Interviewer Endpoints ─────────────────────────────────────────────────────

@app.get("/interviewer/threads/{user_email}")
async def get_interviewer_threads(user_email: str):
    pipeline = [
        {"$match": {"user_email": user_email, "context": "interviewer"}},
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$thread_id",
            "title": {"$first": "$text"},
            "custom_title": {"$max": "$custom_title"},
            "last_updated": {"$last": "$timestamp"}
        }},
        {"$sort": {"last_updated": -1}}
    ]
    threads = list(chat_collection.aggregate(pipeline))
    result = []
    for t in threads:
        display_title = t.get("custom_title") or t["title"]
        result.append({"id": t["_id"], "title": display_title[:40] + ("..." if len(display_title) > 40 else "")})
    return result


@app.get("/interviewer/chat-history/{thread_id}")
async def get_interviewer_history(thread_id: str):
    messages = list(chat_collection.find({"thread_id": thread_id}).sort("timestamp", 1))
    for msg in messages:
        msg["_id"] = str(msg["_id"])
    return messages


@app.post("/interviewer-chat/")
async def interviewer_chat(request: dict):
    query = request.get("query")
    user_email = request.get("user_email", "interviewer@company.com")
    thread_id = request.get("thread_id")

    if not thread_id or thread_id == "null":
        thread_id = str(uuid4())

    # ✅ Load full conversation history before calling LLM
    chat_history = load_thread_history(thread_id)

    chat_collection.insert_one({
        "thread_id": thread_id,
        "user_email": user_email,
        "sender": "user",
        "text": query,
        "context": "interviewer",
        "timestamp": datetime.utcnow()
    })

    def stream_generator():
        full_response = ""
        # ✅ Pass history so LLM understands pronouns and follow-up questions
        for chunk in get_hr_chat_response(query, chat_history=chat_history, stream=True):
            full_response += chunk
            yield chunk

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