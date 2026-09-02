import os
import sqlite3
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from database import get_db, init_db
from auth import (
    hash_password, verify_password, create_token,
    login_required, admin_required,
)
from payments import initialize_payment, verify_payment
from email_verify import verify_email
from order_status import get_lifecycle_status, get_status_label
from seed import PRODUCTS

app = Flask(__name__)
init_db()
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(__file__), "uploads")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
configured_origins = os.environ.get(
    "NAIJACART_ALLOWED_ORIGINS",
    "https://naijacart-ecommerce.netlify.app",
)
local_origins = [
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in (*range(5500, 5511), *range(8000, 8011), 3000, 4173, 5173, 8080)
]
allowed_origins = local_origins + (
    [origin.strip() for origin in configured_origins.split(",") if origin.strip()]
    if configured_origins
    else []
)
allowed_origins = sorted(set(filter(None, allowed_origins)))
CORS(app, origins=allowed_origins)


@app.get("/")
def health_check():
    return jsonify({"status": "ok", "service": "NaijaCart API"})


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Vary"] = "Origin"
    return response


os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)


def seed_products_if_empty():
    conn = get_db()
    product_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if product_count == 0:
        conn.executemany(
            "INSERT INTO products (name, description, price, category, image_url, stock) VALUES (?, ?, ?, ?, ?, ?)",
            PRODUCTS,
        )
        conn.commit()
    conn.close()


seed_products_if_empty()


def enrich_order(order):
    row = dict(order)
    row["status"] = get_lifecycle_status(row.get("status"), row.get("created_at"))
    row["display_status"] = get_status_label(row["status"])
    items = order.get("items")
    if items is None:
        items = []
    row["items"] = [dict(item) for item in items]
    return row


PRODUCT_SELECT = """
    SELECT p.*,
           ROUND(COALESCE(AVG(r.rating), 0), 1) AS avg_rating,
           COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON r.product_id = p.id
"""

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


