import { ReactNode } from 'react'
import type { Permission } from '../types'
import { useAuth } from './AuthContext'

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can } = useAuth()
  return can(permission) ? children : fallback
}
