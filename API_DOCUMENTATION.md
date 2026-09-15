# NOSTRA API Documentation

This document describes the API endpoints that currently exist in the NOSTRA
backend, as implemented in the codebase. It documents only what is
implemented today — no planned, future, or aspirational functionality is
included.

## 1. Overview

NOSTRA is a Django REST Framework backend for a fashion e-commerce
application. It exposes JSON APIs for:

- Account registration, JWT login, and JWT token refresh
- Browsing products and categories
- Managing a per-user cart and wishlist
- Managing shipping addresses
- Placing, viewing, and self-service cancelling orders
- Creating payment attempts for an order and updating their status
  (development/testing only — no real payment gateway is integrated)
- A full staff/admin management surface: orders (read), products, categories,
  product variants/inventory, and customer accounts

All endpoints are mounted under two root prefixes:

- `/api/accounts/` — registration, login, token refresh, and admin customer
  management (see [accounts/urls.py](accounts/urls.py))
- `/api/products/` — everything else: products, categories, cart, wishlist,
  addresses, orders, payments, and admin product/category/variant/order
  management (see [products/urls.py](products/urls.py))

Authentication is JWT-based, provided by `djangorestframework-simplejwt`.
The project's `REST_FRAMEWORK` setting configures `JWTAuthentication` as the
only authentication class (see [config/settings.py](config/settings.py)), so
every authenticated endpoint expects a `Bearer` access token, not
session/cookie auth.

All monetary amounts are decimal strings (e.g. `"49.99"`), matching Django
REST Framework's default `DecimalField` serialization.

## 2. Authentication

### 2.1 Registration

**POST** `/api/accounts/register/`

- **Authentication:** none required (`AllowAny`)
- **Request body:**
  ```json
  {
    "username": "janedoe",
    "email": "jane@example.com",
    "password": "SomePassword123"
  }
  ```
- **Successful response:** `201 Created`
  ```json
  {
    "id": 1,
    "username": "janedoe",
    "email": "jane@example.com"
  }
  ```
  (`password` is write-only and never returned.)
- **Important error responses:**
  - `400 Bad Request` — validation errors (e.g. duplicate `username` or
    `email`, missing fields)
- **Description:** Creates a new user account via `RegisterSerializer`
  (`accounts/serializers.py`), using Django's `create_user` so the password
  is hashed. Registration does not log the user in or return a token — use
  the login endpoint afterward. Note: this endpoint does **not** currently
  enforce Django's configured `AUTH_PASSWORD_VALIDATORS` (no minimum
  strength/length check is applied at the API layer beyond `CharField`
  acceptance).

### 2.2 JWT Login

**POST** `/api/accounts/login/`

- **Authentication:** none required (`AllowAny`)
- **Request body:**
  ```json
  {
    "username": "janedoe",
    "password": "SomePassword123"
  }
  ```
- **Successful response:** `200 OK`
  ```json
  {
    "refresh": "<refresh token>",
    "access": "<access token>"
  }
  ```
- **Important error responses:**
  - `401 Unauthorized` — invalid credentials
- **Description:** This is DRF SimpleJWT's built-in `TokenObtainPairView`
  (`accounts/views.py`), unmodified aside from `permission_classes =
  [AllowAny]`. It returns a JWT access/refresh token pair on success.

### 2.3 JWT Token Refresh

**POST** `/api/accounts/token/refresh/`

- **Authentication:** none required (`AllowAny`) — the refresh token itself
  is the credential; no `Authorization` header is needed or checked
- **Request body:**
  ```json
  { "refresh": "<refresh token>" }
  ```
- **Successful response:** `200 OK`
  ```json
  { "access": "<new access token>" }
  ```
- **Important error responses:**
  - `400 Bad Request` — `refresh` field missing
  - `401 Unauthorized` — malformed, expired, or wrong-type token (e.g. an
    access token passed as `refresh`)
- **Description:** SimpleJWT's own, unmodified `TokenRefreshView`, wired
  directly into `accounts/urls.py` with no custom subclass. No settings
  override for token lifetimes exists in `config/settings.py`, so
  SimpleJWT's library defaults apply: access tokens last **5 minutes**,
  refresh tokens last **1 day**. A client should call this endpoint (or
  otherwise handle a `401` on a protected request) to obtain a fresh access
  token without forcing the user to log in again.

### 2.4 Authentication requirement / JWT flow

For every endpoint below marked **Authentication: required**, requests must
include:

```
Authorization: Bearer <access token>
```

- Missing/invalid/expired token → `401 Unauthorized`
- Valid token, but the user lacks the necessary permission (e.g. non-staff
  calling a staff-only endpoint) → `403 Forbidden`

