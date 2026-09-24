import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// Admin-only paths, not yet added to src/api/endpoints.js — this task's
// scope is limited to Customers.jsx only, so they're kept local here (same
// approach as the completed Categories/Products/Variants/Orders admin
// pages). Real backend routes: see accounts/urls.py's admin/customers/
// (CustomerListAdminView) and admin/customers/<id>/ (CustomerDetailAdminView),
// both staff/admin only (IsAdminUser) and fully read-only — there is no
// customer create/update/delete/deactivate endpoint at all, so this page
// never attempts any of those.
const ADMIN_CUSTOMERS_ENDPOINT = '/api/accounts/admin/customers/'
const adminCustomerDetailEndpoint = (id) => `/api/accounts/admin/customers/${id}/`

// Matches ProductPagination's default page_size (12) — reused here too,
// since CustomerListAdminView shares the same pagination_class.
const PAGE_SIZE = 12

// CustomerListAdminView.ordering_fields, each in both directions — the
// exact set the backend accepts via `ordering`, nothing added. The
// queryset's own default (no `ordering` param sent) is -date_joined.
const ORDERING_OPTIONS = [
  { value: '', label: 'Newest joined first (default)' },
  { value: 'date_joined', label: 'Oldest joined first' },
  { value: 'username', label: 'Username: A to Z' },
  { value: '-username', label: 'Username: Z to A' },
  { value: 'email', label: 'Email: A to Z' },
  { value: '-email', label: 'Email: Z to A' },
]

function buildCustomersQuery({ page, search, statusFilter, ordering }) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(PAGE_SIZE))
  if (search) params.set('search', search)
  if (statusFilter) params.set('is_active', statusFilter)
  if (ordering) params.set('ordering', ordering)
  return `${ADMIN_CUSTOMERS_ENDPOINT}?${params.toString()}`
}

// Page styles, scoped under `.admin-customers`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app.
const adminCustomersStyles = `
  .admin-customers-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-customers [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-customers-empty {
    padding: 32px 16px;
    border: 1px dashed light-dark(#cccccc, #444444);
    border-radius: 4px;
    text-align: center;
    opacity: 0.75;
  }

  .admin-customers-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 20px;
    margin-top: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-customers-filter-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .admin-customers-filter-field label {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .admin-customers-filter-field input,
  .admin-customers-filter-field select {
    padding: 8px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 2px;
    background-color: light-dark(#ffffff, #111111);
    color: inherit;
    font: inherit;
  }

  .admin-customers-search-field {
    display: flex;
    gap: 8px;
  }

  .admin-customers-filters button {
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

  .admin-customers-filters button:hover {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-customers-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
  }

  .admin-customer-card {
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-customer-card.is-inactive {
    opacity: 0.65;
  }

  .admin-customer-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .admin-customer-username {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .admin-customer-status {
    padding: 2px 10px;
    border: 1px solid light-dark(#cccccc, #444444);
    border-radius: 999px;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-customer-details {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 8px 0 0;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .admin-customer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-customer-actions button {
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

  .admin-customer-actions button:hover:not(:disabled),
  .admin-customer-actions button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-customer-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .admin-customer-detail-panel {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid light-dark(#e5e5e5, #333333);
    font-size: 0.9rem;
  }

  .admin-customer-detail-panel dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 12px;
    margin: 0;
  }

  .admin-customer-detail-panel dt {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .admin-customer-detail-panel dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .admin-customers-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 0.85rem;
  }

  .admin-customers-pagination button {
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

  .admin-customers-pagination button:hover:not(:disabled),
  .admin-customers-pagination button:focus-visible:not(:disabled) {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-customers-pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-customers-pagination-count {
    opacity: 0.7;
  }

  .admin-customers h2 {
    margin: 32px 0 12px;
    font-size: 1rem;
  }

  .admin-customer-lookup {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
  }

  .admin-customer-lookup .admin-customers-filter-field input {
    width: 140px;
  }

  .admin-customer-lookup-result {
    margin-top: 16px;
    padding: 16px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    max-width: 420px;
  }
`

