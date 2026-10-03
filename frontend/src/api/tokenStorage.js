// The one place JWT tokens are persisted. Both client.js (which rotates
// them on refresh) and AuthContext (which sets them on login and clears
// them on logout) go through here, so there is never a second copy of
// either token to fall out of sync.

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

export const getStoredAccessToken = () => readStoredToken(ACCESS_TOKEN_KEY)
export const getStoredRefreshToken = () => readStoredToken(REFRESH_TOKEN_KEY)

export function storeTokens({ access, refresh }) {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } catch {
    // Ignore storage failures — the tokens still work for the current
    // in-memory session, they just won't survive a page reload.
  }
}

export function clearStoredTokens() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Nothing more we can do if localStorage itself is unavailable.
  }
}
