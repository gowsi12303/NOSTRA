import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// IMPORTANT — read before changing anything here: there is no dedicated
// admin payment API in this backend. products/urls.py has only two
// payment-related routes: `orders/<id>/pay/` (customer-scoped, creates a
// payment attempt) and `orders/<id>/payments/<id>/status/`
// (PaymentStatusUpdateView — staff-only, but the backend's own comment
// marks it "dev/test only, NOT a real gateway webhook", a status mutation,
// not a listing capability). Neither lets staff browse payments in bulk.
//
// The only place payment data reaches staff at all is nested inside
// GET /api/products/admin/orders/ (OrderListAdminView), whose
// OrderSerializer includes a `payments` array (via PaymentSerializer) per
// order — the same real, already-existing endpoint Orders.jsx uses. This
// page is built on exactly that: it groups each page of orders with their
// nested payments, rather than inventing a payments-specific endpoint that
// doesn't exist. Query params (search/status/user/created_after/
// created_before/ordering) are therefore genuinely ORDER-level — they
// narrow which orders (and so which payments) appear — labeled as such
// below so that's never misrepresented as payment-level filtering.
//
// PaymentSerializer's own fields are: id, order (a bare order PK, not an
// order_number), provider, amount, currency, status, created_at,
// updated_at — read_only_fields = fields (fully read-only). Since this
// page only reads via GET /admin/orders/, it never needed to write to
// payments anyway; there is also no evidence PaymentStatusUpdateView is
// meant as a general admin action (same reasoning Orders.jsx already
// applied to skip OrderStatusUpdateView), so no status-change action is
// added here.
const ADMIN_ORDERS_ENDPOINT = '/api/products/admin/orders/'
const ADMIN_CUSTOMERS_ENDPOINT = '/api/accounts/admin/customers/'

// Matches ProductPagination's default page_size (12) — this paginates
// orders (see the note above), not payments directly.
const PAGE_SIZE = 12
// Max page_size the customers endpoint allows — pulls the customer list in
// one request for the "Filter by customer" dropdown, exactly as Orders.jsx
// does (OrderSerializer carries no user id/username of its own).
const CUSTOMER_OPTIONS_PAGE_SIZE = 48

// Order.Status's own fixed choices (products/models.py) — the `status`
// query param filters orders by this, not payments by Payment.Status
// (see the "Payment status" client-side filter further down for that).
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

// Payment.Status's own fixed choices (products/models.py). There is no
// backend query param for filtering payments by status (no dedicated
// payment endpoint exists at all — see the module comment above), so this
// powers a client-side-only quick filter over whatever payments are
// already loaded on the current page, clearly labeled as such in the UI.
const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'refunded', 'cancelled']

// OrderListAdminView.ordering_fields, each in both directions — orders the
// underlying order groups (and so the payments nested under them), exactly
// as Orders.jsx offers.
const ORDERING_OPTIONS = [
  { value: '', label: 'Newest orders first (default)' },
  { value: 'created_at', label: 'Oldest orders first' },
  { value: '-total_amount', label: 'Order total: high to low' },
  { value: 'total_amount', label: 'Order total: low to high' },
  { value: 'status', label: 'Order status: A to Z' },
  { value: '-status', label: 'Order status: Z to A' },
  { value: 'order_number', label: 'Order number: A to Z' },
  { value: '-order_number', label: 'Order number: Z to A' },
]

function buildOrdersQuery({ page, search, statusFilter, userFilter, createdAfter, createdBefore, ordering }) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  if (search) params.set('search', search)
  if (statusFilter) params.set('status', statusFilter)
  if (userFilter) params.set('user', userFilter)
  if (createdAfter) params.set('created_after', createdAfter)
  if (createdBefore) params.set('created_before', createdBefore)
  if (ordering) params.set('ordering', ordering)
  return `${ADMIN_ORDERS_ENDPOINT}?${params.toString()}`
}