@app.post("/api/uploads")
@admin_required
def upload_image(user):
    if "image" not in request.files:
        return jsonify({"error": "No image selected"}), 400

    image = request.files["image"]
    if image.filename == "":
        return jsonify({"error": "No image selected"}), 400

    allowed_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    if image.mimetype not in allowed_types:
        return jsonify({"error": "Unsupported image type"}), 400

    filename = secure_filename(image.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    image.save(save_path)
    return jsonify({"image_url": f"{request.host_url.rstrip('/')}/uploads/{filename}"}), 201

# ----products
@app.get("/api/products")
def list_products():
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    sort = request.args.get("sort", "newest")

    sql = PRODUCT_SELECT + " WHERE 1=1"
    params = []
    if q:
        sql += " AND (p.name LIKE ? OR p.description LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if category and category != "all":
        sql += " AND p.category = ?"
        params.append(category)

    sql += " GROUP BY p.id"
    sql += {
        "price_asc": " ORDER BY p.price ASC",
        "price_desc": " ORDER BY p.price DESC",
        "rating": " ORDER BY avg_rating DESC",
    }.get(sort, " ORDER BY p.id DESC")

    conn = get_db()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.get("/api/products/<int:pid>")
def get_product(pid):
    conn = get_db()
    row = conn.execute(PRODUCT_SELECT + " WHERE p.id = ? GROUP BY p.id", (pid,)).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(dict(row))


@app.post("/api/products")
@admin_required
def create_product(user):
    d = request.get_json(silent=True) or {}
    required = ["name", "price", "category"]
    missing = [f for f in required if not d.get(f) and d.get(f) != 0]
    if missing:
        return jsonify({"error": f"Missing field(s): {', '.join(missing)}"}), 400
    try:
        price = float(d["price"])
        stock = int(d.get("stock", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Price must be a number and stock an integer"}), 400
    if price < 0 or stock < 0:
        return jsonify({"error": "Price and stock cannot be negative"}), 400

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO products (name, description, price, category, image_url, stock)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (d["name"], d.get("description", ""), price, d["category"], d.get("image_url", ""), stock),
    )
    conn.commit()
    pid = cur.lastrowid
    conn.close()
    return jsonify({"id": pid, "message": "Product created"}), 201

@app.put("/api/products/<int:pid>")
@admin_required
def update_product(user, pid):
    conn = get_db()
    existing = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if existing is None:
        conn.close()
        return jsonify({"error": "Product not found"}), 404

    d = request.get_json(silent=True) or {}
    fields = ["name", "description", "price", "category", "image_url", "stock"]
    updates = {field: d[field] for field in fields if field in d}
    if not updates:
        conn.close()
        return jsonify({"error": "No fields to update"}), 400
    if "name" in updates and not str(updates["name"]).strip():
        conn.close()
        return jsonify({"error": "Name cannot be empty"}), 400
    if "category" in updates and not str(updates["category"]).strip():
        conn.close()
        return jsonify({"error": "Category cannot be empty"}), 400
    try:
        if "price" in updates:
            updates["price"] = float(updates["price"])
        if "stock" in updates:
            updates["stock"] = int(updates["stock"])
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"error": "Price must be a number and stock an integer"}), 400
    if updates.get("price", 0) < 0 or updates.get("stock", 0) < 0:
        conn.close()
        return jsonify({"error": "Price and stock cannot be negative"}), 400

    set_clause = ", ".join(f"{field} = ?" for field in updates)
    conn.execute(f"UPDATE products SET {set_clause} WHERE id = ?", (*updates.values(), pid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Product updated"})


@app.delete("/api/products/<int:pid>")
@admin_required
def delete_product(user, pid):
    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM products WHERE id = ?", (pid,)).fetchone()
        if existing is None:
            return jsonify({"error": "Product not found"}), 404

        references = conn.execute(
            "SELECT EXISTS(SELECT 1 FROM order_items WHERE product_id = ?) "
            "OR EXISTS(SELECT 1 FROM reviews WHERE product_id = ?)",
            (pid, pid),
        ).fetchone()[0]
        if references:
            return jsonify({
                "error": "This product cannot be removed because it is used by existing orders or reviews."
            }), 409

        conn.execute("DELETE FROM products WHERE id = ?", (pid,))
        conn.commit()
        return jsonify({"message": "Product deleted"})
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({
            "error": "This product cannot be removed because it is used by existing orders or reviews."
        }), 409
    finally:
        conn.close()


# --------------------------------------------------------------------- auth
@app.post("/api/auth/register")
def register():
    d = request.get_json(silent=True) or {}
    first_name = d.get("first_name", "").strip()
    last_name = d.get("last_name", "").strip()
    email = d.get("email", "").strip().lower()
    phone = d.get("phone", "").strip()
    address = d.get("address", "").strip()
    password = d.get("password", "")
    confirm_password = d.get("confirm_password", password)

    if not first_name or not last_name or not email or not address or not password:
        return jsonify({"error": "First name, last name, email, address and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if "confirm_password" in d and password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "An account with that email already exists"}), 409

    try:
        verify_email(email)
    except ValueError as exc:
        conn.close()
        return jsonify({"error": str(exc)}), 400

    user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    if "name" in user_columns:
        cur = conn.execute(
            "INSERT INTO users (name, first_name, last_name, email, phone, address, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (f"{first_name} {last_name}", first_name, last_name, email, phone, address, hash_password(password)),
        )
    else:
        cur = conn.execute(
            "INSERT INTO users (first_name, last_name, email, phone, address, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
            (first_name, last_name, email, phone, address, hash_password(password)),
        )
    user_id = cur.lastrowid
    conn.commit()
    conn.close()
    token = create_token(user_id)
    full_name = f"{first_name} {last_name}"
    registered_user = {
        "id": user_id,
        "first_name": first_name,
        "last_name": last_name,
        "name": full_name,
        "email": email,
        "phone": phone,
        "address": address,
        "is_admin": False,
        "created_at": (conn.execute("SELECT created_at FROM users WHERE id = ?", (user_id,)).fetchone() or {})["created_at"],
    }
    conn.close()
    return jsonify({"token": token, "user": registered_user}), 201


@app.post("/api/auth/login")
def login():
    from auth import is_account_locked, increment_failed_attempts, reset_failed_attempts
    
    d = request.get_json(silent=True) or {}
    email, password = d.get("email", "").strip().lower(), d.get("password", "")
    
    # Check if account is locked
    if is_account_locked(email):
        return jsonify({"error": "Account temporarily locked due to too many failed attempts. Please try again later."}), 423
    
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    
    if user is None or not verify_password(password, user["password_hash"]):
        conn.close()
        increment_failed_attempts(email)
        # Check if this was the 7th attempt that locked the account
        if is_account_locked(email):
            return jsonify({"error": "Account locked due to too many failed attempts. Please try again later.", "locked": True}), 423
        return jsonify({"error": "Invalid email or password"}), 401
    
    # Successful login - reset failed attempts
    reset_failed_attempts(user["id"])
    token = create_token(user["id"])
    user = dict(user)
    full_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
    conn.close()
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"],
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name", ""),
            "name": full_name,
            "email": user["email"],
            "phone": user.get("phone", ""),
            "address": user.get("address", ""),
            "is_admin": bool(user["is_admin"]),
            "created_at": user.get("created_at"),
        },
    })


@app.put("/api/auth/profile")
@login_required
def update_profile(user):
    d = request.get_json(silent=True) or {}
    first_name = str(d.get("first_name", "")).strip()
    last_name = str(d.get("last_name", "")).strip()
    address = str(d.get("address", "")).strip()

    if not first_name or not last_name or not address:
        return jsonify({"error": "First name, last name and address are required"}), 400

    conn = get_db()
    user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    if "name" in user_columns:
        conn.execute(
            "UPDATE users SET first_name = ?, last_name = ?, name = ?, address = ? WHERE id = ?",
            (first_name, last_name, f"{first_name} {last_name}", address, user["id"]),
        )
    else:
        conn.execute(
            "UPDATE users SET first_name = ?, last_name = ?, address = ? WHERE id = ?",
            (first_name, last_name, address, user["id"]),
        )
    conn.commit()
    updated = conn.execute(
        "SELECT id, first_name, last_name, email, phone, address, is_admin FROM users WHERE id = ?",
        (user["id"],),
    ).fetchone()
    conn.close()
    updated = dict(updated)
    updated["name"] = f"{updated['first_name']} {updated['last_name']}".strip()
    updated["is_admin"] = bool(updated["is_admin"])
    updated["created_at"] = user.get("created_at")
    return jsonify({"user": updated, "message": "Profile updated"})


@app.post("/api/admins")
@admin_required
def create_admin(user):
    d = request.get_json(silent=True) or {}
    name = d.get("name", "").strip()
    email = d.get("email", "").strip().lower()
    password = d.get("password", "")
    if not name or not email or not password:
        return jsonify({"error": "Name, email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "An account with that email already exists"}), 409
    name_parts = name.split(None, 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""
    user_columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    if "name" in user_columns:
        cur = conn.execute(
            "INSERT INTO users (name, first_name, last_name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, 1)",
            (name, first_name, last_name, email, hash_password(password)),
        )
    else:
        cur = conn.execute(
            "INSERT INTO users (first_name, last_name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)",
            (first_name, last_name, email, hash_password(password)),
        )
    conn.commit()
    conn.close()
    return jsonify({"id": cur.lastrowid, "message": "Admin account created"}), 201


# ------------------------------------------------------------------ orders
@app.post("/api/orders")
@login_required
def create_order(user):
    d = request.get_json(silent=True) or {}
    items = d.get("items", [])
    if not items:
        return jsonify({"error": "Cart is empty"}), 400
    if not d.get("delivery_address") or not d.get("phone"):
        return jsonify({"error": "Delivery address and phone are required"}), 400

    conn = get_db()
    total, validated = 0.0, []
    for item in items:
        product_id = item.get("product_id", item.get("id"))
        p = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if p is None:
            conn.close()
            return jsonify({"error": "Product not found"}), 404
        try:
            qty = int(item.get("quantity", 0))
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "Invalid quantity"}), 400
        if qty <= 0:
            conn.close()
            return jsonify({"error": "Quantity must be positive"}), 400
        if qty > p["stock"]:
            conn.close()
            return jsonify({"error": f"Not enough stock for {p['name']}"}), 400
        total += p["price"] * qty  # computed here, server-side -- never trust the browser
        validated.append((p, qty))

    total += 0 if total >= 25000 else 1500

    # Payment stays pending until Paystack confirms the transaction.
    status = "pending"
    payment_ref = d.get("payment_reference")

    cur = conn.execute(
        "INSERT INTO orders (user_id, total, status, payment_ref, delivery_address, phone)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (user["id"], total, status, payment_ref, d.get("delivery_address", ""), d.get("phone", "")),
    )
    order_id = cur.lastrowid
    for p, qty in validated:
        conn.execute(
            "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)"
            " VALUES (?, ?, ?, ?, ?)",
            (order_id, p["id"], p["name"], p["price"], qty),
        )
        conn.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, p["id"]))

    conn.commit()
    conn.close()
    return jsonify({"order_id": order_id, "total": total, "status": status}), 201


