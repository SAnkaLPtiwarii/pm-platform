import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getTokens, setAuthLostHandler, setTokens } from '../lib/api'
import type { User } from '../lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => getTokens() !== null)

  // The API client calls this when a refresh fails: the session is over.
  useEffect(() => {
    setAuthLostHandler(() => {
      setUser(null)
      queryClient.clear()
    })
    return () => setAuthLostHandler(null)
  }, [queryClient])

  // Restore the session on page load.
  useEffect(() => {
    if (!getTokens()) return
    let cancelled = false
    api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password })
    setTokens({ access: result.access_token, refresh: result.refresh_token })
    setUser(await api.me())
  }, [])

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await api.register({ name, email, password })
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(async () => {
    const current = getTokens()
    if (current) {
      try {
        await api.logout(current.refresh)
      } catch {
        // best effort: the local session is cleared either way
      }
    }
    setTokens(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )
  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}