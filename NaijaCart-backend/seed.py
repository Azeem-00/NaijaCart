import os

from database import get_db, init_db
from auth import hash_password

PRODUCTS = [
  
    ("Ankara Fabric (6 yards)", "Premium wax print cotton fabric, vibrant Nigerian patterns", 18000, "Fashion", "assets/img/ankara.jpeg", 45),
    ("Adire Dress (Kampala)", "Traditional tie-dye dress, handcrafted in Abeokuta", 35000, "Fashion", "assets/img/kampala.jpeg", 30),
    ("Senator Suit Set", "Classic Nigerian men's wear, includes top and trousers", 22000, "Fashion", "assets/img/senator.jpeg", 25),
    ("Gele Headtie (Royal)", "Premium quality head wrap, stiff fabric for perfect shape", 6500, "Fashion", "assets/img/gele.jpeg", 60),
    ("Native Fan", "Traditional coral fan ", 12000, "Fashion", "assets/img/fan.jpeg", 20),
    ("Kaftan (Embroidered)", "Elegant traditional wear with intricate embroidery", 28000, "Fashion", "assets/img/kaftan.jpeg", 35),
    ("Swiss Voile Lace (5 yards)", "Premium lace material for special occasions", 45000, "Fashion", "assets/img/lace.jpeg", 15),

    ("Ofada Rice (5kg)", "Locally grown from Ogun State, nutritious and aromatic", 8500, "Groceries", "assets/img/Ofada rice.jpeg", 120),
    ("Palm Oil (5L)", "Premium red palm oil, cholesterol-free", 9500, "Groceries", "assets/img/5 litres of Palm Oil.jpeg", 80),
    ("Garri (Ijebu) - 2kg", "Crispy white cassava flour, perfect for eba", 2500, "Groceries", "assets/img/garri.jpeg", 200),
    ("Pure Honey (500ml)", "100% natural Nigerian honey, no additives", 5500, "Groceries", "assets/img/honey.jpeg", 55),
    ("Plantain Chips (Big Pack)", "Crunchy salted plantain chips, locally made", 1500, "Groceries", "assets/img/plantain.jpeg", 150),
    ("Egusi Seeds (1kg)", "Melon seeds for traditional soups, shelled", 4500, "Groceries", "assets/img/egusi.jpeg", 90),
    ("Groundnut Oil (1L)", "Refined peanut oil for cooking, high smoke point", 3500, "Groceries", "assets/img/groundnutoil.jpeg", 100),

    ("Tecno Spark 20", "6.6-inch HD display, 128GB storage, 8GB RAM, dual SIM", 135000, "Electronics", "assets/img/spark20.jpeg", 25),
    ("Infinix Hot 60", "6.78-inch display, 128GB storage, 5000mAh battery", 240000, "Electronics", "assets/img/hot60.jpeg", 30),
    ("Oraimo FreePods 3", "Wireless earbuds with ANC, 24hr battery life", 22000, "Electronics", "assets/img/oraimo.jpeg", 50),
    ("Xiaomi Power Bank 20000mAh", "Fast charging portable charger, dual output", 18000, "Electronics", "assets/img/powerbank.jpeg", 40),
    ("Samsung Smart TV 43-inch", "Full HD LED TV, smart features, built-in WiFi", 275000, "Electronics", "assets/img/Samsung tv.jpeg", 15),
    ("Hisense Single Door Fridge", "95L capacity, energy efficient, frost-free", 145000, "Electronics", "assets/img/fridge.jpg", 20),
    ("Sumec Firman Generator 2.5KVA", "Portable petrol generator, reliable backup power", 185000, "Electronics", "assets/img/sumec.jpeg", 18),
]

def seed():
    admin_email = os.getenv("NAIJACART_ADMIN_EMAIL", "").strip().lower()
    admin_password = os.getenv("NAIJACART_ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        raise SystemExit(
            "Set NAIJACART_ADMIN_EMAIL and NAIJACART_ADMIN_PASSWORD before running seed.py."
        )

    init_db()
    conn = get_db()

    conn.execute("DELETE FROM order_items")
    conn.execute("DELETE FROM orders")
    conn.execute("DELETE FROM reviews")
    conn.execute("DELETE FROM users")
    conn.execute("DELETE FROM products")
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('users', 'products', 'orders', 'order_items', 'reviews')")

    conn.execute(
        "INSERT INTO users (first_name, last_name, email, phone, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, 1)",
        ("Store", "Admin", admin_email, "", hash_password(admin_password)),
    )

    for p in PRODUCTS:
        conn.execute(
            "INSERT INTO products (name, description, price, category, image_url, stock) VALUES (?, ?, ?, ?, ?, ?)",
            p,
        )

    conn.commit()
    product_count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0]
    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    print(f"Seed complete: {user_count} user(s), {product_count} product(s), {admin_count} admin account(s) in database.")
    conn.close()

if __name__ == "__main__":
    seed()