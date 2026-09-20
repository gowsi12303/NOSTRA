import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Access the auth context (user, isAuthenticated, isStaff, isLoading,
 * login, register, logout) from any component rendered inside
 * <AuthProvider>. Throws if called outside one, so a missing provider
 * fails loudly at the call site instead of silently returning
 * `undefined` and breaking somewhere unrelated later.
 */
export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth() must be called within an <AuthProvider>.')
  }

  return context
}