// Page styles, scoped under `.admin-payments`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app.
const adminPaymentsStyles = `
  .admin-payments-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-payments [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-payments-note {
    margin: 12px 0 0;
    font-size: 0.85rem;
    line-height: 1.6;
    opacity: 0.75;
  }

  .admin-payments-empty {
    padding: 32px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    text-align: center;
    opacity: 0.75;
  }

  .admin-payments-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 20px;
    margin-top: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-payments-filter-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .admin-payments-filter-field label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .admin-payments-filter-field .admin-payments-filter-hint {
    font-size: 0.65rem;
    letter-spacing: normal;
    text-transform: none;
    opacity: 0.6;
  }

  .admin-payments-filter-field input,
  .admin-payments-filter-field select {
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .admin-payments-search-field {
    display: flex;
    gap: 8px;
  }

  .admin-payments-filters button {
    padding: 8px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-payments-filters button:hover {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-payments-groups {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }

  .admin-payments-order-group {
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-payments-order-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .admin-payments-order-number {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .admin-payments-order-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-payments-order-customer {
    margin-left: auto;
    font-size: 0.85rem;
    opacity: 0.75;
    white-space: nowrap;
  }

  .admin-payment-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 12px 0 0;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-payment-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    font-size: 0.9rem;
  }

  .admin-payment-provider {
    font-weight: 500;
    text-transform: capitalize;
  }

  .admin-payment-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-payment-amount {
    font-weight: 500;
    white-space: nowrap;
  }

  .admin-payment-date {
    margin-left: auto;
    opacity: 0.7;
    white-space: nowrap;
  }

  .admin-payments-no-payments {
    margin: 12px 0 0;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
    font-size: 0.85rem;
    opacity: 0.6;
  }

  .admin-payments-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 0.85rem;
  }

  .admin-payments-pagination button {
    padding: 8px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .admin-payments-pagination button:hover:not(:disabled),
  .admin-payments-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-payments-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-payments-pagination-count {
    opacity: 0.7;
  }
`

/**
 * Admin payments view: since no dedicated payment listing endpoint exists
 * on the backend (see the module comment above), this groups each page of
 * admin orders with their nested payment attempts. Order-level
 * search/status/customer/date/ordering genuinely hit the backend (they're
 * OrderListAdminView's real query params); the "Payment status" filter is
 * client-side only, over whatever payments are already loaded on the
 * current page, and labeled as such. Read-only throughout — no status
 * mutation action is added (see the module comment for why).
 */