@app.get("/api/orders")
@login_required
def list_orders(user):
    conn = get_db()
    orders = conn.execute(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", (user["id"],)
    ).fetchall()
    result = []
    for o in orders:
        items = conn.execute(
            "SELECT product_id, product_name, unit_price, quantity FROM order_items WHERE order_id = ?",
            (o["id"],),
        ).fetchall()
        row = dict(o)
        row["items"] = [dict(i) for i in items]
        result.append(enrich_order(row))
    conn.close()
    return jsonify(result)


@app.get("/api/admin/orders")
@admin_required
def list_all_orders(user):
    conn = get_db()
    orders = conn.execute(
        """SELECT o.*, u.first_name, u.last_name, u.email, u.phone as user_phone 
           FROM orders o 
           JOIN users u ON o.user_id = u.id 
           ORDER BY o.id DESC"""
    ).fetchall()
    result = []
    for o in orders:
        items = conn.execute(
            "SELECT product_id, product_name, unit_price, quantity FROM order_items WHERE order_id = ?",
            (o["id"],),
        ).fetchall()
        row = dict(o)
        row["items"] = [dict(i) for i in items]
        result.append(enrich_order(row))
    conn.close()
    return jsonify(result)


@app.get("/api/admin/users")
@admin_required
def list_all_users(user):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, first_name, last_name, email, phone, address, is_admin, created_at FROM users ORDER BY id DESC"
    ).fetchall()
    result = []
    for row in rows:
        full_name = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip()
        result.append({
            "id": row["id"],
            "first_name": row["first_name"] or "",
            "last_name": row["last_name"] or "",
            "full_name": full_name,
            "email": row["email"],
            "phone": row["phone"] or "Not provided",
            "address": row["address"] or "Not provided",
            "is_admin": bool(row["is_admin"]),
            "created_at": row["created_at"],
        })
    conn.close()
    return jsonify(result)


