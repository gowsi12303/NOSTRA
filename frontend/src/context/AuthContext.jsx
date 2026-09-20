import { createContext, useEffect, useState } from 'react'
import { getCurrentUser, loginUser, registerUser } from '../api/auth'

export const AuthContext = createContext(undefined)

const ACCESS_TOKEN_KEY = 'nostra_access_token'
const REFRESH_TOKEN_KEY = 'nostra_refresh_token'

function readStoredToken(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    // localStorage can throw (private browsing, disabled storage, etc.) —
    // treat that the same as "no token stored".
    return null
  }
}

function storeTokens({ access, refresh }) {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } catch {
    // Ignore storage failures — the tokens still work for the current
    // in-memory session, they just won't survive a page reload.
  }
}

function clearStoredTokens() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Nothing more we can do if localStorage itself is unavailable.
  }
}

/**
 * Provides authentication state/actions to the whole app. Restores a
 * session from localStorage on mount (validating the stored access token
 * against GET /api/accounts/me/, not just trusting it blindly), and
 * exposes login/register/logout plus the derived user/isAuthenticated/
 * isStaff flags every page needs.
 *
 * No token-refresh/retry logic here yet (see api/auth.js) — a stored
 * access token that's expired or otherwise invalid is simply treated as
 * "not logged in" for now; that's deferred to a later step.
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

  useEffect(() => {
    const storedAccessToken = readStoredToken(ACCESS_TOKEN_KEY)
    if (!storedAccessToken) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    getCurrentUser(storedAccessToken)
      .then((currentUser) => {
        if (!cancelled) {
          setUser(currentUser)
          setAccessTokenState(storedAccessToken)
        }
      })
      .catch(() => {
        // Stored access token is missing/expired/invalid. Drop the stale
        // session rather than leaving the app looking authenticated when
        // it isn't.
        if (!cancelled) {
          clearStoredTokens()
          setUser(null)
          setAccessTokenState(null)
        }
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

  function logout() {
    clearStoredTokens()
    setUser(null)
    setAccessTokenState(null)
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
