// Low-level HTTP client for the NOSTRA API. Every endpoint helper module
// (auth.js, products.js, etc. — added in later steps) is built on top of
// request() below; nothing outside src/api/ should call fetch() directly.

import { ENDPOINTS } from './endpoints'
import { clearStoredTokens, getStoredAccessToken, getStoredRefreshToken, storeTokens } from './tokenStorage'

// Only the dev server falls back to the local Django dev server. A
// production build never contains that URL: with VITE_API_BASE_URL unset
// it uses same-origin relative paths (frontend and API behind one domain).
const DEFAULT_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : ''

// Vite exposes any VITE_-prefixed .env variable via import.meta.env at
// build time. A trailing slash is dropped, since every path starts with one.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')

/**
 * A normalized error thrown by request() for any non-2xx response, or a
 * network failure. Callers can rely on this shape regardless of how DRF
 * formatted the underlying error response.
 */
export class ApiError extends Error {
  constructor(message, { status = null, data = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function parseJsonSafely(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // Non-JSON body (e.g. an HTML error page from a misconfigured URL) —
    // treat as no parsed data rather than throwing here; the caller still
    // gets the HTTP status to work with.
    return null
  }
}

/**
 * Turn DRF's various error response shapes into one human-readable
 * message:
 *   - {"detail": "..."}                      (auth/permission/404 errors)
 *   - {"field": ["message", ...], ...}        (validation errors)
 *   - {"non_field_errors": ["message"]}       (serializer-level errors)
 *   - a plain string, or no body at all
 */
function extractErrorMessage(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data

  if (typeof data.detail === 'string') return data.detail

  const firstField = Object.keys(data)[0]
  if (firstField) {
    const value = data[firstField]
    const message = Array.isArray(value) ? value[0] : value
    if (typeof message === 'string') {
      return firstField === 'non_field_errors' ? message : `${firstField}: ${message}`
    }
  }

  return fallback
}

// Performs exactly one HTTP request — no refresh, no retry. request()
// below layers the 401 handling on top of this.
async function send(path, options = {}) {
  const { method = 'GET', body = null, accessToken = null, headers = {} } = options

  const requestHeaders = { ...headers }
  let requestBody

  if (body !== null && body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }

  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: requestBody,
    })
  } catch {
    throw new ApiError('Unable to reach the server. Check your connection and try again.', {
      status: null,
      data: null,
    })
  }

  const data = await parseJsonSafely(response)

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data, `Request failed with status ${response.status}.`), {
      status: response.status,
      data,
    })
  }

  return data
}

// --- Session refresh ---------------------------------------------------

const sessionListeners = new Set()

/**
 * Subscribe to access-token changes made by this module: the listener is
 * called with the new access token after a successful refresh, or with
 * null once the session is over (refresh token rejected). AuthContext
 * uses this to keep its state in step. Returns an unsubscribe function.
 */
export function subscribeToSession(listener) {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

function notifySession(accessToken) {
  sessionListeners.forEach((listener) => listener(accessToken))
}

async function runRefresh() {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) {
    clearStoredTokens()
    notifySession(null)
    return null
  }

  let tokens
  try {
    tokens = await send(ENDPOINTS.tokenRefresh, { method: 'POST', body: { refresh: refreshToken } })
  } catch (error) {
    // Only a rejection of the token itself (400/401) ends the session; a
    // network failure or 5xx/429 says nothing about its validity, so the
    // tokens are kept and the next request simply tries again.
    if (error.status !== 400 && error.status !== 401) return null
    // Another tab may have rotated the token first, which is why ours was
    // rejected — in that case its newer tokens are the session.
    if (getStoredRefreshToken() !== refreshToken) return getStoredAccessToken()
    clearStoredTokens()
    notifySession(null)
    return null
  }

  // The stored token changed while the refresh was in flight (logout, or
  // a rotation in another tab) — don't overwrite that newer state.
  if (getStoredRefreshToken() !== refreshToken) return getStoredAccessToken()

  // The backend rotates refresh tokens: the one just sent is now dead, so
  // the one in the response must replace it.
  storeTokens({ access: tokens.access, refresh: tokens.refresh ?? refreshToken })
  notifySession(tokens.access)
  return tokens.access
}

let refreshInFlight = null

/**
 * Exchange the stored refresh token for a new token pair and store it.
 * Concurrent callers share a single in-flight request. Resolves to the
 * new access token, or null if no usable token could be obtained.
 */
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/**
 * Core request function used by every endpoint helper.
 *
 * @param {string} path - path relative to API_BASE_URL, e.g. '/api/products/'
 * @param {object} [options]
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} [options.method='GET']
 * @param {object|null} [options.body=null] - JSON-serializable request body
 * @param {string|null} [options.accessToken=null] - JWT access token, sent
 *   as `Authorization: Bearer <accessToken>` when provided
 * @param {object} [options.headers] - extra headers to merge in
 * @returns {Promise<any>} the parsed JSON response body, or null for an
 *   empty (e.g. 204 No Content) response
 * @throws {ApiError} on any non-2xx response or network failure
 *
 * A 401 on a request that carried an access token triggers one token
 * refresh and one retry. Requests sent without a token (public
 * endpoints, login, register) are never refreshed or retried. If no
 * replacement token can be obtained, the original 401 is thrown.
 */
export async function request(path, options = {}) {
  const { accessToken = null } = options

  try {
    return await send(path, options)
  } catch (error) {
    if (!accessToken || error.status !== 401) throw error

    // The caller may still hold a token that has already been replaced
    // (e.g. by a refresh another request triggered a moment ago) — then
    // the stored one is the retry candidate, no second refresh needed.
    const storedAccessToken = getStoredAccessToken()
    const replacement =
      storedAccessToken && storedAccessToken !== accessToken ? storedAccessToken : await refreshSession()
    if (!replacement) throw error

    return send(path, { ...options, accessToken: replacement })
  }
}

// Thin method-specific wrappers for readability at call sites.
export const apiGet = (path, options = {}) => request(path, { ...options, method: 'GET' })
export const apiPost = (path, body, options = {}) => request(path, { ...options, method: 'POST', body })
export const apiPatch = (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body })
export const apiDelete = (path, options = {}) => request(path, { ...options, method: 'DELETE' })