@app.get("/api/admin/summary")
@admin_required
def admin_summary(user):
    conn = get_db()
    totals = {
        "products": conn.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"],
        "users": conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"],
        "orders": 0,
        "pending_orders": 0,
    }
    rows = conn.execute("SELECT status, created_at FROM orders").fetchall()
    for row in rows:
        lifecycle_status = get_lifecycle_status(row["status"], row["created_at"])
        if lifecycle_status == "delivered":
            totals["orders"] += 1
        elif lifecycle_status != "cancelled":
            totals["pending_orders"] += 1
    conn.close()
    return jsonify(totals)


@app.delete("/api/admin/orders/<int:order_id>")
@admin_required
def delete_order(user, order_id):
    conn = get_db()
    existing = conn.execute("SELECT id, status, created_at FROM orders WHERE id = ?", (order_id,)).fetchone()
    if existing is None:
        conn.close()
        return jsonify({"error": "Order not found"}), 404

    effective_status = get_lifecycle_status(existing["status"], existing["created_at"])
    if effective_status == "delivered":
        conn.close()
        return jsonify({"error": "Delivered orders are archived and cannot be deleted."}), 400

    conn.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
    conn.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Order deleted"})


@app.post("/api/initialize-payment")
@login_required
def initialize_payment_endpoint(user):
    """Initialize Paystack payment and return authorization URL"""
    d = request.get_json(silent=True) or {}
    amount = d.get("amount")
    reference = d.get("reference")
    callback_url = d.get("callback_url")

    if not amount or not reference:
        return jsonify({"error": "Amount and reference are required"}), 400

    email = user.get("email")
    if not email:
        return jsonify({"error": "User email not found"}), 400

    success, result = initialize_payment(email, amount, reference, callback_url)
    if success:
        return jsonify(result)
    else:
        return jsonify({"error": result.get("error", "Payment initialization failed")}), 400


