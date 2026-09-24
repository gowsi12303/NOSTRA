import { useEffect, useState } from 'react'
import { apiGet } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

// Admin-only paths, not yet added to src/api/endpoints.js — this step's
// scope is limited to Dashboard.jsx only, so they're kept local here rather
// than touching that shared file. Each is a real, existing backend endpoint
// (see products/urls.py's admin/categories|products|orders and
// accounts/urls.py's admin/customers), all staff/admin-only (IsAdminUser).
//
// `?page_size=1` keeps every response tiny: each of these views uses
// ProductPagination (PageNumberPagination), which always returns the full
// `count` of matching rows regardless of page_size — exactly what a summary
// card needs, without pulling every row's data down just to count them.
const ADMIN_SUMMARY_ENDPOINTS = {
  customers: '/api/accounts/admin/customers/?page_size=1',
  products: '/api/products/admin/products/?page_size=1',
  categories: '/api/products/admin/categories/?page_size=1',
  orders: '/api/products/admin/orders/?page_size=1',
}

const SUMMARY_CARDS = [
  { key: 'customers', label: 'Customers' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'orders', label: 'Orders' },
]

// Page styles, scoped under `.admin-dashboard`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once. Colors use light-dark() to follow the app's `color-scheme: light
// dark`, matching the rest of the app (Navbar, AdminLayout, etc.).
const adminDashboardStyles = `
  .admin-dashboard-message {
    margin: 16px 0 0;
    line-height: 1.6;
  }

  .admin-dashboard [role='alert'] {
    color: light-dark(#b00020, #ff8a8a);
  }

  .admin-dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    margin-top: 24px;
  }

  .admin-dashboard-card {
    padding: 24px 20px;
    border: 1px solid light-dark(#e5e5e5, #333333);
    border-radius: 4px;
    box-shadow: 0 1px 3px light-dark(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.4));
  }

  .admin-dashboard-card-label {
    margin: 0 0 8px;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    opacity: 0.65;
  }

  .admin-dashboard-card-value {
    margin: 0;
    font-size: 2.25rem;
    font-weight: 500;
  }
`

/**
 * Admin landing page: summary counts (customers/products/categories/orders)
 * pulled from the existing staff-only admin list endpoints. Read-only — no
 * mutation here, just four counts.
 */
function Dashboard() {
  const { accessToken } = useAuth()

  const [counts, setCounts] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!accessToken) return undefined

    let cancelled = false
    setIsLoading(true)
    setError('')

    Promise.all(
      SUMMARY_CARDS.map(({ key }) => apiGet(ADMIN_SUMMARY_ENDPOINTS[key], { accessToken })),
    )
      .then((responses) => {
        if (cancelled) return
        const nextCounts = {}
        SUMMARY_CARDS.forEach(({ key }, index) => {
          nextCounts[key] = responses[index]?.count ?? 0
        })
        setCounts(nextCounts)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Unable to load the dashboard summary.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  return (
    <main className="admin-dashboard">
      <style href="admin-dashboard-styles" precedence="default">
        {adminDashboardStyles}
      </style>

      <h1>Admin Dashboard</h1>

      {isLoading && <p className="admin-dashboard-message">Loading dashboard summary...</p>}

      {!isLoading && error && (
        <p role="alert" className="admin-dashboard-message">
          {error}
        </p>
      )}

      {!isLoading && !error && counts && (
        <div className="admin-dashboard-grid">
          {SUMMARY_CARDS.map(({ key, label }) => (
            <div className="admin-dashboard-card" key={key}>
              <p className="admin-dashboard-card-label">{label}</p>
              <p className="admin-dashboard-card-value">{counts[key]}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export default Dashboard
