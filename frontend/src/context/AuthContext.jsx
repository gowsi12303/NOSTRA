import { createContext, useEffect, useState } from 'react'
import { getCurrentUser, loginUser, logoutUser, registerUser } from '../api/auth'
import { subscribeToSession } from '../api/client'
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeTokens,
} from '../api/tokenStorage'

export const AuthContext = createContext(undefined)

/**
 * Provides authentication state/actions to the whole app. Restores a
 * session from localStorage on mount (validating the stored access token
 * against GET /api/accounts/me/, not just trusting it blindly), and
 * exposes login/register/logout plus the derived user/isAuthenticated/
 * isStaff flags every page needs.
 *
 * Token refresh itself happens in api/client.js: any authenticated
 * request that gets a 401 refreshes the token pair once and retries.
 * This provider only listens for the outcome (see subscribeToSession
 * below) so its state follows the rotated access token, or drops to
 * logged-out when the refresh token is no longer accepted.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Not in the required export list, but needed so any authenticated API
  // call made by a page/component (e.g. fetching the cart) has a token to
  // send — the previous approach of only holding it in local variables
  // inside login()/the mount effect meant nothing outside AuthContext
  // could ever get at it.
  const [accessToken, setAccessTokenState] = useState(null)
  // Not in the required export list, but needed so consumers (route
  // guards, added in a later step) can tell "still checking the stored
  // session" apart from "checked, and there is none" — without it,
  // isAuthenticated would briefly read false on every page load even for
  // a valid session.
  const [isLoading, setIsLoading] = useState(true)

  useEffect(
    () =>
      // client.js reports every refresh outcome: a new access token after
      // a successful rotation, or null once the session can't be renewed.
      subscribeToSession((newAccessToken) => {
        setAccessTokenState(newAccessToken)
        if (!newAccessToken) setUser(null)
      }),
    [],
  )

  useEffect(() => {
    const storedAccessToken = getStoredAccessToken()
    if (!storedAccessToken) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    // An expired stored access token is refreshed transparently inside
    // this call, as long as the stored refresh token is still valid.
    getCurrentUser(storedAccessToken)
      .then((currentUser) => {
        if (!cancelled) {
          setUser(currentUser)
          // Read back from storage: the token may have just been rotated.
          setAccessTokenState(getStoredAccessToken() ?? storedAccessToken)
        }
      })
      .catch((error) => {
        if (cancelled) return
        // A 401 here means the refresh attempt failed too, so the stored
        // session is dead — drop it rather than leaving the app looking
        // authenticated when it isn't. Any other failure (server
        // unreachable, 5xx) says nothing about the tokens, so they are
        // kept for the next page load.
        if (error.status === 401) clearStoredTokens()
        setUser(null)
        setAccessTokenState(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function login(credentials) {
    const tokens = await loginUser(credentials)
    storeTokens(tokens)
    const currentUser = await getCurrentUser(tokens.access)
    setUser(currentUser)
    setAccessTokenState(tokens.access)
    return currentUser
  }

  async function register(data) {
    const result = await registerUser(data)
    // RegisterSerializer's response never includes access/refresh tokens
    // today (see API_DOCUMENTATION.md §2.1) — registration does not log
    // the user in. This only stores tokens if the backend response ever
    // starts including them; it does not fabricate a login otherwise.
    if (result?.access && result?.refresh) {
      storeTokens(result)
    }
    return result
  }

  async function logout() {
    const refreshToken = getStoredRefreshToken()

    // Local logout happens first and unconditionally, so it never waits
    // on — or depends on — the server.
    clearStoredTokens()
    setUser(null)
    setAccessTokenState(null)

    if (!refreshToken) return
    try {
      // Blacklist the refresh token server-side so it can't be reused.
      await logoutUser(refreshToken)
    } catch {
      // Token already invalid/expired, or the server is unreachable —
      // nothing left to revoke from here; the local session is gone
      // either way.
    }
  }

  const value = {
    user,
    accessToken,
    isAuthenticated: Boolean(user),
    isStaff: user?.is_staff === true,
    isLoading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
