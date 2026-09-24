import { NavLink } from 'react-router-dom'

// Layout styles, scoped under `.admin-layout`. Rendered through a <style>
// with `href` + `precedence` so React 19 hoists it into the document head
// once, however many admin pages mount this layout. Colors use light-dark()
// to follow the app's `color-scheme: light dark`, matching Navbar and the
// rest of the customer pages.
const adminLayoutStyles = `
  .admin-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .admin-layout-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 24px;
    padding: 16px 24px;
    background-color: light-dark(#ffffff, #111111);
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-layout-brand {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .admin-layout-back {
    margin-left: auto;
    color: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-decoration: none;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .admin-layout-back:hover,
  .admin-layout-back:focus-visible {
    opacity: 1;
    text-decoration: underline;
  }

  .admin-layout-body {
    display: flex;
    flex: 1;
  }

  .admin-layout-nav {
    flex: 0 0 200px;
    padding: 24px 16px;
    background-color: light-dark(#fafafa, #181818);
    border-right: 1px solid light-dark(#e5e5e5, #333333);
  }

  .admin-layout-nav ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .admin-layout-nav a {
    display: block;
    padding: 8px 12px;
    border-radius: 4px;
    color: inherit;
    font-size: 0.9rem;
    text-decoration: none;
    opacity: 0.75;
  }

  .admin-layout-nav a:hover,
  .admin-layout-nav a:focus-visible {
    opacity: 1;
    background-color: light-dark(#eeeeee, #262626);
  }

  .admin-layout-nav a.active {
    opacity: 1;
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  .admin-layout-content {
    flex: 1;
    min-width: 0;
    padding: 24px;
  }

  /* Small screens: nav drops above the content as a horizontal bar rather
     than a fixed-width side column. */
  @media (max-width: 640px) {
    .admin-layout-body {
      flex-direction: column;
    }

    .admin-layout-nav {
      flex: none;
      border-right: 0;
      border-bottom: 1px solid light-dark(#e5e5e5, #333333);
    }

    .admin-layout-nav ul {
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
`

const ADMIN_NAV_LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/variants', label: 'Variants' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/payments', label: 'Payments' },
]

/**
 * Shell for the admin section: a header (brand + "Back to Store") and a
 * sidebar nav, wrapping whatever admin page is rendered as `children`.
 * Mirrors how Navbar wraps the customer pages, but as a children-based
 * wrapper (used as <AdminLayout><SomePage /></AdminLayout> in
 * AppRoutes.jsx) rather than an Outlet-based layout route.
 */
function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <style href="admin-layout-styles" precedence="default">
        {adminLayoutStyles}
      </style>

      <header className="admin-layout-header">
        <h1 className="admin-layout-brand">NOSTRA Admin</h1>
        <NavLink to="/" className="admin-layout-back">
          Back to Store
        </NavLink>
      </header>

      <div className="admin-layout-body">
        <nav className="admin-layout-nav">
          <ul>
            {ADMIN_NAV_LINKS.map(({ to, label, end }) => (
              <li key={to}>
                <NavLink to={to} end={end}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* A div, not <main> — each admin page (Dashboard.jsx etc.) already
            renders its own <main>, so nesting one here would duplicate the
            page's main landmark. */}
        <div className="admin-layout-content">{children}</div>
      </div>
    </div>
  )
}

export default AdminLayout
