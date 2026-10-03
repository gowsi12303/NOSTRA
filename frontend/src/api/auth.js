// Thin auth endpoint helpers, built on client.js + endpoints.js. No token
// storage or refresh/retry logic lives here — this module only knows how
// to make the four requests themselves; AuthContext is responsible for
// what happens with the tokens it gets back. Token refresh is not one of
// them: it lives in client.js (refreshSession), next to the 401 retry
// that drives it.

import { apiGet, apiPost } from './client'
import { ENDPOINTS } from './endpoints'

/**
 * Register a new account.
 * @param {{ username: string, email: string, password: string }} data
 * @returns {Promise<{ id: number, username: string, email: string }>}
 */
export function registerUser(data) {
  return apiPost(ENDPOINTS.register, data)
}

/**
 * Log in with username/password.
 * @param {{ username: string, password: string }} data
 * @returns {Promise<{ access: string, refresh: string }>}
 */
export function loginUser(data) {
  return apiPost(ENDPOINTS.login, data)
}

/**
 * Server-side logout: blacklists the refresh token so it can never be
 * used again. Needs no access token — the refresh token is the
 * credential.
 * @param {string} refreshToken
 * @returns {Promise<object>}
 */
export function logoutUser(refreshToken) {
  return apiPost(ENDPOINTS.logout, { refresh: refreshToken })
}

/**
 * Fetch the currently authenticated user's own account.
 * @param {string} accessToken
 * @returns {Promise<{ id: number, username: string, email: string, first_name: string, last_name: string, is_staff: boolean }>}
 */
export function getCurrentUser(accessToken) {
  return apiGet(ENDPOINTS.currentUser, { accessToken })
}
