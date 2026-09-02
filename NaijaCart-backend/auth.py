# auth.py
import secrets
from functools import wraps
from flask import request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_db
from datetime import datetime, timedelta

def hash_password(pw):        return generate_password_hash(pw)
def verify_password(pw, h):   return check_password_hash(h, pw)

def create_token(user_id):
    token = secrets.token_hex(24)
    expires_at = (datetime.now() + timedelta(days=7)).isoformat()
    conn = get_db()
    conn.execute(
        "UPDATE users SET token = ?, token_expires_at = ? WHERE id = ?",
        (token, expires_at, user_id),
    )
    conn.commit(); conn.close()
    return token

def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header.split(" ", 1)[1]
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE token = ? AND (token_expires_at IS NULL OR token_expires_at > ?)",
        (token, datetime.now().isoformat()),
    ).fetchone()
    conn.close()
    return user

def is_account_locked(email):
    conn = get_db()
    user = conn.execute("SELECT locked_until FROM users WHERE email = ?", (email.lower(),)).fetchone()
    conn.close()
    if user and user["locked_until"]:
        locked_until = datetime.fromisoformat(user["locked_until"])
        if datetime.now() < locked_until:
            return True
    return False

def increment_failed_attempts(email):
    conn = get_db()
    user = conn.execute("SELECT id, failed_login_attempts FROM users WHERE email = ?", (email.lower(),)).fetchone()
    if user:
        new_attempts = user["failed_login_attempts"] + 1
        if new_attempts >= 7:
            # Lock account for 30 minutes
            locked_until = (datetime.now() + timedelta(minutes=30)).isoformat()
            conn.execute("UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
                        (new_attempts, locked_until, user["id"]))
        else:
            conn.execute("UPDATE users SET failed_login_attempts = ? WHERE id = ?",
                        (new_attempts, user["id"]))
        conn.commit()
    conn.close()

def reset_failed_attempts(user_id):
    conn = get_db()
    conn.execute("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        return f(user, *args, **kwargs)
    return wrapper

def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        if not user["is_admin"]:
            return jsonify({"error": "Admin privileges required"}), 403
        return f(user, *args, **kwargs)
    return wrapper