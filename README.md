# NaijaCart

NaijaCart is a full-stack Nigerian marketplace for groceries, fashion, and electronics. It includes a customer storefront, persistent cart, checkout, reviews, profile management, and an admin dashboard.

**Stack:** Flask and SQLite - HTML, CSS, and vanilla JavaScript ES modules

## Project structure

```text
NaijaCart/
|-- NaijaCart-backend/
|   |-- app.py             # Flask REST API and route handlers
|   |-- auth.py            # Password hashing and bearer-token auth
|   |-- database.py        # SQLite connection and schema initialization
|   |-- email_verify.py    # Email validation
|   |-- order_status.py    # Order lifecycle status helpers
|   |-- payments.py        # Paystack initialization and verification
|   |-- schema.sql         # Database tables and indexes
|   |-- seed.py            # Sample products and admin account
|   |-- requirements.txt
|   `-- uploads/           # Uploaded product images
`-- naijacart-frontend/
    |-- index.html         # Storefront and authentication
    |-- cart.html
    |-- checkout.html
    |-- confirmation.html
    |-- profile.html
    |-- admin.html         # Admin dashboard
    |-- css/styles.css
    |-- js/
    |   |-- api.js         # Backend requests and Paystack public key
    |   |-- app.js         # Storefront behavior
    |   |-- auth.js        # Login, registration, and session state
    |   |-- cart.js        # Cart state in localStorage
    |   |-- cart-page.js
    |   |-- checkout.js
    |   |-- confirmation.js
    |   |-- profile-page.js
    |   |-- admin.js
    |   `-- toast.js
    `-- assets/img/        # Product and interface images
```

## Setup and usage

### Backend

From the project root, open PowerShell and run:

```powershell
cd NaijaCart-backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python seed.py
python app.py
```

The API runs at `http://127.0.0.1:5000`. `seed.py` creates `NaijaCart-backend/naijacart.db` if it does not exist, initializes the schema, clears the seeded tables, and inserts the sample catalogue and the admin account configured by those environment variables. It requires both variables and does not contain a default admin password.

### Frontend

Open a second PowerShell terminal:

```powershell
cd naijacart-frontend
python -m http.server 5500
```

Visit `http://127.0.0.1:5500` in a browser. The backend allows local frontend origins on ports 5500-5510 and 8000-8010, as well as several common development ports.

### Admin account

The admin credentials are the values you set in `NAIJACART_ADMIN_EMAIL` and `NAIJACART_ADMIN_PASSWORD`. Never publish those values in the README or commit them to Git.

## Payments

Checkout supports Paystack card, bank transfer, and USSD payments, plus pay on delivery. Live Paystack initialization and verification require the backend environment variable `PAYSTACK_SECRET_KEY`. The frontend test public key is configured in `naijacart-frontend/js/api.js`.

For local development without a secret key, the backend only accepts payment references beginning with `SIM-` as simulated payments. The normal frontend checkout generates `NJC-` references, so use pay on delivery locally unless you configure Paystack or deliberately exercise the simulation path.

## REST API

All protected endpoints use `Authorization: Bearer <token>`.

| Method          | Endpoint                     | Access        | Purpose                                |
| --------------- | ---------------------------- | ------------- | -------------------------------------- |
| GET             | `/api/products`              | Public        | List, search, filter, or sort products |
| GET             | `/api/products/<id>`         | Public        | Get one product                        |
| POST/PUT/DELETE | `/api/products[/<id>]`       | Admin         | Manage products                        |
| POST            | `/api/uploads`               | Admin         | Upload a product image                 |
| POST            | `/api/auth/register`         | Public        | Create a customer account              |
| POST            | `/api/auth/login`            | Public        | Authenticate and receive a token       |
| PUT             | `/api/auth/profile`          | Authenticated | Update name and address                |
| POST            | `/api/admins`                | Admin         | Create another admin account           |
| POST            | `/api/orders`                | Authenticated | Create an order and reserve stock      |
| GET             | `/api/orders`                | Authenticated | View your order history                |
| GET/DELETE      | `/api/admin/orders[/<id>]`   | Admin         | View or delete orders                  |
| GET             | `/api/admin/users`           | Admin         | View registered users                  |
| GET             | `/api/admin/summary`         | Admin         | View dashboard totals                  |
| POST            | `/api/initialize-payment`    | Authenticated | Start a Paystack payment               |
| POST            | `/api/verify-payment`        | Authenticated | Verify a Paystack payment              |
| GET/POST        | `/api/products/<id>/reviews` | Public/Auth   | View or save a product review          |
| GET             | `/uploads/<filename>`        | Public        | Serve an uploaded image                |

## Implemented features

- Product browsing with search, category filtering, and price/rating sorting
- Persistent cart with quantity controls and selected-item checkout
- Customer registration, login, bearer tokens, failed-login lockout, and profiles
- Server-side price, delivery fee, and stock validation
- Paystack payment verification and pay-on-delivery checkout
- Order history, automatic lifecycle status, and confirmation page
- Product reviews with one editable review per customer and product
- Admin product CRUD, image uploads, order management, user list, and summary
- SQLite foreign keys, indexes, CORS, and structured HTTP error responses
