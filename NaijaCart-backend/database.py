# database.py
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "naijacart.db"

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row  # access columns by name
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn

def init_db():
    schema = (Path(__file__).parent / "schema.sql").read_text()
    conn = get_db()
    conn.executescript(schema)  # runs the CREATE TABLE statements

    # Keep databases created before the first/last name split usable.
    user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    if "first_name" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN first_name TEXT")
    if "last_name" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN last_name TEXT")
    if "phone" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    if "address" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN address TEXT")
    if "token_expires_at" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN token_expires_at TEXT")
    if "failed_login_attempts" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0")
    if "locked_until" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN locked_until TEXT")
    if "name" in user_columns:
        conn.execute(
            "UPDATE users SET first_name = COALESCE(first_name, name), last_name = COALESCE(last_name, '')"
        )

    conn.commit()
    conn.close()
