import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Route guard for authenticated-only routes. Nest protected <Route>
 * elements under a parent <Route element={<RequireAuth />}> — matched
 * children render via <Outlet />.
 */
function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <p>Loading...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default RequireAuth
