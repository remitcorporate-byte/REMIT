import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, authStore, restoreSession } from '../api'
import type { Permission, User } from '../types'

type AuthContextValue = {
  user: User | null
  booting: boolean
  can: (permission: Permission) => boolean
  setAuthenticatedUser: (user: User) => void
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => authStore.user())
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    restoreSession()
      .then((currentUser) => currentUser && setUser(currentUser))
      .finally(() => setBooting(false))
  }, [])

  const can = useCallback(
    (permission: Permission) => Boolean(user?.permissions?.includes(permission)),
    [user?.permissions],
  )

  const setAuthenticatedUser = useCallback((authenticatedUser: User) => {
    authStore.saveUser(authenticatedUser)
    setUser(authenticatedUser)
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { authStore.clear() }
    setUser(null)
  }, [])

  const logoutAll = useCallback(async () => {
    try { await api.logoutAll() } catch { authStore.clear() }
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, booting, can, setAuthenticatedUser, logout, logoutAll }),
    [user, booting, can, setAuthenticatedUser, logout, logoutAll],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
