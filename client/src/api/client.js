import axios from 'axios'

// The access token lives in memory only; the refresh token is an httpOnly cookie the browser handles.
let accessToken = null
const tokenListeners = new Set()

export const getToken = () => accessToken
export const setToken = (token) => {
  accessToken = token
  tokenListeners.forEach((fn) => fn(token))
}
export const onTokenChange = (fn) => {
  tokenListeners.add(fn)
  return () => tokenListeners.delete(fn)
}

let sessionExpiredHandler = () => {}
export const onSessionExpired = (fn) => {
  sessionExpiredHandler = fn
}

// A student still on a temporary PIN gets 403 PIN_CHANGE_REQUIRED from every route but a few;
// the auth layer uses this to send them to the change-PIN screen.
let pinChangeHandler = () => {}
export const onPinChangeRequired = (fn) => {
  pinChangeHandler = fn
}

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

const toApiError = (err) => {
  if (err instanceof ApiError) return err
  const body = err.response?.data
  return new ApiError({
    status: err.response?.status ?? 0,
    code: body?.error?.code ?? (err.response ? 'UNKNOWN_ERROR' : 'NETWORK_ERROR'),
    message: body?.error?.message ?? (err.response ? 'Something went wrong' : 'Cannot reach the server'),
    details: body?.error?.details,
    requestId: body?.requestId,
  })
}

// Empty in development (the Vite proxy serves /api); the API's origin in production, e.g. https://api.university.edu
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export const api = axios.create({ baseURL: `${API_ORIGIN}/api`, withCredentials: true })

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Refresh tokens rotate and a reused one revokes every session, so refreshes must never overlap:
// one shared promise within the tab, and a Web Lock across tabs so the second tab sends the new cookie.
let refreshPromise = null
const doRefresh = () => axios.post(`${API_ORIGIN}/api/auth/refresh`, null, { withCredentials: true })
  .then((res) => {
    setToken(res.data.data.accessToken)
    return res.data.data.accessToken
  })

export const refreshAccessToken = () => {
  refreshPromise ??= (navigator.locks ? navigator.locks.request('scrs-refresh', doRefresh) : doRefresh())
    .catch((err) => {
      setToken(null)
      throw toApiError(err)
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

/** Resolves once any refresh in flight has settled, so logout never races a token rotation. */
export const waitForRefresh = () => (refreshPromise ? refreshPromise.catch(() => {}) : Promise.resolve())

// While signing out, a 401 must not start a refresh: it would mint a new session cookie after logout.
let signingOut = false
export const setSigningOut = (value) => {
  signingOut = value
}

const NO_RETRY = ['/auth/login', '/auth/refresh', '/auth/logout']

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err
    if (response?.status === 401 && config && !config._retried && !signingOut && !NO_RETRY.some((p) => config.url?.startsWith(p))) {
      config._retried = true
      try {
        await refreshAccessToken()
        return api(config)
      } catch {
        sessionExpiredHandler()
      }
    }
    // With responseType 'blob' (slip PDFs) an error body arrives as a Blob; decode it so its message survives.
    if (response?.data instanceof Blob) {
      try { response.data = JSON.parse(await response.data.text()) } catch { /* not JSON; keep generic message */ }
    }
    const error = toApiError(err)
    if (error.code === 'PIN_CHANGE_REQUIRED') pinChangeHandler()
    throw error
  },
)

/** Unwraps the `{ success, data, meta }` envelope. */
export const unwrap = (res) => res.data.data
export const unwrapPage = (res) => ({ items: res.data.data, meta: res.data.meta })
