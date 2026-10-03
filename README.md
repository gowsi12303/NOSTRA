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

**✅ Functionally complete (customer + admin) and production-hardened — not yet deployed**

The customer storefront, the staff-only admin dashboard, and the Django
REST Framework API are functionally complete, and the backend
configuration has been hardened for production. Render is the chosen
host and the deployment is described in [`render.yaml`](render.yaml), but
nothing is live yet — see [Deployment](#deployment) and [Production
Readiness Notes](#production-readiness-notes) for what is still open.

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
- **SQLite** — local development database
- **PostgreSQL** (via `psycopg`) — production database, selected by
  `DATABASE_URL`
- **django-filter** — product filtering
- **Pillow** — image handling for product images
- **WhiteNoise** + **Gunicorn** — static file serving and WSGI server for
  production
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
- **Token refresh with rotation** — `POST /api/accounts/token/refresh/`
  returns a new access token *and* a new refresh token; the refresh token
  just used is blacklisted, so each one works once. The frontend refreshes
  automatically on a `401` and retries the request.
- **Logout** — `POST /api/accounts/logout/` blacklists the supplied
  refresh token server-side.
- **Staff/admin permission** — the order status update endpoint
  additionally requires `is_staff=True`; authenticated non-staff users
  receive `403 Forbidden`.

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for full details per
endpoint.

## Testing

- **434 tests passing** (run on SQLite)
- `python manage.py check` passes with no issues

Tests cover authentication (including refresh-token rotation and
logout), product/category browsing, cart, wishlist, addresses, order
placement and lifecycle, payment attempt/status behavior, media storage,
and the health endpoint, including ownership scoping, permission checks,
and status transition rules.

There is currently no automated frontend test suite and no CI/CD
pipeline — these backend tests run only when invoked manually.

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

SQLite is used for local development and needs no setup. Production is
meant to run on PostgreSQL: setting `DATABASE_URL` switches the backend
to it, with no code change. The configuration and the generated SQL have
been validated offline, but **the application has not yet been run
against a real PostgreSQL server** — that remains to be done on the
first deployment.

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
- Deploying to Render and validating against its PostgreSQL
- Automated frontend tests + CI/CD
- NOSTRA StyleMatch
- Virtual Wardrobe

## Production Readiness Notes

The backend is configured for production entirely through environment
variables (documented in [`.env.example`](.env.example)):

- `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, CORS and CSRF origins
- HTTPS redirect, HSTS, secure cookies, and reverse-proxy awareness
- PostgreSQL via `DATABASE_URL`, with connection reuse and health checks
- Static files through WhiteNoise; uploaded media through a selectable
  storage backend
- API locked down by default (`IsAuthenticated`), JSON-only in
  production, with rate limits on login and registration
- JWT refresh-token rotation, blacklist, and server-side logout
- Console logging, optional error emails, and SMTP email

Still open before or during a real deployment:

- **Not deployed yet** — Render is the chosen host and
  [`render.yaml`](render.yaml) describes the deployment, but the services
  have not been created (see [Deploying on Render](#deploying-on-render))
- **PostgreSQL has not been tested against a real server** (see
  [Database](#database))
- **No media bucket chosen** — production product images need an
  S3-compatible bucket; the code supports one, no provider is selected
- Rate limits are counted per server process; a shared cache is needed
  for them to be exact across several workers
- No CI/CD pipeline (see [Testing](#testing))
- No real payment gateway integration — see [Payment](#payment)

## Deployment

The requirements below apply to any host. The Render-specific setup
follows in [Deploying on Render](#deploying-on-render).

**Backend**

1. Install dependencies: `pip install -r requirements.txt`
2. Set the environment variables. At minimum: `SECRET_KEY` (a fresh
   value), `DEBUG=False`, `ALLOWED_HOSTS`, `DATABASE_URL`,
   `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS`. Behind an HTTPS
   proxy also `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS`, and
   `USE_PROXY_SSL_HEADER`. Every variable is described in
   [`.env.example`](.env.example).
3. Create the database tables: `python manage.py migrate`
4. Collect static files: `python manage.py collectstatic --noinput`
5. Start the WSGI application `config.wsgi:application`, for example
   `gunicorn config.wsgi:application` (Gunicorn runs on Linux/macOS, not
   Windows).

Run steps 3 and 4 on every deploy. `GET /health/` returns
`{"status": "ok"}` for the host's health checks; it needs no
authentication and is exempt from the HTTPS redirect, but the probe's
`Host` header must still be listed in `ALLOWED_HOSTS`.

**Media.** Django does not serve uploaded product images when
`DEBUG=False`. Either mount a persistent disk at `MEDIA_ROOT` and have
the web server serve it at `MEDIA_URL`, or use S3-compatible object
storage by setting `MEDIA_STORAGE_BACKEND=storages.backends.s3.S3Storage`
and the `S3_*` variables.

**Frontend**

1. Set `VITE_API_BASE_URL` to the deployed backend's HTTPS origin in the
   build environment (see `frontend/.env.example`). If it is unset, the
   built app calls the API on its own origin.
2. Build: `npm ci` then `npm run build` in `frontend/`
3. Serve the generated `frontend/dist/` as static files, with every
   unknown path falling back to `index.html` (client-side routing).

The frontend's origin must be listed in the backend's
`CORS_ALLOWED_ORIGINS`.

### Deploying on Render

[`render.yaml`](render.yaml) is a Render Blueprint that creates four
resources from this repository:

| Resource | What it is |
|---|---|
| `nostra-db` | Render Postgres |
| `nostra-api` | Django API on Gunicorn; `/health/` is its health check |
| `nostra-web` | The React frontend as a static site |
| `nostra-flush-tokens` | Daily cron job running `flushexpiredtokens` |

It uses Render's smallest **paid** plans in the Singapore region:
migrations run in the pre-deploy command and the token cleanup runs as a
cron job, and neither is available on free instances. For the API,
dependencies and `collectstatic` run in the build command, `migrate` in
the pre-deploy command, and `gunicorn config.wsgi:application` starts it.
The file contains no secrets: `SECRET_KEY` is generated by Render and
`DATABASE_URL` is injected from the database.

To deploy:

1. Push the repository to GitHub and create a new Blueprint from it in
   the Render Dashboard.
2. Render asks for the values it cannot know. They can be left blank at
   first and filled in once the services have URLs:
   - `CORS_ALLOWED_ORIGINS` on `nostra-api` — the frontend's URL
   - `VITE_API_BASE_URL` on `nostra-web` — the API's URL
   - `MEDIA_STORAGE_BACKEND` and the `S3_*` values — once a bucket exists
3. After the first deploy, copy each service's `onrender.com` URL into
   the two variables above, then redeploy `nostra-web` (the API URL is
   baked in at build time).
4. Create an admin user from the API service's shell:
   `python manage.py createsuperuser`

The API trusts its own `onrender.com` hostname automatically. A custom
domain must be added to `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`.

Until an S3-compatible bucket is configured, uploaded product images are
written to the service's temporary disk and disappear on the next deploy.

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
# then edit .env: set your own SECRET_KEY and keep DEBUG=True

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