@app.post("/api/verify-payment")
@login_required
def verify_payment_endpoint(user):
    """Verify Paystack payment and update order status"""
    d = request.get_json(silent=True) or {}
    reference = d.get("reference")

    if not reference:
        return jsonify({"error": "No reference provided"}), 400

    conn = get_db()
    order = conn.execute(
        "SELECT id, total, status FROM orders WHERE payment_ref = ? AND user_id = ?",
        (reference, user["id"]),
    ).fetchone()
    conn.close()
    if order is None:
        return jsonify({"error": "Order for this payment reference was not found"}), 404

    # Verify payment with Paystack
    success, payment_data = verify_payment(reference)

    if success:
        paid_amount = payment_data.get("amount")
        expected_amount = round(order["total"] * 100)
        if paid_amount is not None and int(paid_amount) != expected_amount:
            return jsonify({"success": False, "error": "Payment amount does not match the order total"}), 400
        conn = get_db()
        conn.execute(
            "UPDATE orders SET status = 'paid' WHERE payment_ref = ? AND user_id = ? AND status != 'paid'",
            (reference, user["id"]),
        )
        conn.commit()
        conn.close()
        return jsonify({"success": True, "payment_data": payment_data})
    else:
        return jsonify({"success": False, "error": payment_data.get("error", "Payment verification failed")}), 400


# ----------------------------------------------------------------- reviews
@app.post("/api/products/<int:pid>/reviews")
@login_required
def add_review(user, pid):
    conn = get_db()
    product = conn.execute("SELECT id FROM products WHERE id = ?", (pid,)).fetchone()
    if product is None:
        conn.close()
        return jsonify({"error": "Product not found"}), 404

    d = request.get_json(silent=True) or {}
    try:
        rating = int(d.get("rating", 0))
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"error": "Rating must be a number from 1-5"}), 400
    if rating < 1 or rating > 5:
        conn.close()
        return jsonify({"error": "Rating must be 1-5"}), 400

    conn.execute(
        "INSERT INTO reviews (product_id, user_id, user_name, rating, comment)"
        " VALUES (?, ?, ?, ?, ?)"
        " ON CONFLICT(product_id, user_id)"
        " DO UPDATE SET rating = excluded.rating, comment = excluded.comment",
        (pid, user["id"], f"{user['first_name']} {user['last_name']}".strip(), rating, d.get("comment", "")),
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Review saved"}), 201


@app.get("/api/products/<int:pid>/reviews")
def get_reviews(pid):
    conn = get_db()
    rows = conn.execute(
        "SELECT user_name, rating, comment, created_at FROM reviews"
        " WHERE product_id = ? ORDER BY created_at DESC", (pid,),
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ----------------------------------------------------------------- error paths
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Something went wrong on our end"}), 500


if __name__ == "__main__":
    init_db()
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", host="0.0.0.0", port=5000)