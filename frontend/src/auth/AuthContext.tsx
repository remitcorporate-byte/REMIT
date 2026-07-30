import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, authStore } from '../api'
import type { Permission, User } from '../types'

type AuthContextValue = {
  user: User | null
  booting: boolean
  can: (permission: Permission) => boolean
  setAuthenticatedUser: (user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => authStore.user())
  const [booting, setBooting] = useState(Boolean(authStore.token()))

  useEffect(() => {
    if (!authStore.token()) {
      setBooting(false)
      return
    }

    api.me()
      .then((currentUser) => {
        const refreshedUser = {
          ...currentUser,
          companyName: currentUser.company?.name,
        }
        authStore.saveUser(refreshedUser)
        setUser(refreshedUser)
      })
      .catch(() => {
        authStore.clear()
        setUser(null)
      })
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

  const logout = useCallback(() => {
    authStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, booting, can, setAuthenticatedUser, logout }),
    [user, booting, can, setAuthenticatedUser, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
