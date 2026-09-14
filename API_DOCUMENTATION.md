# NOSTRA API Documentation

This document describes the API endpoints that currently exist in the NOSTRA
backend, as implemented in the codebase. It documents only what is
implemented today — no planned, future, or aspirational functionality is
included.

## 1. Overview

NOSTRA is a Django REST Framework backend for a fashion e-commerce
application. It exposes JSON APIs for:

- Account registration and JWT-based login
- Browsing products and categories
- Managing a per-user cart and wishlist
- Managing shipping addresses
- Placing orders from the cart
- Viewing orders
- Updating order status (staff/admin only)
- Creating payment attempts for an order and updating their status
  (development/testing only — no real payment gateway is integrated)

All endpoints are mounted under two root prefixes:

- `/api/accounts/` — registration and login (see [accounts/urls.py](accounts/urls.py))
- `/api/products/` — everything else: products, categories, cart, wishlist,
  addresses, orders, payments (see [products/urls.py](products/urls.py))

Authentication is JWT-based, provided by `djangorestframework-simplejwt`.
The project's `REST_FRAMEWORK` setting configures
`JWTAuthentication` as the only authentication class (see
[config/settings.py](config/settings.py)), so every authenticated endpoint
expects a `Bearer` access token, not session/cookie auth.

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
  the login endpoint afterward.

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
  [AllowAny]`. It returns a JWT access/refresh token pair on success. There
  is no separate token-refresh endpoint currently wired up in
  `accounts/urls.py` or `products/urls.py`.

### 2.3 Authentication requirement

For every endpoint below marked **Authentication: required**, requests must
include:

```
Authorization: Bearer <access token>
```

- Missing/invalid/expired token → `401 Unauthorized`
- Valid token, but the user lacks the necessary permission (e.g. non-staff
  calling a staff-only endpoint) → `403 Forbidden`

## 3. Products APIs

### 3.1 List products

**GET** `/api/products/`

- **Authentication:** none required (`AllowAny`)
- **Query parameters:**
  - `category` — filter by category id
  - `min_price` / `max_price` — filter by `Product.price` (`gte`/`lte`)
  - `search` — substring search on `Product.name`
  - `ordering` — `price` or `-price`
  - `page`, `page_size` — pagination (`page_size` default 12, max 48)
- **Successful response:** `200 OK` — a paginated list (`count`, `next`,
  `previous`, `results`) of products serialized by `ProductSerializer`
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
`category`, `images`, `sizes`, `colors`, `variants`, `is_active`,
`created_at`, `updated_at`.

## 4. Categories APIs

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
`updated_at` (`variant` is a nested read-only representation including
`product`, `size`, `color`, `sku`, `stock_quantity`, `is_active`).

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

## 8. Order APIs

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
`items`, `payments`, `created_at`, `updated_at`.

`items` is a nested list via `OrderItemSerializer`: `id`, `variant`,
`quantity`, `unit_price`, `created_at`.

`payments` is a nested list via `PaymentSerializer` (see section 9).

### 8.4 Order status update — **admin/staff only**

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
    is not allowed (see section 11)
- **Description:** Implemented by `OrderStatusUpdateView`. Because this
  endpoint is staff-only, the order lookup is **not** scoped to
  `request.user` — a staff user can update any customer's order. Runs
  inside `transaction.atomic()` with `select_for_update()` on the order
  row; the allowed-transition check is evaluated only after the lock is
  acquired, against the freshly-locked `order.status`. Does not modify
  `Payment`, inventory, cart, or `OrderItem` rows.

## 9. Payment APIs

**Important:** No real payment gateway is integrated. `provider` is
currently a free-form choice among `"manual"`, `"razorpay"`, and
`"stripe"` accepted purely as a label on the `Payment` record — these
endpoints do not call Razorpay, Stripe, or any external payment service.
Payment status is advanced by directly calling the status-update endpoint
below (development/testing only), not by any gateway webhook or callback.

### 9.1 Create payment

**POST** `/api/products/orders/<int:order_id>/pay/`

- **Authentication:** required
- **Request body:** `{ "provider": "manual" }` (must be one of `manual`,
  `razorpay`, `stripe`)
- **Successful response:** `201 Created` — the new `Payment` via
  `PaymentSerializer`
- **Important error responses:**
  - `404 Not Found` — order does not exist or belongs to another user
  - `400 Bad Request` — the order already has a payment with
    `status="paid"`
- **Description:** Implemented by `PaymentCreateView`, scoped to
  `user=request.user`. `amount` is always taken from `order.total_amount`
  (never accepted from the client). Created with `status="pending"`. Does
  not modify `Order.status`. Runs inside `transaction.atomic()` with
  `select_for_update()` on the order row so two concurrent requests can't
  both pass the "already paid" check.

### 9.2 Payment status update — dev/test only

**PATCH** `/api/products/orders/<int:order_id>/payments/<int:payment_id>/status/`

- **Authentication:** required
- **Request body:** `{ "status": "processing" }` — value must be one of
  `Payment.Status`: `pending`, `processing`, `paid`, `failed`, `refunded`,
  `cancelled` (via `PaymentStatusUpdateSerializer`)
- **Successful response:** `200 OK` — the updated payment via
  `PaymentSerializer`
- **Important error responses:**
  - `404 Not Found` — payment does not exist, doesn't belong to the given
    order, or the order doesn't belong to `request.user`
  - `400 Bad Request` — `status` is not a valid `Payment.Status` value; the
    transition from the payment's current status is not allowed (see
    section 12); or transitioning to `paid` while the order already has
    another `paid` payment
- **Description:** Implemented by `PaymentStatusUpdateView`, scoped to
  `order__pk=order_id, order__user=request.user`. Explicitly **not** a real
  gateway webhook — this is a manual/dev endpoint for exercising payment
  status transitions. Runs inside `transaction.atomic()` with
  `select_for_update()`; transition and "already paid" checks happen after
  the lock is acquired. Does not modify `Order.status`.

`PaymentSerializer` fields (response-only, all set server-side): `id`,
`order`, `provider`, `amount`, `currency`, `status`, `created_at`,
`updated_at`. `provider_reference` and `raw_response` are intentionally
excluded from the API response.

## 10. Endpoint summary

| Method | URL | Auth | Notes |
|---|---|---|---|
| POST | `/api/accounts/register/` | none | Create account |
| POST | `/api/accounts/login/` | none | JWT obtain (access + refresh) |
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
| PATCH | `/api/products/orders/<int:order_id>/status/` | required + staff | Update order status (any customer) |
| POST | `/api/products/orders/<int:order_id>/pay/` | required | Create payment attempt on own order |
| PATCH | `/api/products/orders/<int:order_id>/payments/<int:payment_id>/status/` | required | Update own order's payment status (dev/test) |

## 11. Order status transition rules

`Order.Status` values: `pending`, `confirmed`, `shipped`, `delivered`,
`cancelled`.

Implemented in `ORDER_STATUS_TRANSITIONS` (`products/views.py`), enforced by
`OrderStatusUpdateView` (staff/admin only — see 8.4):

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

## 12. Payment status transition rules

`Payment.Status` values: `pending`, `processing`, `paid`, `failed`,
`refunded`, `cancelled`.

Implemented in `PAYMENT_STATUS_TRANSITIONS` (`products/views.py`), enforced
by `PaymentStatusUpdateView` (see 9.2):

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

## 13. Admin/staff-only permissions

Currently, exactly one endpoint requires staff/admin privileges:

- **PATCH** `/api/products/orders/<int:order_id>/status/` — requires
  `request.user.is_staff == True` (DRF `IsAdminUser`). Unauthenticated
  requests get `401`; authenticated non-staff users (including the order's
  own owner) get `403`.

Every other authenticated endpoint documented above only requires a valid
JWT (`IsAuthenticated`) — there is currently no other staff-only or
role-based restriction anywhere in the API. Django's built-in admin site
(`/admin/`) is separate from this REST API and is not documented here.
