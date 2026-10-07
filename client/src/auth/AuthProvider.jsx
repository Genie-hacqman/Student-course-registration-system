import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth'
import { setMonitoringUser } from '../lib/monitoring'
import {
  onPinChangeRequired, onSessionExpired, refreshAccessToken, setSigningOut, setToken, waitForRefresh,
} from '../api/client'

const AuthContext = createContext(null)

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

  useEffect(() => { setMonitoringUser(user) }, [user])

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
    changePin: async (body) => establish(await authApi.changePin(body)),
    logout: async ({ everywhere = false } = {}) => {
      setSigningOut(!everywhere)
      try {
        await waitForRefresh()
        await (everywhere ? authApi.logoutAll() : authApi.logout())
      } finally {
        clearSession()
      }
    },
    endSession: clearSession,
    refreshUser: async () => setUser(await authApi.me()),
    setProfile: setUser,
  }), [user, status, establish, clearSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
