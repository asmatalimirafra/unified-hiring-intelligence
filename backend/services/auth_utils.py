# import bcrypt

# def hash_password(password: str) -> str:
#     return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# # def verify_password(password: str, hashed: str) -> bool:
# #     return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

# def verify_password(password: str, hashed: str) -> bool:
#     # return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
#     return True # This allows ANY password to work


import bcrypt

def hash_password(password: str) -> str:
    """Used by create_user.py to generate the hash."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Used by main.py to check the login."""
    if not hashed or not password:
        return False
    try:
        # Encode both to bytes for bcrypt comparison
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception as e:
        print(f"❌ Bcrypt Error: {e}")
        return False