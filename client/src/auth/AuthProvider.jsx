import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import {
  onPinChangeRequired, onSessionExpired, refreshAccessToken, setSigningOut, setToken, waitForRefresh,
} from '../api/client'

const AuthContext = createContext(null)

// Restores the session from the refresh cookie once per page load. Memoised at module level so
// StrictMode's double effect can't issue two rotating refreshes.
let bootstrapPromise = null
const bootstrap = () => {
  bootstrapPromise ??= refreshAccessToken()
    .then(() => authApi.me())
    .catch(() => null)
  return bootstrapPromise
}

export function AuthProvider({ children }) {
  const qc = useQueryClient()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  const clearSession = useCallback(() => {
    setToken(null)
    setUser(null)
    setStatus('anonymous')
    qc.clear()
    // A later mount (e.g. hot reload) must ask the server again, not reuse the signed-in result.
    bootstrapPromise = null
    setSigningOut(false)
  }, [qc])

  useEffect(() => {
    let active = true
    bootstrap().then((me) => {
      if (!active) return
      setUser(me)
      setStatus(me ? 'authenticated' : 'anonymous')
    })
    onSessionExpired(clearSession)
    onPinChangeRequired(() => setUser((u) => (u ? { ...u, mustChangePassword: true } : u)))
    return () => {
      active = false
    }
  }, [clearSession])

  const establish = useCallback((data) => {
    setToken(data.accessToken)
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const value = useMemo(() => ({
    user,
    status,
    login: async (credentials) => establish(await authApi.login(credentials)),
    /** The server ends every session on a PIN change and returns fresh tokens for this device. */
    changePin: async (body) => establish(await authApi.changePin(body)),
    logout: async ({ everywhere = false } = {}) => {
      // Let any refresh in flight finish first, so the logout carries the newest cookie and revokes it.
      // logout-all needs a valid access token and revokes every token anyway, so it may still refresh.
      setSigningOut(!everywhere)
      try {
        await waitForRefresh()
        await (everywhere ? authApi.logoutAll() : authApi.logout())
      } finally {
        clearSession()
      }
    },
    /** For flows where the server already ended the session (password change). */
    endSession: clearSession,
    /** Re-reads the profile after it changed on the server (name edit, email verified). */
    refreshUser: async () => setUser(await authApi.me()),
  }), [user, status, establish, clearSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
