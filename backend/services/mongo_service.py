from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

# Initialize MongoDB client and database
# client = MongoClient("mongodb://localhost:27017/")
client = MongoClient("mongodb+srv://admin:admin123@cluster0.jon3j76.mongodb.net/?appName=Cluster0")
db = client["test-positions"]

# Collections
roles_collection = db["roles"]
candidates_collection = db["candidates"]
interviewers_collection = db["interviewers"]
users_collection = db["users"]
closed_roles_collection = db["closed_roles"]

# Create unique indexes (run once on startup; harmless if already exists)
candidates_collection.create_index("candidate_id", unique=True)
interviewers_collection.create_index("interviewer_id", unique=True)
users_collection.create_index("user_id", unique=True)
roles_collection.create_index("role_id", unique=True)  # ✅ NEW: hard DB constraint

def get_role_id_by_name(role_name):
    """Fetch role_id from roles collection by role name."""
    result = roles_collection.find_one({"role": role_name})
    return result["role_id"] if result else None

def store_job_description(role_id, role, positions, jd_text, filename):
    """Insert a new job role into MongoDB."""
    try:
        result = roles_collection.insert_one({
            "role_id": role_id,
            "role": role,
            "positions": positions,
            "job_description": jd_text,
            "jd_filename": filename,
            "status": "open"
        })
        return str(result.inserted_id)
    except DuplicateKeyError:  # ✅ NEW: catch MongoDB duplicate key error
        return None

def store_candidate(candidate_id, name, applied_role, applied_role_id, resume_text, file_bytes, stored_file_name,
                    email, github, location, phone, timestamp):
    try:
        result = candidates_collection.insert_one({
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
        })
        return str(result.inserted_id)
    except DuplicateKeyError:
        return None

def get_all_roles():
    """Return all job roles from the DB."""
    return list(roles_collection.find({}, {"_id": 0}))

def get_all_candidates():
    """Return all candidates from the DB."""
    return list(candidates_collection.find({}, {"_id": 0, "resume_file": 0}))

def update_role(role_id, update_data):
    """Update an existing role by role_id."""
    result = roles_collection.update_one(
        {"role_id": role_id},
        {"$set": update_data}
    )
    return result.modified_count

def update_candidate(candidate_id, update_data):
    """Update an existing candidate by candidate_id."""
    result = candidates_collection.update_one(
        {"candidate_id": candidate_id},
        {"$set": update_data}
    )
    return result.modified_count

def delete_role(role_id):
    """Delete a role by its ID."""
    result = roles_collection.delete_one({"role_id": role_id})
    return result.deleted_count

def delete_candidate(candidate_id):
    """Delete a candidate by their ID."""
    result = candidates_collection.delete_one({"candidate_id": candidate_id})
    return result.deleted_count

def store_interviewer(interviewer_id, name, email, department, joined_on):
    """Insert a new interviewer into MongoDB."""
    try:
        result = interviewers_collection.insert_one({
            "interviewer_id": interviewer_id,
            "name": name,
            "email": email,
            "department": department,
            "joined_on": joined_on
        })
        return str(result.inserted_id)
    except DuplicateKeyError:
        return None

def get_all_interviewers():
    """Return all interviewers from the DB."""
    return list(interviewers_collection.find({}, {"_id": 0}))

def add_interview_to_candidate(candidate_id, interview_data):
    """Push interview details to a candidate's interviews array."""
    result = candidates_collection.update_one(
        {"candidate_id": candidate_id},
        {"$push": {"interviews": interview_data}}
    )
    return result.modified_count

def add_interview_to_interviewer(interviewer_id, log_data):
    """Push interview summary to an interviewer's interviews_taken array."""
    result = interviewers_collection.update_one(
        {"interviewer_id": interviewer_id},
        {"$push": {"interviews_taken": log_data}}
    )
    return result.modified_count

def get_candidate_interviews(candidate_id):
    """Retrieve interviews array for a given candidate."""
    candidate = candidates_collection.find_one(
        {"candidate_id": candidate_id},
        {"_id": 0, "interviews": 1, "interview_aggregate": 1}
    )
    return candidate

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

        # Auto-link if role is interviewer
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

def close_role(role_id):
    """Close a role if it's open and log the closure."""
    role = roles_collection.find_one({"role_id": role_id})
    if not role or role.get("status") != "open":
        return None

    # Update role status
    roles_collection.update_one(
        {"role_id": role_id},
        {"$set": {"status": "closed"}}
    )

    # Log closure in closed_roles collection
    from datetime import datetime
    closed_roles_collection.insert_one({
        "role_id": role["role_id"],
        "role": role["role"],
        "closed_on": datetime.now()
    })

    return True

def get_all_closed_roles():
    """Return all closed roles ever logged."""
    return list(closed_roles_collection.find({}, {"_id": 0}))