function Payments() {
  const { accessToken } = useAuth()

  const [orders, setOrders] = useState([])
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Order-level filters — genuinely sent to GET /admin/orders/. `search`/
  // `statusFilter`/`userFilter`/`createdAfter`/`createdBefore`/`ordering`
  // are what's actually sent; `searchInput` is the text field's live value,
  // only committed to `search` on submit so every keystroke doesn't fire a
  // request.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [ordering, setOrdering] = useState('')

  // Client-side-only: filters the already-loaded page's flattened payments
  // by Payment.Status. Never sent to the server — there is no backend
  // param for it.
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('')

  // Customer dropdown options — same real endpoint/reasoning as Orders.jsx.
  const [customerOptions, setCustomerOptions] = useState([])
  const [optionsError, setOptionsError] = useState('')

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false
    apiGet(`${ADMIN_CUSTOMERS_ENDPOINT}?page_size=${CUSTOMER_OPTIONS_PAGE_SIZE}`, { accessToken })
      .then((data) => {
        if (!cancelled) setCustomerOptions(data?.results ?? [])
      })
      .catch((err) => {
        if (!cancelled) setOptionsError(err.message || 'Unable to load the customer filter list.')
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  const fetchOrders = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(
        buildOrdersQuery({ page, search, statusFilter, userFilter, createdAfter, createdBefore, ordering }),
        { accessToken },
      )
        .then((data) => {
          setOrders(data?.results ?? [])
          setPageInfo({ count: data?.count ?? 0, next: data?.next ?? null, previous: data?.previous ?? null })
        })
        .catch((err) => setError(err.message || 'Unable to load orders.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken, page, search, statusFilter, userFilter, createdAfter, createdBefore, ordering],
  )

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function handleStatusFilterChange(event) {
    setPage(1)
    setStatusFilter(event.target.value)
  }

  function handleUserFilterChange(event) {
    setPage(1)
    setUserFilter(event.target.value)
  }

  function handleCreatedAfterChange(event) {
    setPage(1)
    setCreatedAfter(event.target.value)
  }

  function handleCreatedBeforeChange(event) {
    setPage(1)
    setCreatedBefore(event.target.value)
  }

  function handleOrderingChange(event) {
    setPage(1)
    setOrdering(event.target.value)
  }

  // Apply the client-side-only payment-status filter to each order's
  // nested payments, and drop any order left with nothing to show.
  const visibleGroups = orders
    .map((order) => ({
      order,
      payments: paymentStatusFilter
        ? (order.payments ?? []).filter((payment) => payment.status === paymentStatusFilter)
        : (order.payments ?? []),
    }))
    .filter(({ payments }) => !paymentStatusFilter || payments.length > 0)

  // Empty state must distinguish "no orders matched the filters at all"
  // from "orders matched, but the client-side payment-status filter left
  // none of their payments visible" — collapsing both into one check (e.g.
  // a total-payments-across-all-groups count) would wrongly hide the order
  // groups whenever every matching order simply has zero payment attempts
  // yet, even though those groups themselves are exactly what should
  // render (each showing its own "No payment attempts yet." placeholder).
  const emptyMessage =
    orders.length === 0
      ? 'No payments found.'
      : visibleGroups.length === 0
        ? 'No payments match the selected payment status on this page.'
        : null

  return (
    <main className="admin-payments">
      <style href="admin-payments-styles" precedence="default">
        {adminPaymentsStyles}
      </style>

      <h1>Payments</h1>

      <p className="admin-payments-note">
        There is no dedicated payments endpoint — payments are shown grouped under the order they belong
        to. The filters below narrow which orders (and so which payments) appear.
      </p>

      {isLoading && <p className="admin-payments-message">Loading payments...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-payments-message">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <>
          {optionsError && (
            <p role="alert" className="admin-payments-message">
              {optionsError}
            </p>
          )}

          <form className="admin-payments-filters" onSubmit={handleSearchSubmit}>
            <div className="admin-payments-filter-field admin-payments-search-field">
              <label htmlFor="payment-search">Search orders</label>
              <input
                id="payment-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Order #, name, or phone"
              />
              <button type="submit">Search</button>
            </div>

            <div className="admin-payments-filter-field">
              <label htmlFor="payment-order-status-filter">Order status</label>
              <select
                id="payment-order-status-filter"
                value={statusFilter}
                onChange={handleStatusFilterChange}
              >
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-payments-filter-field">
              <label htmlFor="payment-user-filter">Customer</label>
              <select id="payment-user-filter" value={userFilter} onChange={handleUserFilterChange}>
                <option value="">All customers</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.username} ({customer.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-payments-filter-field">
              <label htmlFor="payment-created-after">Created after</label>
              <input
                id="payment-created-after"
                type="date"
                value={createdAfter}
                onChange={handleCreatedAfterChange}
              />
            </div>

            <div className="admin-payments-filter-field">
              <label htmlFor="payment-created-before">Created before</label>
              <input
                id="payment-created-before"
                type="date"
                value={createdBefore}
                onChange={handleCreatedBeforeChange}
              />
            </div>

            <div className="admin-payments-filter-field">
              <label htmlFor="payment-ordering">Sort orders by</label>
              <select id="payment-ordering" value={ordering} onChange={handleOrderingChange}>
                {ORDERING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-payments-filter-field">
              <label htmlFor="payment-status-filter">
                Payment status
                <span className="admin-payments-filter-hint"> (current page only)</span>
              </label>
              <select
                id="payment-status-filter"
                value={paymentStatusFilter}
                onChange={(event) => setPaymentStatusFilter(event.target.value)}
              >
                <option value="">All payment statuses</option>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </form>

          {emptyMessage && (
            <p className="admin-payments-message admin-payments-empty">{emptyMessage}</p>
          )}

          {visibleGroups.length > 0 && (
            <ul className="admin-payments-groups">
              {visibleGroups.map(({ order, payments }) => (
                <li key={order.id} className="admin-payments-order-group">
                  <div className="admin-payments-order-header">
                    <p className="admin-payments-order-number">{order.order_number}</p>
                    <span className="admin-payments-order-status">{order.status}</span>
                    <span className="admin-payments-order-customer">
                      {order.shipping_full_name} · {order.shipping_phone}
                    </span>
                  </div>

                  {payments.length === 0 ? (
                    <p className="admin-payments-no-payments">No payment attempts yet.</p>
                  ) : (
                    <div className="admin-payment-rows">
                      {payments.map((payment) => (
                        <div key={payment.id} className="admin-payment-row">
                          <span className="admin-payment-provider">{payment.provider}</span>
                          <span className="admin-payment-status">{payment.status}</span>
                          <span className="admin-payment-amount">
                            {payment.currency} {payment.amount}
                          </span>
                          <span className="admin-payment-date">
                            {new Date(payment.created_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="admin-payments-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={!pageInfo.previous}
            >
              Previous
            </button>
            <span className="admin-payments-pagination-count">
              Page {page} · {pageInfo.count} {pageInfo.count === 1 ? 'order' : 'orders'}
            </span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pageInfo.next}>
              Next
            </button>
          </div>
        </>
      )}
    </main>
  )
}

export default Payments
