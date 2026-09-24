import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// Admin-only paths, not yet added to src/api/endpoints.js — this task's
// scope is limited to Orders.jsx only, so they're kept local here (same
// approach as the completed Categories/Products/Variants admin pages). Real
// backend routes: see products/urls.py's admin/orders/ (OrderListAdminView,
// read-only — no order status/cancellation/payment actions exist on this
// endpoint, and none are added here) and accounts/urls.py's admin/customers/
// (used here only to populate the customer filter — see the note on
// customerOptions below), both staff/admin only (IsAdminUser).
const ADMIN_ORDERS_ENDPOINT = '/api/products/admin/orders/'
const ADMIN_CUSTOMERS_ENDPOINT = '/api/accounts/admin/customers/'

// Matches ProductPagination's default page_size (12).
const PAGE_SIZE = 12
// Max page_size the customers endpoint allows — pulls the customer list in
// one request for the "Filter by customer" dropdown (see the note on
// customerOptions below for why a dropdown of usernames is needed at all).
const CUSTOMER_OPTIONS_PAGE_SIZE = 48

// Order.Status's own fixed choices (products/models.py) — mirrors the exact
// values the backend accepts for the `status` filter and already displays
// on every order, not a new vocabulary invented here.
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

// OrderListAdminView.ordering_fields, each in both directions — the exact
// set the backend accepts via `ordering`, nothing added.
const ORDERING_OPTIONS = [
  { value: '', label: 'Newest first (default)' },
  { value: 'created_at', label: 'Oldest first' },
  { value: '-total_amount', label: 'Total: high to low' },
  { value: 'total_amount', label: 'Total: low to high' },
  { value: 'status', label: 'Status: A to Z' },
  { value: '-status', label: 'Status: Z to A' },
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

// Page styles, scoped under `.admin-orders`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app.
const adminOrdersStyles = `
  .admin-orders-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-orders [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-orders-empty {
    padding: 32px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    text-align: center;
    opacity: 0.75;
  }

  .admin-orders-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 20px;
    margin-top: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-orders-filter-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .admin-orders-filter-field label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .admin-orders-filter-field input,
  .admin-orders-filter-field select {
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .admin-orders-search-field {
    display: flex;
    gap: 8px;
  }

  .admin-orders-filters button {
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

  .admin-orders-filters button:hover {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-orders-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }

  .admin-order-card {
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-order-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .admin-order-number {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .admin-order-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-order-total {
    margin-left: auto;
    font-size: 1.05rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .admin-order-details {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 8px 0 0;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .admin-orders-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 0.85rem;
  }

  .admin-orders-pagination button {
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

  .admin-orders-pagination button:hover:not(:disabled),
  .admin-orders-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-orders-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-orders-pagination-count {
    opacity: 0.7;
  }
`

/**
 * Admin order list: paginated/searchable/filterable/orderable — backed by
 * the staff-only, read-only admin order endpoint (see
 * ADMIN_ORDERS_ENDPOINT above). Deliberately read-only, with no status,
 * cancellation, or payment actions: OrderListAdminView is a ListAPIView
 * (GET only), and status/cancellation/payment changes only ever happen
 * through the separate order-status/cancel/payment endpoints, which this
 * page's scope excludes.
 */
function Orders() {
  const { accessToken } = useAuth()

  const [orders, setOrders] = useState([])
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters. `search`/`statusFilter`/`userFilter`/`createdAfter`/
  // `createdBefore`/`ordering` are what's actually sent to the API;
  // `searchInput` is the text field's live value, only committed to
  // `search` on submit so every keystroke doesn't fire a request.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [ordering, setOrdering] = useState('')

  // OrderSerializer never includes a user id/username on each order row
  // (see the view's own docstring: filter/search by user/order_number/phone
  // instead) — so there's nothing to derive customer options from in the
  // order list responses themselves, unlike Products.jsx's category
  // dropdown or Variants.jsx's size/color dropdowns. This list is fetched
  // from the separate, already-existing admin customer directory purely to
  // turn a friendly username into the numeric id the `user` filter expects.
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

  return (
    <main className="admin-orders">
      <style href="admin-orders-styles" precedence="default">
        {adminOrdersStyles}
      </style>

      <h1>Orders</h1>

      {isLoading && <p className="admin-orders-message">Loading orders...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-orders-message">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <>
          {optionsError && (
            <p role="alert" className="admin-orders-message">
              {optionsError}
            </p>
          )}

          <form className="admin-orders-filters" onSubmit={handleSearchSubmit}>
            <div className="admin-orders-filter-field admin-orders-search-field">
              <label htmlFor="order-search">Search</label>
              <input
                id="order-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Order #, name, or phone"
              />
              <button type="submit">Search</button>
            </div>

            <div className="admin-orders-filter-field">
              <label htmlFor="order-status-filter">Status</label>
              <select id="order-status-filter" value={statusFilter} onChange={handleStatusFilterChange}>
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-orders-filter-field">
              <label htmlFor="order-user-filter">Customer</label>
              <select id="order-user-filter" value={userFilter} onChange={handleUserFilterChange}>
                <option value="">All customers</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.username} ({customer.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-orders-filter-field">
              <label htmlFor="order-created-after">Created after</label>
              <input
                id="order-created-after"
                type="date"
                value={createdAfter}
                onChange={handleCreatedAfterChange}
              />
            </div>

            <div className="admin-orders-filter-field">
              <label htmlFor="order-created-before">Created before</label>
              <input
                id="order-created-before"
                type="date"
                value={createdBefore}
                onChange={handleCreatedBeforeChange}
              />
            </div>

            <div className="admin-orders-filter-field">
              <label htmlFor="order-ordering">Sort by</label>
              <select id="order-ordering" value={ordering} onChange={handleOrderingChange}>
                {ORDERING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </form>

          {orders.length === 0 && (
            <p className="admin-orders-message admin-orders-empty">No orders found.</p>
          )}

          {orders.length > 0 && (
            <ul className="admin-orders-list">
              {orders.map((order) => (
                <li key={order.id} className="admin-order-card">
                  <div className="admin-order-card-header">
                    <p className="admin-order-number">{order.order_number}</p>
                    <span className="admin-order-status">{order.status}</span>
                    <span className="admin-order-total">₹{order.total_amount}</span>
                  </div>

                  <div className="admin-order-details">
                    <span>{order.shipping_full_name}</span>
                    <span>{order.shipping_phone}</span>
                    <span>{new Date(order.created_at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="admin-orders-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={!pageInfo.previous}
            >
              Previous
            </button>
            <span className="admin-orders-pagination-count">
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

export default Orders
