import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Route guard for staff/admin-only routes. Nest protected <Route>
 * elements under a parent <Route element={<RequireStaff />}> — matched
 * children render via <Outlet />.
 */
function RequireStaff() {
  const { isAuthenticated, isStaff, isLoading } = useAuth()

  if (isLoading) {
    return <p>Loading...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isStaff) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default RequireStaff
