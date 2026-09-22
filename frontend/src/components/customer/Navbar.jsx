import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Navbar styles, scoped by class name. React 19 hoists a <style> with `href`
// + `precedence` into the document head once. Colors use light-dark() to
// follow the app's `color-scheme: light dark`.
const navbarStyles = `
  .navbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 32px;
    padding: 16px 24px;
    background-color: light-dark(#ffffff, #111111);
    border-bottom: 1px solid light-dark(#e5e5e5, #333333);
  }

  .navbar-brand {
    color: inherit;
    font-size: 1.4rem;
    font-weight: 300;
    letter-spacing: 0.3em;
    text-decoration: none;
  }

  .navbar-links {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 4px 24px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .navbar-links a {
    display: inline-block;
    padding: 6px 0;
    border-bottom: 1px solid transparent;
    color: inherit;
    font-size: 0.8rem;
    letter-spacing: 0.15em;
    opacity: 0.7;
    text-decoration: none;
    text-transform: uppercase;
    transition: opacity 0.2s ease, border-color 0.2s ease;
  }

  .navbar-links a:hover,
  .navbar-links a:focus-visible,
  .navbar-links a.active {
    border-bottom-color: currentColor;
    opacity: 1;
  }

  .navbar-user {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-left: auto;
  }

  .navbar-username {
    font-size: 0.85rem;
    opacity: 0.75;
  }

  .navbar-user button {
    padding: 8px 16px;
    border: 1px solid light-dark(#111111, #f5f5f5);
    background-color: transparent;
    color: light-dark(#111111, #f5f5f5);
    font: inherit;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .navbar-user button:hover,
  .navbar-user button:focus-visible {
    background-color: light-dark(#111111, #f5f5f5);
    color: light-dark(#ffffff, #111111);
  }

  /* Small screens: brand and user stay on the first row, and the links
     drop to their own full-width row below them. */
  @media (max-width: 720px) {
    .navbar {
      gap: 8px 16px;
      padding: 12px 16px;
    }

    .navbar-links {
      order: 3;
      flex: 0 0 100%;
      gap: 4px 20px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .navbar-links a,
    .navbar-user button {
      transition: none;
    }
  }
`

/**
 * Top navigation bar for the customer-facing app. Reusable across every
 * customer page — doesn't navigate after logout itself; pages that need
 * RequireAuth (e.g. Home) already redirect to /login on their own once
 * isAuthenticated flips false, so this component stays simple and isn't
 * coupled to any particular redirect target.
 */
function Navbar() {
  const { user, logout } = useAuth()

  return (
    <nav className="navbar">
      <style href="navbar-styles" precedence="default">
        {navbarStyles}
      </style>
      <NavLink to="/" className="navbar-brand">
        NOSTRA
      </NavLink>

      <ul className="navbar-links">
        <li>
          <NavLink to="/">Home</NavLink>
        </li>
        <li>
          <NavLink to="/products">Products</NavLink>
        </li>
        <li>
          <NavLink to="/wishlist">Wishlist</NavLink>
        </li>
        <li>
          <NavLink to="/cart">Cart</NavLink>
        </li>
        <li>
          <NavLink to="/orders">Orders</NavLink>
        </li>
        <li>
          <NavLink to="/addresses">Addresses</NavLink>
        </li>
      </ul>

      <div className="navbar-user">
        {user && (
          <>
            <span className="navbar-username">{user.username}</span>
            <button type="button" onClick={logout}>
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  )
}

export default Navbar
