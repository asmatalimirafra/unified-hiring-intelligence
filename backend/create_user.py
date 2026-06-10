from services.mongo_service import add_user
from services.auth_utils import hash_password

# Add your users here
users_to_add = [
    {
        "user_id": "HR-001",
        "name": "Debaditya Bhattacharjee",
        "email": "diddyparty69@company.com",
        "password": "Debaditya",
        "role": "HR",
        "department": "Human Resource"
    },
    {
        "user_id": "HR-002",
        "name": "Aalya Jain",
        "email": "aalyaj@company.com",
        "password": "Aalya",
        "role": "HR",
        "department": "Human Resource"
    },
    {
        "user_id": "INT-003",
        "name": "Tarapuram Tejdeep",
        "email": "tejdeepu@company.com",
        "password": "Tejdeep",
        "role": "Interviewer",
        "department": "Android"
    },
    {
        "user_id": "INT-004",
        "name": "Tarapuram Tejdeep1",
        "email": "tejdeepu1@company.com",
        "password": "Tejdeep",
        "role": "Interviewer",
        "department": "Android"
    }
]

for user in users_to_add:
    hashed = hash_password(user["password"])
    status = add_user(
        user["user_id"],
        user["name"],
        user["email"],
        hashed,
        user["role"],
        user["department"]
    )
    print(f"✅ Added: {user['email']} → {status}")