/**
 * Admin customer directory: paginated/searchable/filterable/orderable list,
 * plus a per-row detail lookup and a standalone lookup-by-id tool — backed
 * by the staff-only, read-only admin customer endpoints (see
 * ADMIN_CUSTOMERS_ENDPOINT above). Deliberately no edit/deactivate/delete
 * actions: both CustomerListAdminView and CustomerDetailAdminView are
 * read-only (ListAPIView/RetrieveAPIView, GET only), and CustomerSerializer
 * has every field marked read_only — there is nothing on the backend for
 * this page to write to.
 */
function Customers() {
  const { accessToken } = useAuth()

  const [customers, setCustomers] = useState([])
  const [pageInfo, setPageInfo] = useState({ count: 0, next: null, previous: null })
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters. `search`/`statusFilter`/`ordering` are what's actually sent to
  // the API; `searchInput` is the text field's live value, only committed
  // to `search` on submit so every keystroke doesn't fire a request.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ordering, setOrdering] = useState('')

  // Which row's detail panel is expanded, plus that panel's own
  // loading/error/data — fetched fresh from CustomerDetailAdminView (not
  // just re-displayed from the already-loaded list row), since the
  // requirement is specifically to exercise the detail endpoint. Its
  // response happens to carry the same fields as the list row (both use
  // CustomerSerializer) — nothing hidden is being fetched, this just
  // confirms the detail endpoint itself.
  const [expandedId, setExpandedId] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // Standalone "look up by id" tool: the one way to reach a customer id
  // that isn't on the currently-loaded page (or that doesn't exist at
  // all), so a 404 from the detail endpoint can actually be exercised.
  const [lookupIdInput, setLookupIdInput] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  const fetchCustomers = useCallback(
    ({ silent = false } = {}) => {
      if (!accessToken) return Promise.resolve()

      if (!silent) {
        setIsLoading(true)
        setError('')
      }

      return apiGet(buildCustomersQuery({ page, search, statusFilter, ordering }), { accessToken })
        .then((data) => {
          setCustomers(data?.results ?? [])
          setPageInfo({ count: data?.count ?? 0, next: data?.next ?? null, previous: data?.previous ?? null })
        })
        .catch((err) => setError(err.message || 'Unable to load customers.'))
        .finally(() => {
          if (!silent) setIsLoading(false)
        })
    },
    [accessToken, page, search, statusFilter, ordering],
  )

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function handleStatusFilterChange(event) {
    setPage(1)
    setStatusFilter(event.target.value)
  }

  function handleOrderingChange(event) {
    setPage(1)
    setOrdering(event.target.value)
  }

  function handleToggleDetail(customer) {
    if (expandedId === customer.id) {
      setExpandedId(null)
      return
    }

    setExpandedId(customer.id)
    setDetailData(null)
    setDetailError('')
    setDetailLoading(true)
    apiGet(adminCustomerDetailEndpoint(customer.id), { accessToken })
      .then((data) => setDetailData(data))
      .catch((err) => setDetailError(err.message || 'Unable to load this customer.'))
      .finally(() => setDetailLoading(false))
  }

  function handleLookupSubmit(event) {
    event.preventDefault()
    const trimmed = lookupIdInput.trim()
    if (!/^\d+$/.test(trimmed)) {
      setLookupResult(null)
      setLookupError('Enter a customer ID (a positive whole number).')
      return
    }

    setLookupResult(null)
    setLookupError('')
    setLookupLoading(true)
    apiGet(adminCustomerDetailEndpoint(trimmed), { accessToken })
      .then((data) => setLookupResult(data))
      .catch((err) => setLookupError(err.message || 'Unable to load this customer.'))
      .finally(() => setLookupLoading(false))
  }

  return (
    <main className="admin-customers">
      <style href="admin-customers-styles" precedence="default">
        {adminCustomersStyles}
      </style>

      <h1>Customers</h1>

      {isLoading && <p className="admin-customers-message">Loading customers...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-customers-message">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <>
          <form className="admin-customers-filters" onSubmit={handleSearchSubmit}>
            <div className="admin-customers-filter-field admin-customers-search-field">
              <label htmlFor="customer-search">Search</label>
              <input
                id="customer-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Username, email, or name"
              />
              <button type="submit">Search</button>
            </div>

            <div className="admin-customers-filter-field">
              <label htmlFor="customer-status-filter">Status</label>
              <select id="customer-status-filter" value={statusFilter} onChange={handleStatusFilterChange}>
                <option value="">All statuses</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            <div className="admin-customers-filter-field">
              <label htmlFor="customer-ordering">Sort by</label>
              <select id="customer-ordering" value={ordering} onChange={handleOrderingChange}>
                {ORDERING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </form>

          {customers.length === 0 && (
            <p className="admin-customers-message admin-customers-empty">No customers found.</p>
          )}

          {customers.length > 0 && (
            <ul className="admin-customers-list">
              {customers.map((customer) => {
                const isExpanded = expandedId === customer.id
                const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ')

                return (
                  <li
                    key={customer.id}
                    className={`admin-customer-card${customer.is_active ? '' : ' is-inactive'}`}
                  >
                    <div className="admin-customer-card-header">
                      <p className="admin-customer-username">{customer.username}</p>
                      <span className="admin-customer-status">
                        {customer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="admin-customer-details">
                      <span>{customer.email}</span>
                      <span>{fullName || '—'}</span>
                      <span>Joined {new Date(customer.date_joined).toLocaleDateString()}</span>
                    </div>

                    <div className="admin-customer-actions">
                      <button type="button" onClick={() => handleToggleDetail(customer)}>
                        {isExpanded ? 'Hide Details' : 'View Details'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="admin-customer-detail-panel">
                        {detailLoading && <p className="admin-customers-message">Loading details...</p>}
                        {!detailLoading && detailError && (
                          <p role="alert" className="admin-customers-message">
                            {detailError}
                          </p>
                        )}
                        {!detailLoading && !detailError && detailData && (
                          <dl>
                            <dt>ID</dt>
                            <dd>{detailData.id}</dd>
                            <dt>Username</dt>
                            <dd>{detailData.username}</dd>
                            <dt>Email</dt>
                            <dd>{detailData.email}</dd>
                            <dt>First name</dt>
                            <dd>{detailData.first_name || '—'}</dd>
                            <dt>Last name</dt>
                            <dd>{detailData.last_name || '—'}</dd>
                            <dt>Status</dt>
                            <dd>{detailData.is_active ? 'Active' : 'Inactive'}</dd>
                            <dt>Joined</dt>
                            <dd>{new Date(detailData.date_joined).toLocaleString()}</dd>
                          </dl>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="admin-customers-pagination">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={!pageInfo.previous}
            >
              Previous
            </button>
            <span className="admin-customers-pagination-count">
              Page {page} · {pageInfo.count} {pageInfo.count === 1 ? 'customer' : 'customers'}
            </span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!pageInfo.next}>
              Next
            </button>
          </div>

          <h2>Look Up Customer by ID</h2>
          <form className="admin-customer-lookup" onSubmit={handleLookupSubmit}>
            <div className="admin-customers-filter-field">
              <label htmlFor="customer-lookup-id">Customer ID</label>
              <input
                id="customer-lookup-id"
                type="text"
                inputMode="numeric"
                value={lookupIdInput}
                onChange={(event) => setLookupIdInput(event.target.value)}
                placeholder="e.g. 4"
              />
            </div>
            <button type="submit" disabled={lookupLoading}>
              {lookupLoading ? 'Looking up...' : 'Look Up'}
            </button>
          </form>

          {lookupError && (
            <p role="alert" className="admin-customers-message">
              {lookupError}
            </p>
          )}

          {lookupResult && (
            <div className="admin-customer-lookup-result">
              <dl>
                <dt>ID</dt>
                <dd>{lookupResult.id}</dd>
                <dt>Username</dt>
                <dd>{lookupResult.username}</dd>
                <dt>Email</dt>
                <dd>{lookupResult.email}</dd>
                <dt>First name</dt>
                <dd>{lookupResult.first_name || '—'}</dd>
                <dt>Last name</dt>
                <dd>{lookupResult.last_name || '—'}</dd>
                <dt>Status</dt>
                <dd>{lookupResult.is_active ? 'Active' : 'Inactive'}</dd>
                <dt>Joined</dt>
                <dd>{new Date(lookupResult.date_joined).toLocaleString()}</dd>
              </dl>
            </div>
          )}
        </>
      )}
    </main>
  )
}

export default Customers
