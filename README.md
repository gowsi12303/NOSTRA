# NOSTRA — Fashion E-commerce Platform

## Overview

NOSTRA is a full-stack fashion e-commerce platform built to demonstrate
real-world engineering across the whole stack: a Python/Django REST
Framework backend (authentication, catalog browsing, cart/wishlist
management, checkout with stock control, order lifecycle management, and
a payment-attempt flow, all exposed as a JSON REST API) paired with a
React (Vite) frontend that provides a customer storefront and a
staff-only admin dashboard.

## Project Status

**✅ Functionally complete (customer + admin) — not yet production-hardened or deployed**

The customer storefront, the staff-only admin dashboard, and the Django
REST Framework API are functionally complete. What remains is production
hardening and deployment — see [Production Readiness
Notes](#production-readiness-notes) and [Planned / Upcoming
Features](#planned--upcoming-features) for what's still ahead.

## Key Implemented Features

- **Customer authentication** — registration and login
- **JWT authentication** — via `djangorestframework-simplejwt`
- **Product and category APIs** — public, read-only browsing endpoints
- **Product search, filtering, sorting, and pagination** — search by name,
  filter by category/price range, sort by price, paginated results
- **Product variants** — size/color combinations with independent stock
- **Cart** — add, update quantity, remove items, with stock validation
- **Wishlist** — add/remove/list products
- **Address management** — multiple saved addresses with a single default
- **Order placement** — checkout from the cart into an `Order`
- **Order management** — list/view own orders; controlled status updates
- **Order cancellation** — customers can cancel their own `pending`/
  `confirmed` orders; stock is restored automatically
- **Payment attempt / status APIs** — create payment attempts and advance
  their status through a controlled state machine (see
  [Payment](#payment))
- **Admin/staff-only order status management** — order fulfillment status
  can only be updated by staff users
- **API documentation** — see [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- **Customer frontend** — a React (Vite) storefront covering product
  browsing with pagination, product detail, cart, wishlist, address book,
  checkout, order history, customer-initiated order cancellation (for
  `pending`/`confirmed` orders), and a Pay Now / payment-attempt UI
- **Admin frontend** — a staff-only React dashboard with a summary
  Dashboard, full management screens for Categories, Products, and
  Variants/Inventory, and read-only browsing screens for Orders,
  Customers, and Payments

## Tech Stack

- **Python**
- **Django** (6.1)
- **Django REST Framework**
- **djangorestframework-simplejwt** — JWT authentication
- **SQLite** — current development database
- **django-filter** — product filtering
- **Pillow** — image handling for product images
- **React 19** — customer and admin frontends
- **React Router 7** — client-side routing
- **Vite** — frontend build tooling and dev server
- Plain scoped CSS — no UI framework, light/dark aware
- **Git / GitHub** — version control

## API Documentation

Full endpoint-by-endpoint documentation lives in
[API_DOCUMENTATION.md](API_DOCUMENTATION.md). It covers every currently
implemented endpoint's HTTP method, URL, authentication requirement,
request/response bodies, status codes, permissions, and the order/payment
status transition rules.

## Project Structure

```
NOSTRA/
├── config/                 # Django project settings, root URLconf, WSGI
├── accounts/                # Custom user model, registration, JWT login
├── products/                 # Core app: products, cart, wishlist,
│                              # addresses, orders, payments
├── frontend/                  # React (Vite) app — customer storefront +
│                               # staff-only admin dashboard
├── API_DOCUMENTATION.md      # Full API reference
├── manage.py                 # Django management entry point
└── requirements.txt           # Python dependencies
```

## Authentication

- **Registration** — `POST /api/accounts/register/` creates a new user
  account (username, email, password).
- **JWT login** — `POST /api/accounts/login/` exchanges username/password
  for a JWT access + refresh token pair (via SimpleJWT's
  `TokenObtainPairView`).
- **Bearer access token** — every authenticated endpoint requires
  `Authorization: Bearer <access token>`. Missing/invalid tokens return
  `401 Unauthorized`.
- **Staff/admin permission** — the order status update endpoint
  additionally requires `is_staff=True`; authenticated non-staff users
  receive `403 Forbidden`.

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for full details per
endpoint.

## Testing

- **407 tests passing**
- `python manage.py check` passes with no issues

Tests cover authentication, product/category browsing, cart, wishlist,
addresses, order placement and lifecycle, and payment attempt/status
behavior, including ownership scoping, permission checks, and status
transition rules.

There is currently no automated frontend test suite and no CI/CD
pipeline — these 407 backend tests run only when invoked manually.

## Engineering Highlights

- `transaction.atomic()` and `select_for_update()` used to guard
  concurrency-sensitive operations (cart updates, checkout, order status
  updates, payment creation/status updates)
- Stock validation and atomic, race-safe stock decrement during checkout
- Ownership scoping on every user-owned resource (cart, wishlist,
  addresses, orders, payments), returning `404` rather than leaking the
  existence of another user's data
- Optimized querysets — `select_related`/`prefetch_related` used for
  product listings and order retrieval to avoid N+1 queries
- Controlled, one-way order and payment status state machines — only
  explicitly allowed transitions succeed; everything else is rejected
  with `400 Bad Request`
- All staff-only endpoints — order status updates, plus the admin
  category, product, variant/inventory, order-list, and
  customer-browsing APIs — are enforced with DRF's `IsAdminUser`
  permission

## Database

SQLite is currently used for local development. PostgreSQL can be
considered for a future production deployment, but it is **not**
currently configured — the project runs on SQLite only at this stage.

## Payment

A payment API/backend flow exists: an authenticated user can create a
payment attempt for their own order and advance its status through a
controlled state machine (`pending` → `processing` → `paid`, etc.).
`manual`, `razorpay`, and `stripe` are currently accepted only as
**provider labels** on a `Payment` record.

**There is no real Razorpay or Stripe gateway integration.** No external
payment service is called, and no real payment processing occurs — status
changes are made directly through the API for development/testing
purposes.

The customer frontend now includes a **Pay Now** action and a payment
attempt status/history display on each order, using the `manual` provider
value against this same endpoint. **It does not collect or process real
card/payment details** — it only records a payment attempt and its
status, exactly as described above.

## Planned / Upcoming Features

- Real payment gateway integration (Razorpay/Stripe)
- Production PostgreSQL setup
- Deployment
- Automated frontend tests + CI/CD
- NOSTRA StyleMatch
- Virtual Wardrobe

## Production Readiness Notes

This project is **not** yet production-ready. Known gaps that should be
addressed before any real deployment:

- `DEBUG = True` is currently hardcoded in `config/settings.py` (not
  environment-controlled), and `ALLOWED_HOSTS` is empty — both need
  fixing together before deploying
- No HTTPS/security-hardening settings are configured yet
  (`SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`,
  HSTS)
- No request rate-limiting/throttling on authentication endpoints
- No refresh-token blacklist/rotation — logout only clears the token
  client-side
- No CI/CD pipeline (see [Testing](#testing))
- SQLite is used for local development only; PostgreSQL is not yet
  configured (see [Database](#database))
- No real payment gateway integration — see [Payment](#payment)

## Installation / Local Setup (Windows)

```powershell
# Clone the repository
git clone https://github.com/gowsi12303/NOSTRA.git
cd NOSTRA

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
copy .env.example .env
# then edit .env with your own SECRET_KEY, etc.

# Apply database migrations
python manage.py migrate

# Create an admin/staff user
python manage.py createsuperuser

# Run the development server
python manage.py runserver
```

### Frontend setup

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

The frontend dev server runs at `http://localhost:5173` and expects the
backend running at `http://localhost:8000` (override via
`VITE_API_BASE_URL` in `frontend/.env.local` — see
`frontend/.env.example`).

## API Base URLs

- `/api/accounts/` — registration and JWT login
- `/api/products/` — products, categories, cart, wishlist, addresses,
  orders, and payments

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for the full list of
endpoints under each prefix.
