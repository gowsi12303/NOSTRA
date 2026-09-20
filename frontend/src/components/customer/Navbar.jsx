import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

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
