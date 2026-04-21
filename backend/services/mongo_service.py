from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

client = MongoClient("mongodb+srv://admin:admin123@cluster0.jon3j76.mongodb.net/?appName=Cluster0")
db = client["test-positions"]

# Collections
roles_collection = db["roles"]
candidates_collection = db["candidates"]
interviewers_collection = db["interviewers"]
users_collection = db["users"]
closed_roles_collection = db["closed_roles"]

# Unique indexes
candidates_collection.create_index("candidate_id", unique=True)
interviewers_collection.create_index("interviewer_id", unique=True)
users_collection.create_index("user_id", unique=True)
roles_collection.create_index("role_id", unique=True)

def get_role_id_by_name(role_name, hr_id=None):
    """
    Look up a role by name. If hr_id is provided, restrict to that HR's roles
    to avoid name clashes between different HR accounts.
    """
    query = {"role": role_name}
    if hr_id:
        query["hr_id"] = hr_id
    result = roles_collection.find_one(query)
    return result["role_id"] if result else None

# ── ROLES ──────────────────────────────────────────────────────────────────────

def store_job_description(role_id, role, positions, jd_text, filename, hr_id=None):
    """Insert a new job role into MongoDB, tagged with the HR who created it."""
    from datetime import datetime
    try:
        doc = {
            "role_id": role_id,
            "role": role,
            "positions": positions,
            "job_description": jd_text,
            "jd_filename": filename,
            "status": "open",
            "created_at": datetime.now()
        }
        if hr_id:
            doc["hr_id"] = hr_id
        result = roles_collection.insert_one(doc)
        return str(result.inserted_id)
    except DuplicateKeyError:
        return None

def get_all_roles(hr_id=None):
    """Return roles. If hr_id is given, return only that HR's roles."""
    query = {"hr_id": hr_id} if hr_id else {}
    return list(roles_collection.find(query, {"_id": 0}))

def update_role(role_id, update_data):
    result = roles_collection.update_one(
        {"role_id": role_id},
        {"$set": update_data}
    )
    return result.modified_count

def delete_role(role_id):
    result = roles_collection.delete_one({"role_id": role_id})
    return result.deleted_count

def close_role(role_id):
    from datetime import datetime
    role = roles_collection.find_one({"role_id": role_id})
    if not role or role.get("status") != "open":
        return None
    roles_collection.update_one(
        {"role_id": role_id},
        {"$set": {"status": "closed", "closed_on": datetime.now()}}
    )
    closed_roles_collection.insert_one({
        "role_id": role["role_id"],
        "role": role["role"],
        "closed_on": datetime.now()
    })
    return True

def get_all_closed_roles():
    return list(closed_roles_collection.find({}, {"_id": 0}))

# ── CANDIDATES ─────────────────────────────────────────────────────────────────

def store_candidate(candidate_id, name, applied_role, applied_role_id, resume_text,
                    file_bytes, stored_file_name, email, github, location, phone,
                    timestamp, hr_id=None):
    """Insert candidate, tagged with the HR who added them."""
    try:
        doc = {
            "candidate_id": candidate_id,
            "name": name,
            "applied_role": applied_role,
            "applied_role_id": applied_role_id,
            "datetime": timestamp,
            "resume_text": resume_text,
            "email": email,
            "github": github,
            "location": location,
            "phone": phone,
            "file_name": stored_file_name,
            "resume_file": file_bytes
        }
        if hr_id:
            doc["hr_id"] = hr_id
        result = candidates_collection.insert_one(doc)
        return str(result.inserted_id)
    except DuplicateKeyError:
        return None

def get_all_candidates(hr_id=None):
    """
    Return candidates.
    - If hr_id is given: return only candidates added by that HR.
    - No filter: return all (kept for backwards-compat / admin use).
    """
    query = {"hr_id": hr_id} if hr_id else {}
    return list(candidates_collection.find(query, {"_id": 0, "resume_file": 0}))

def get_candidates_for_interviewer(interviewer_email):
    """
    Return candidates that have been scheduled for a specific interviewer.
    Used by the Interviewer portal.
    """
    return list(candidates_collection.find(
        {
            "status": "Scheduled",
            "interview_details.interviewer_email": interviewer_email
        },
        {"_id": 0, "resume_file": 0}
    ))

def update_candidate(candidate_id, update_data):
    result = candidates_collection.update_one(
        {"candidate_id": candidate_id},
        {"$set": update_data}
    )
    return result.modified_count

def delete_candidate(candidate_id):
    result = candidates_collection.delete_one({"candidate_id": candidate_id})
    return result.deleted_count

def add_interview_to_candidate(candidate_id, interview_data):
    result = candidates_collection.update_one(
        {"candidate_id": candidate_id},
        {"$push": {"interviews": interview_data}}
    )
    return result.modified_count

def get_candidate_interviews(candidate_id):
    return candidates_collection.find_one(
        {"candidate_id": candidate_id},
        {"_id": 0, "interviews": 1, "interview_aggregate": 1}
    )

# ── INTERVIEWERS ───────────────────────────────────────────────────────────────

def store_interviewer(interviewer_id, name, email, department, joined_on):
    try:
        result = interviewers_collection.insert_one({
            "interviewer_id": interviewer_id,
            "name": name,
            "email": email,
            "department": department,
            "joined_on": joined_on,
            "interviews_taken": []
        })
        return str(result.inserted_id)
    except DuplicateKeyError:
        return None

def get_all_interviewers():
    return list(interviewers_collection.find({}, {"_id": 0}))

def add_interview_to_interviewer(interviewer_id, log_data):
    result = interviewers_collection.update_one(
        {"interviewer_id": interviewer_id},
        {"$push": {"interviews_taken": log_data}}
    )
    return result.modified_count

# ── USERS ──────────────────────────────────────────────────────────────────────

def add_user(user_id, name, email, hashed_password, role, department):
    try:
        result = users_collection.insert_one({
            "user_id": user_id,
            "name": name,
            "email": email,
            "password_hash": hashed_password,
            "role": role,
            "department": department
        })
        if role == "Interviewer":
            from datetime import datetime
            interviewers_collection.insert_one({
                "interviewer_id": user_id,
                "name": name,
                "email": email,
                "department": department,
                "joined_on": datetime.now(),
                "interviews_taken": []
            })
        return str(result.inserted_id)
    except DuplicateKeyError:
        return None