**Typical flow:** `POST /api/accounts/register/` → `POST
/api/accounts/login/` (store `access` + `refresh`) → send `access` as
`Authorization: Bearer <access>` on every authenticated request → when a
request gets `401` because the access token expired, `POST
/api/accounts/token/refresh/` with the stored `refresh` token to obtain a
new `access` token, then retry the original request → once the refresh
token itself expires (1 day by default), the user must log in again.

## 3. Products APIs (public)

### 3.1 List products

**GET** `/api/products/`

- **Authentication:** none required (`AllowAny`)
- **Query parameters:**
  - `category` — filter by category id
  - `min_price` / `max_price` — filter by `Product.price` (`gte`/`lte`)
  - `search` — substring search on `Product.name`
  - `ordering` — `price` or `-price`
  - `page`, `page_size` — pagination (see [§15](#15-pagination-behavior))
- **Successful response:** `200 OK` — a paginated list of products
  serialized by `ProductSerializer`
- **Description:** Returns only `is_active=True` products, with `category`,
  `images`, `sizes`, `colors`, and `variants` nested. Implemented by
  `ProductListView`.

### 3.2 Product detail

**GET** `/api/products/<int:pk>/`

- **Authentication:** none required (`AllowAny`)
- **Successful response:** `200 OK` — a single product via
  `ProductSerializer`
- **Important error responses:**
  - `404 Not Found` — product does not exist or `is_active=False`
- **Description:** Implemented by `ProductDetailView`, scoped to active
  products only.

`ProductSerializer` fields: `id`, `name`, `description`, `price`,
`category` (nested `CategorySerializer`, read-only), `images`, `sizes`,
`colors`, `variants`, `is_active`, `created_at`, `updated_at`.

## 4. Categories APIs (public)

### 4.1 List categories

**GET** `/api/products/categories/`

- **Authentication:** none required (`AllowAny`)
- **Successful response:** `200 OK` — a plain (non-paginated) list of
  active categories via `CategorySerializer`
- **Description:** Implemented by `CategoryListView`.

### 4.2 Category detail

**GET** `/api/products/categories/<int:pk>/`

- **Authentication:** none required (`AllowAny`)
- **Successful response:** `200 OK` — a single category via
  `CategorySerializer`
- **Important error responses:**
  - `404 Not Found` — category does not exist or `is_active=False`
- **Description:** Implemented by `CategoryDetailView`.

`CategorySerializer` fields: `id`, `name`, `description`, `is_active`,
`created_at`, `updated_at`.

## 5. Cart APIs

All cart endpoints are scoped to the authenticated user's own cart, which is
created automatically on first access (`Cart.objects.get_or_create`).

### 5.1 Retrieve cart

**GET** `/api/products/cart/`

- **Authentication:** required
- **Successful response:** `200 OK` — the user's cart via `CartSerializer`
- **Description:** Implemented by `CartDetailView`. Creates an empty cart if
  the user has none yet.

### 5.2 Add item to cart

**POST** `/api/products/cart/items/`

- **Authentication:** required
- **Request body:**
  ```json
  { "variant_id": 5, "quantity": 2 }
  ```
- **Successful response:**
  - `201 Created` — a new `CartItem` was created
  - `200 OK` — an existing `CartItem` for that variant had its quantity
    increased instead
  - Body in both cases: the `CartItem` via `CartItemSerializer`
- **Important error responses:**
  - `404 Not Found` — variant does not exist
  - `400 Bad Request` — variant or its product is inactive, or the
    requested (or combined) quantity exceeds `variant.stock_quantity`
- **Description:** Implemented by `CartAddItemView`. Uses
  `transaction.atomic()` + `select_for_update()` on the existing cart item
  (if any) to avoid a race between two concurrent adds.

### 5.3 Update / remove a cart item

**PATCH** `/api/products/cart/items/<int:pk>/`

- **Authentication:** required
- **Request body:** `{ "quantity": 3 }`
- **Successful response:** `200 OK` — the updated `CartItem` via
  `CartItemSerializer`
- **Important error responses:**
  - `404 Not Found` — item does not exist or belongs to another user
  - `400 Bad Request` — quantity exceeds `variant.stock_quantity`
- **Description:** Implemented by `CartItemDetailView.patch`, scoped to
  `cart__user=request.user`.

**DELETE** `/api/products/cart/items/<int:pk>/`

- **Authentication:** required
- **Successful response:** `204 No Content`
- **Important error responses:**
  - `404 Not Found` — item does not exist or belongs to another user
- **Description:** Implemented by `CartItemDetailView.delete`.

`CartSerializer` fields: `id`, `items`, `created_at`, `updated_at`.
`CartItemSerializer` fields: `id`, `variant`, `quantity`, `created_at`,
`updated_at` (`variant` is a nested read-only representation — see
`CartItemVariantSerializer` below).

## 6. Wishlist APIs

### 6.1 List / add wishlist items

**GET** `/api/products/wishlist/`

- **Authentication:** required
- **Successful response:** `200 OK` — a plain list of the user's wishlist
  items via `WishlistItemSerializer`
- **Description:** Implemented by `WishlistListCreateView.get`.

**POST** `/api/products/wishlist/`

- **Authentication:** required
- **Request body:** `{ "product_id": 3 }`
- **Successful response:** `201 Created` — the new `WishlistItem` via
  `WishlistItemSerializer`
- **Important error responses:**
  - `404 Not Found` — product does not exist
  - `400 Bad Request` — product is inactive, or already in the user's
    wishlist
- **Description:** Implemented by `WishlistListCreateView.post`.

### 6.2 Remove a wishlist item

**DELETE** `/api/products/wishlist/<int:pk>/`

- **Authentication:** required
- **Successful response:** `204 No Content`
- **Important error responses:**
  - `404 Not Found` — item does not exist or belongs to another user
- **Description:** Implemented by `WishlistItemDeleteView`, scoped to
  `user=request.user`.

`WishlistItemSerializer` fields: `id`, `product` (nested `id`, `name`,
`price`), `created_at`, `updated_at`.

## 7. Address APIs

### 7.1 List / create addresses

**GET** `/api/products/addresses/`

- **Authentication:** required
- **Successful response:** `200 OK` — the user's addresses (default first,
  then newest) via `AddressSerializer`
- **Description:** Implemented by `AddressListCreateView.get`.

**POST** `/api/products/addresses/`

- **Authentication:** required
- **Request body:**
  ```json
  {
    "full_name": "Jane Doe",
    "phone": "9876543210",
    "address_line1": "123 Main St",
    "address_line2": "",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "postal_code": "600001",
    "country": "India",
    "is_default": true
  }
  ```
  (`country` defaults to `"India"` if omitted; `address_line2` and
  `is_default` are optional.)
- **Successful response:** `201 Created` — the new address via
  `AddressSerializer`
- **Important error responses:**
  - `400 Bad Request` — validation errors (missing required fields, etc.)
- **Description:** Implemented by `AddressListCreateView.post`. If
  `is_default=true`, any previous default address for the user is unset
  first, inside a transaction.

### 7.2 Retrieve / update / delete an address

**GET** `/api/products/addresses/<int:pk>/`

- **Authentication:** required
- **Successful response:** `200 OK` via `AddressSerializer`
- **Important error responses:** `404 Not Found` — not found or belongs to
  another user

**PUT / PATCH** `/api/products/addresses/<int:pk>/`

- **Authentication:** required
- **Request body:** any subset (PATCH) or full set (PUT) of the fields
  listed in 7.1
- **Successful response:** `200 OK` — the updated address
- **Important error responses:** `404 Not Found`; `400 Bad Request` on
  validation errors
- **Description:** Setting `is_default=true` unsets any other default
  address for the user, inside a transaction.

**DELETE** `/api/products/addresses/<int:pk>/`

- **Authentication:** required
- **Successful response:** `204 No Content`
- **Important error responses:** `404 Not Found`
- **Description:** Implemented by `AddressDetailView`, scoped to
  `user=request.user`.

`AddressSerializer` fields: `id`, `full_name`, `phone`, `address_line1`,
`address_line2`, `city`, `state`, `postal_code`, `country`, `is_default`,
`created_at`, `updated_at`.

## 8. Order APIs (customer-facing)

### 8.1 Place order

**POST** `/api/products/orders/place/`

- **Authentication:** required
- **Request body:** `{ "address_id": 4 }` (optional — if omitted, the
  user's default address is used)
- **Successful response:** `201 Created` — the newly created order via
  `OrderSerializer`
- **Important error responses:**
  - `404 Not Found` — `address_id` given but doesn't belong to the user
  - `400 Bad Request` — no `address_id` given and no default address set;
    cart is empty; a variant/product in the cart is no longer active; or
    insufficient stock for a cart item
- **Description:** Implemented by `OrderPlaceView`. Inside one transaction:
  locks the involved `ProductVariant` rows (`select_for_update()`,
  processed in a fixed order to avoid deadlocks), re-validates availability
  and stock against the locked rows, computes `subtotal`/`total_amount`
  from current product prices, snapshots the shipping address fields onto
  the new `Order`, decrements each variant's `stock_quantity` with an
  atomic conditional `UPDATE`, creates the `OrderItem` rows, and empties
  the user's cart. The order is created with `status="pending"`.

### 8.2 List orders

**GET** `/api/products/orders/`

- **Authentication:** required
- **Successful response:** `200 OK` — a plain list of the authenticated
  user's own orders, newest first, via `OrderSerializer`
- **Description:** Implemented by `OrderListView`, scoped to
  `user=request.user`.

### 8.3 Order detail

**GET** `/api/products/orders/<int:pk>/`

- **Authentication:** required
- **Successful response:** `200 OK` via `OrderSerializer`
- **Important error responses:** `404 Not Found` — order does not exist or
  belongs to another user
- **Description:** Implemented by `OrderDetailView`, scoped to
  `user=request.user`.

`OrderSerializer` fields: `id`, `order_number`, `status`,
`shipping_full_name`, `shipping_phone`, `shipping_address_line1`,
`shipping_address_line2`, `shipping_city`, `shipping_state`,
`shipping_postal_code`, `shipping_country`, `subtotal`, `total_amount`,
`items`, `payments`, `created_at`, `updated_at`. (No `user` field — an
order's owner isn't exposed in this representation.)

`items` is a nested list via `OrderItemSerializer`: `id`, `variant`,
`quantity`, `unit_price`, `created_at`.

`payments` is a nested list via `PaymentSerializer` (see [§9](#9-payment-apis)).

### 8.4 Cancel order — customer self-service

**POST** `/api/products/orders/<int:order_id>/cancel/`

- **Authentication:** required
- **Request body:** none
- **Successful response:** `200 OK` — the cancelled order via
  `OrderSerializer`
- **Important error responses:**
  - `401 Unauthorized` — no/invalid token
  - `404 Not Found` — order does not exist or belongs to another user
  - `400 Bad Request` — the order's current status is not eligible for
    cancellation (see [§12](#12-order-status-transition-rules) — only
    `pending`/`confirmed` orders can be cancelled this way; `shipped`,
    `delivered`, and already-`cancelled` orders are rejected)
- **Description:** Implemented by `OrderCancelView` — the customer-facing
  counterpart to the staff-only status-update endpoint below, restricted to
  the same transition rule (an order can only be cancelled from `pending`
  or `confirmed`). Runs inside `transaction.atomic()` with
  `select_for_update()` on the order row, restores each `OrderItem`'s
  quantity back onto its `ProductVariant.stock_quantity`, and does not
  touch `Payment` rows.

### 8.5 Order status update — **admin/staff only**

**PATCH** `/api/products/orders/<int:order_id>/status/`

- **Authentication:** required, **and the user must be staff**
  (`is_staff=True`) — enforced by DRF's `IsAdminUser` permission
- **Request body:** `{ "status": "confirmed" }` — value must be one of
  `Order.Status`: `pending`, `confirmed`, `shipped`, `delivered`,
  `cancelled` (via `OrderStatusUpdateSerializer`)
- **Successful response:** `200 OK` — the updated order via
  `OrderSerializer`
- **Important error responses:**
  - `401 Unauthorized` — no/invalid token
  - `403 Forbidden` — authenticated but `is_staff=False` (this includes the
    order's own owner, if they are not staff)
  - `404 Not Found` — `order_id` does not exist
  - `400 Bad Request` — `status` is not a valid `Order.Status` value, or
    the transition from the order's current status to the requested status
    is not allowed (see [§12](#12-order-status-transition-rules))
- **Description:** Implemented by `OrderStatusUpdateView`. Because this
  endpoint is staff-only, the order lookup is **not** scoped to
  `request.user` — a staff user can update any customer's order. Runs
  inside `transaction.atomic()` with `select_for_update()` on the order
  row; the allowed-transition check is evaluated only after the lock is
  acquired. If the transition lands on `cancelled`, each `OrderItem`'s
  quantity is restored onto its variant's `stock_quantity` (same helper
  `OrderCancelView` uses). Never modifies `Payment` or cart rows.

## 9. Payment APIs

**Important:** No real payment gateway is integrated. `provider` is
currently a free-form choice among `"manual"`, `"razorpay"`, and
`"stripe"` accepted purely as a label on the `Payment` record — these
endpoints do not call Razorpay, Stripe, or any external payment service.
Payment status is advanced by directly calling the status-update endpoint
below (staff-only, development/testing only), not by any gateway webhook
or callback.

### 9.1 Create payment

**POST** `/api/products/orders/<int:order_id>/pay/`

- **Authentication:** required
- **Request body:** `{ "provider": "manual" }` (must be one of `manual`,
  `razorpay`, `stripe`)
- **Successful response:** `201 Created` — the new `Payment` via
  `PaymentSerializer`
- **Important error responses:**
  - `404 Not Found` — order does not exist or belongs to another user
  - `400 Bad Request` — the order's status is `delivered` or `cancelled`
    (no new payment attempt is allowed on a terminal order — see
    [§12](#12-order-status-transition-rules)); or the order already has a
    payment with `status="paid"`
- **Description:** Implemented by `PaymentCreateView`, scoped to
  `user=request.user`. `amount` is always taken from `order.total_amount`
  (never accepted from the client). The new `Payment` is created with
  `status="pending"`. **Starting a new attempt supersedes any previous
  attempt still `pending`/`processing` on the same order** — those rows
  are automatically marked `cancelled` first, so at most one non-terminal
  `Payment` ever exists per order at a time (terminal attempts —
  `failed`/`cancelled`/`refunded` — are left untouched, and remain
  retryable by simply calling this endpoint again). Does not modify
  `Order.status`. Runs inside `transaction.atomic()` with
  `select_for_update()` on the order row.

### 9.2 Payment status update — **admin/staff only**, dev/test only

**PATCH** `/api/products/orders/<int:order_id>/payments/<int:payment_id>/status/`

- **Authentication:** required, **and the user must be staff**
  (`is_staff=True`) — enforced by DRF's `IsAdminUser` permission; a normal
  customer, including the payment's own owner, can no longer self-report a
  payment as paid
- **Request body:** `{ "status": "processing" }` — value must be one of
  `Payment.Status`: `pending`, `processing`, `paid`, `failed`, `refunded`,
  `cancelled` (via `PaymentStatusUpdateSerializer`)
- **Successful response:** `200 OK` — the updated payment via
  `PaymentSerializer`
- **Important error responses:**
  - `401 Unauthorized` — no/invalid token
  - `403 Forbidden` — authenticated but `is_staff=False`
  - `404 Not Found` — payment does not exist, or doesn't belong to the
    given `order_id` (lookup is **not** scoped to `request.user` — staff
    must be able to update any customer's payment)
  - `400 Bad Request` — `status` is not a valid `Payment.Status` value; the
    transition from the payment's current status is not allowed (see
    [§13](#13-payment-status-transition-rules)); or transitioning to
    `paid` while the order already has another `paid` payment
- **Description:** Implemented by `PaymentStatusUpdateView`. Explicitly
  **not** a real gateway webhook — this is a staff-operated dev/test
  endpoint for exercising payment status transitions. Runs inside
  `transaction.atomic()` with `select_for_update()`; transition and
  "already paid" checks happen after the lock is acquired. **Side effect:**
  when a transition lands on `paid`, the order is separately locked and
  auto-advanced from `pending` to `confirmed` (if — and only if — it's
  still `pending`; an already-`confirmed`/`shipped`/`delivered` order is
  left alone, and a `cancelled` order is never resurrected). Every other
  payment status change leaves `Order.status` untouched.

`PaymentSerializer` fields (response-only, all set server-side): `id`,
`order`, `provider`, `amount`, `currency`, `status`, `created_at`,
`updated_at`. `provider_reference` and `raw_response` are intentionally
excluded from the API response.

## 10. Admin APIs

Every endpoint in this section requires `request.user.is_staff == True`
(DRF's `IsAdminUser`): unauthenticated → `401`, authenticated non-staff →
`403`. None of these are reachable by a normal customer, including the
resource's own owner where applicable.

### 10.1 Admin order management (read-only)

**GET** `/api/products/admin/orders/`

- **Authentication:** required + staff
- **Query parameters:**
  - `status` — filter by `Order.Status`
  - `user` — filter by owning user's id
  - `created_after` / `created_before` — filter by the **date** portion of
    `created_at` (`created_before` includes the entire day, not just up to
    midnight)
  - `search` — substring search on `order_number`, `shipping_full_name`,
    `shipping_phone`
  - `ordering` — `created_at`, `total_amount`, `status`, `order_number`
    (prefix `-` for descending; default `-created_at`)
  - `page`, `page_size` — pagination (see [§15](#15-pagination-behavior))
- **Successful response:** `200 OK` — a paginated list of **every**
  customer's orders via `OrderSerializer` (the same serializer §8 uses —
  individual rows don't carry a customer identifier beyond
  `shipping_full_name`/`shipping_phone`; filter/search by `user` or those
  fields to narrow down)
- **Description:** Implemented by `OrderListAdminView`. Read-only — order
  status/cancellation still only ever change through the endpoints in
  [§8.4](#84-cancel-order--customer-self-service)/[§8.5](#85-order-status-update--adminstaff-only).

### 10.2 Admin product management

**GET / POST** `/api/products/admin/products/`

- **Authentication:** required + staff
- **GET query parameters:**
  - `category` — filter by category id
  - `is_active` — filter by active status (unlike the public product list,
    inactive products are included here)
  - `search` — substring search on `name`, `description`
  - `ordering` — `created_at`, `name`, `price`
  - `page`, `page_size` — pagination
- **GET successful response:** `200 OK` — a paginated list of **every**
  product (active and inactive) via `AdminProductSerializer`
- **POST request body:**
  ```json
  { "name": "New Tee", "description": "...", "price": "19.99", "category": 1, "is_active": true }
  ```
- **POST successful response:** `201 Created` — the new product
- **Important error responses:**
  - `400 Bad Request` — missing/invalid required fields (`name`, `price`,
    `category`)
- **Description:** Implemented by `AdminProductListCreateView`.

**GET / PATCH / DELETE** `/api/products/admin/products/<int:pk>/`

- **Authentication:** required + staff
- **PATCH request body:** any subset of `name`, `description`, `price`,
  `category`, `is_active`
- **Successful responses:** `200 OK` (GET/PATCH), `204 No Content` (DELETE)
- **Important error responses:**
  - `404 Not Found` — product does not exist
  - `400 Bad Request` (PATCH) — validation errors
  - `400 Bad Request` (DELETE) — the product (or one of its variants) is
    still referenced by a protected relation (a wishlisted product, or one
    with `OrderItem` history via its variants) — hard delete is refused
    with a clear message rather than raising a server error; deactivate
    the product instead (`PATCH {"is_active": false}`)
- **Description:** Implemented by `AdminProductDetailView`. Only `GET`,
  `PATCH`, `DELETE` are supported (no `PUT`).

`AdminProductSerializer` fields: `id` (read-only), `name`, `description`,
`price`, `category` (writable, by id — unlike the public `ProductSerializer`,
which nests it read-only), `images`/`sizes`/`colors`/`variants` (read-only
nested, for visibility only — managing those sub-resources isn't supported
by this API), `is_active`, `created_at`/`updated_at` (read-only).

### 10.3 Admin category management

**GET / POST** `/api/products/admin/categories/`

- **Authentication:** required + staff
- **GET query parameters:**
  - `is_active` — filter by active status (inactive categories included)
  - `search` — substring search on `name`, `description`
  - `ordering` — `created_at`, `name`, `is_active`
  - `page`, `page_size` — pagination
- **GET successful response:** `200 OK` — a paginated list of **every**
  category via `AdminCategorySerializer`
- **POST request body:** `{ "name": "New Category", "description": "...", "is_active": true }`
- **POST successful response:** `201 Created`
- **Important error responses:**
  - `400 Bad Request` — missing `name`, or `name` already in use
    (`Category.name` is unique)
- **Description:** Implemented by `AdminCategoryListCreateView`.

**GET / PATCH / DELETE** `/api/products/admin/categories/<int:pk>/`

- **Authentication:** required + staff
- **PATCH request body:** any subset of `name`, `description`, `is_active`
- **Successful responses:** `200 OK` (GET/PATCH), `204 No Content` (DELETE)
- **Important error responses:**
  - `404 Not Found` — category does not exist
  - `400 Bad Request` (DELETE) — one or more products still reference this
    category (`Product.category` is `on_delete=PROTECT`) — hard delete is
    refused with a clear message; deactivate instead
    (`PATCH {"is_active": false}`)
- **Description:** Implemented by `AdminCategoryDetailView`. Only `GET`,
  `PATCH`, `DELETE` (no `PUT`).

`AdminCategorySerializer` fields: `id` (read-only), `name`, `description`,
`is_active`, `created_at`/`updated_at` (read-only).

### 10.4 Admin product variant / inventory management

**GET** `/api/products/admin/variants/`

- **Authentication:** required + staff
- **Query parameters:**
  - `product`, `size`, `color` — filter by id
  - `is_active` — filter by active status
  - `search` — substring search on `sku`, `product__name`
  - `ordering` — `stock_quantity`, `created_at`, `updated_at`
  - `page`, `page_size` — pagination
- **Successful response:** `200 OK` — a paginated list of every
  `ProductVariant` via `AdminProductVariantSerializer`
- **Description:** Implemented by `AdminProductVariantListView`.

**GET / PATCH** `/api/products/admin/variants/<int:pk>/`

- **Authentication:** required + staff
- **PATCH request body:** any subset of `sku`, `stock_quantity`,
  `is_active` — e.g. `{ "stock_quantity": 42 }`
- **Successful response:** `200 OK`
- **Important error responses:**
  - `404 Not Found` — variant does not exist
  - `400 Bad Request` — `stock_quantity` is negative (rejected explicitly,
    `min_value=0`), or `sku` already in use (`ProductVariant.sku` is
    unique)
- **Description:** Implemented by `AdminProductVariantDetailView`. Only
  `GET`, `PATCH` (**no `PUT`, no `DELETE`**). `product`/`size`/`color` are
  read-only here even though they're normally-writable model fields —
  reassigning them isn't supported through this endpoint (see design note
  below).

**Why there's no DELETE for variants:** unlike Product/Category, a hard
delete of a `ProductVariant` wouldn't just risk a `ProtectedError` for
variants with order history (`OrderItem.variant` is `on_delete=PROTECT`,
same protection) — it would also silently `CASCADE`-delete any matching
`CartItem` rows out of a customer's live cart with no error and no chance
to warn anyone (`CartItem.variant` is `on_delete=CASCADE`, not
`PROTECT`). That's a silent side effect on another user's data, not a
handleable exception, so deactivation (`PATCH {"is_active": false}`) is
the only way to retire a variant through this API.

`AdminProductVariantSerializer` fields: `id` (read-only), `product`
(nested `id`/`name`/`price`, read-only — this is how a variant's price is
surfaced, since `ProductVariant` itself has no price field), `size`
(nested, read-only), `color` (nested, read-only), `sku` (writable),
`stock_quantity` (writable, `min_value=0`), `is_active` (writable),
`created_at`/`updated_at` (read-only).

### 10.5 Admin customer management (read-only)

**GET** `/api/accounts/admin/customers/`

- **Authentication:** required + staff
- **Query parameters:**
  - `is_active` — filter by active status
  - `search` — substring search on `username`, `email`, `first_name`,
    `last_name`
  - `ordering` — `date_joined`, `username`, `email`
  - `page`, `page_size` — pagination
- **Successful response:** `200 OK` — a paginated list of every customer
  account via `CustomerSerializer`
- **Description:** Implemented by `CustomerListAdminView`.

**GET** `/api/accounts/admin/customers/<int:pk>/`

- **Authentication:** required + staff
- **Successful response:** `200 OK` — a single customer via
  `CustomerSerializer`
- **Important error responses:**
  - `404 Not Found` — user does not exist
- **Description:** Implemented by `CustomerDetailAdminView`. No pagination
  (single-object detail).

`CustomerSerializer` fields (all read-only — this is a directory, not an
account-management surface; no create/update/deactivate/delete is
implemented): `id`, `username`, `email`, `first_name`, `last_name`,
`is_active`, `date_joined`. `password`, `is_staff`, `is_superuser`,
`last_login`, `groups`, and `user_permissions` are never included in the
response.

## 11. Endpoint summary

| Method | URL | Auth | Notes |
|---|---|---|---|
| POST | `/api/accounts/register/` | none | Create account |
| POST | `/api/accounts/login/` | none | JWT obtain (access + refresh) |
| POST | `/api/accounts/token/refresh/` | none | Exchange refresh token for a new access token |
| GET | `/api/products/` | none | List active products |
| GET | `/api/products/<int:pk>/` | none | Active product detail |
| GET | `/api/products/categories/` | none | List active categories |
| GET | `/api/products/categories/<int:pk>/` | none | Active category detail |
| GET | `/api/products/cart/` | required | Get own cart |
| POST | `/api/products/cart/items/` | required | Add item to own cart |
| PATCH | `/api/products/cart/items/<int:pk>/` | required | Update own cart item quantity |
| DELETE | `/api/products/cart/items/<int:pk>/` | required | Remove own cart item |
| GET | `/api/products/wishlist/` | required | List own wishlist |
| POST | `/api/products/wishlist/` | required | Add to own wishlist |
| DELETE | `/api/products/wishlist/<int:pk>/` | required | Remove own wishlist item |
| GET | `/api/products/addresses/` | required | List own addresses |
| POST | `/api/products/addresses/` | required | Create own address |
| GET/PUT/PATCH/DELETE | `/api/products/addresses/<int:pk>/` | required | Manage own address |
| POST | `/api/products/orders/place/` | required | Place order from own cart |
| GET | `/api/products/orders/` | required | List own orders |
| GET | `/api/products/orders/<int:pk>/` | required | Own order detail |
| POST | `/api/products/orders/<int:order_id>/cancel/` | required | Cancel own order (pending/confirmed only) |
| PATCH | `/api/products/orders/<int:order_id>/status/` | required + staff | Update order status (any customer) |
| POST | `/api/products/orders/<int:order_id>/pay/` | required | Create payment attempt on own order |
| PATCH | `/api/products/orders/<int:order_id>/payments/<int:payment_id>/status/` | required + staff | Update any order's payment status (dev/test) |
| GET | `/api/products/admin/orders/` | required + staff | List every customer's orders |
| GET/POST | `/api/products/admin/products/` | required + staff | List (incl. inactive) / create products |
| GET/PATCH/DELETE | `/api/products/admin/products/<int:pk>/` | required + staff | Manage a product |
| GET/POST | `/api/products/admin/categories/` | required + staff | List (incl. inactive) / create categories |
| GET/PATCH/DELETE | `/api/products/admin/categories/<int:pk>/` | required + staff | Manage a category |
| GET | `/api/products/admin/variants/` | required + staff | List every product variant |
| GET/PATCH | `/api/products/admin/variants/<int:pk>/` | required + staff | Retrieve / restock / retire a variant |
| GET | `/api/accounts/admin/customers/` | required + staff | List every customer account |
| GET | `/api/accounts/admin/customers/<int:pk>/` | required + staff | Retrieve a single customer account |

## 12. Order status transition rules

`Order.Status` values: `pending`, `confirmed`, `shipped`, `delivered`,
`cancelled`.

Implemented in `ORDER_STATUS_TRANSITIONS` (`products/views.py`), the single
source of truth enforced by **both**
[`OrderStatusUpdateView`](#85-order-status-update--adminstaff-only)
(staff, any order, any listed transition) **and**
[`OrderCancelView`](#84-cancel-order--customer-self-service) (customer,
own order, cancellation only):

| Current status | Allowed next status |
|---|---|
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `shipped`, `cancelled` |
| `shipped` | `delivered` |
| `delivered` | *(none — terminal)* |
| `cancelled` | *(none — terminal)* |

Any transition not listed above (including staying on the same status, or
skipping a step, e.g. `pending` → `shipped`) is rejected with `400 Bad
Request`. There is no `processing` value in `Order.Status` — that concept
exists only for `Payment.Status` (see below).

**Side effects of cancellation** (via either endpoint): each of the order's
`OrderItem` quantities is restored onto its `ProductVariant.stock_quantity`.

**Side effect of a payment reaching `paid`:** the order auto-advances from
`pending` to `confirmed` — see [§13](#13-payment-status-transition-rules).

**Payment eligibility by order status:** `delivered` and `cancelled`
orders — i.e. exactly the two terminal statuses above — can never start a
new payment attempt ([§9.1](#91-create-payment)); `pending`, `confirmed`,
and `shipped` orders can.

## 13. Payment status transition rules

`Payment.Status` values: `pending`, `processing`, `paid`, `failed`,
`refunded`, `cancelled`.

Implemented in `PAYMENT_STATUS_TRANSITIONS` (`products/views.py`), enforced
by `PaymentStatusUpdateView` (staff-only — see [§9.2](#92-payment-status-update--adminstaff-only-devtest-only)):

| Current status | Allowed next status |
|---|---|
| `pending` | `processing`, `failed`, `cancelled` |
| `processing` | `paid`, `failed`, `cancelled` |
| `paid` | `refunded` |
| `failed` | *(none — terminal)* |
| `cancelled` | *(none — terminal)* |
| `refunded` | *(none — terminal)* |

Additionally, a transition to `paid` is rejected with `400 Bad Request` if
the order already has another payment with `status="paid"` — an order can
only ever have one paid payment at a time.

Any transition not listed above is rejected with `400 Bad Request`.

**Superseding:** creating a new payment attempt
([§9.1](#91-create-payment)) automatically cancels any existing
`pending`/`processing` attempt on the same order first — so at most one
non-terminal `Payment` ever exists per order. `failed`/`cancelled` attempts
are never touched by this and remain in the order's history.

## 14. Admin/staff-only permissions

Every endpoint listed under [§10](#10-admin-apis), plus these two from
earlier sections, require `request.user.is_staff == True` (DRF
`IsAdminUser`) — unauthenticated → `401`, authenticated non-staff
(including a resource's own owner) → `403`:

- **PATCH** `/api/products/orders/<int:order_id>/status/`
- **PATCH** `/api/products/orders/<int:order_id>/payments/<int:payment_id>/status/`

Every other authenticated endpoint documented above only requires a valid
JWT (`IsAuthenticated`) — there is no other staff-only or role-based
restriction anywhere in the API. Django's built-in admin site (`/admin/`)
is separate from this REST API and is not documented here.

## 15. Pagination behavior

`ProductPagination` (`rest_framework.pagination.PageNumberPagination`,
`products/pagination.py`) is used consistently by every **paginated**
endpoint: `page_size=12` by default, overridable per-request via
`?page_size=`, capped at `max_page_size=48`. A paginated response has the
shape:

```json
{
  "count": 137,
  "next": "http://.../?page=2",
  "previous": null,
  "results": [ ... ]
}
```

**Paginated:** `/api/products/`, `/api/products/admin/orders/`,
`/api/products/admin/products/`, `/api/products/admin/categories/`,
`/api/products/admin/variants/`, `/api/accounts/admin/customers/`.

**Not paginated** (plain JSON array): `/api/products/categories/`,
`/api/products/cart/` (nested `items` array), `/api/products/wishlist/`,
`/api/products/addresses/`, `/api/products/orders/`. A frontend must handle
both response shapes depending on the endpoint.

## 16. CORS (development origins)

CORS is provided by `django-cors-headers` (`config/settings.py`):
`corsheaders.middleware.CorsMiddleware` is installed immediately before
`CommonMiddleware`. `CORS_ALLOW_ALL_ORIGINS` is **not** used — only origins
explicitly listed in `CORS_ALLOWED_ORIGINS` are allowed:

```python
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "http://localhost:3000", "http://127.0.0.1:3000",   # Create React App
        "http://localhost:5173", "http://127.0.0.1:5173",   # Vite
    ],
)
```

These defaults cover the two most common local frontend dev servers.
Override or extend them by setting a comma-separated `CORS_ALLOWED_ORIGINS`
in `.env` (see [.env.example](.env.example)) — e.g. to add a deployed
frontend's origin — without touching `settings.py`. A request from an
origin not in this list completes normally server-side but is not marked
CORS-enabled (no `Access-Control-Allow-Origin` header is added), so a
browser will block the frontend from reading the response.
