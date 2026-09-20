// Low-level HTTP client for the NOSTRA API. Every endpoint helper module
// (auth.js, products.js, etc. — added in later steps) is built on top of
// request() below; nothing outside src/api/ should call fetch() directly.

const DEFAULT_BASE_URL = 'http://localhost:8000'

// Vite exposes any VITE_-prefixed .env variable via import.meta.env at
// build time. Falls back to the local Django dev server if unset.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL

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
 * Note: does not attempt a token refresh on a 401 — that's out of scope
 * for this step and will be added alongside AuthContext.
 */
export async function request(path, options = {}) {
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

// Thin method-specific wrappers for readability at call sites.
export const apiGet = (path, options = {}) => request(path, { ...options, method: 'GET' })
export const apiPost = (path, body, options = {}) => request(path, { ...options, method: 'POST', body })
export const apiPatch = (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body })
export const apiDelete = (path, options = {}) => request(path, { ...options, method: 'DELETE' })
