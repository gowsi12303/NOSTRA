# NOSTRA — Fashion E-commerce Platform

## Overview

NOSTRA is a Full Stack Python/Django e-commerce backend project built to
demonstrate real-world backend engineering: authentication, catalog
browsing, cart/wishlist management, checkout with stock control, order
lifecycle management, and a payment-attempt flow — all exposed as a JSON
REST API built with Django REST Framework.

This is a backend-focused portfolio project. It currently has no frontend
UI; it is designed to be consumed by a future frontend or by API clients
such as Postman/curl.

## Project Status

**🚧 In Progress**

This project is under active development. It is not production-ready and
is not deployed. Features are being added and refined incrementally; see
[Planned / Upcoming Features](#planned--upcoming-features) for what's not
built yet.

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
- **Payment attempt / status APIs** — create payment attempts and advance
  their status through a controlled state machine (see
  [Payment](#payment))
- **Admin/staff-only order status management** — order fulfillment status
  can only be updated by staff users
- **API documentation** — see [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

## Tech Stack

- **Python**
- **Django** (6.1)
- **Django REST Framework**
- **djangorestframework-simplejwt** — JWT authentication
- **SQLite** — current development database
- **django-filter** — product filtering
- **Pillow** — image handling for product images
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

- **262 tests passing**
- `python manage.py check` passes with no issues

Tests cover authentication, product/category browsing, cart, wishlist,
addresses, order placement and lifecycle, and payment attempt/status
behavior, including ownership scoping, permission checks, and status
transition rules.

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
- Admin-only order status updates, enforced with DRF's `IsAdminUser`
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

## Planned / Upcoming Features

- Real payment gateway integration (Razorpay/Stripe)
- Frontend UI
- Production PostgreSQL setup
- Deployment
- NOSTRA StyleMatch
- Virtual Wardrobe

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

## API Base URLs

- `/api/accounts/` — registration and JWT login
- `/api/products/` — products, categories, cart, wishlist, addresses,
  orders, and payments

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for the full list of
endpoints under each prefix.
