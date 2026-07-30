import {
  Bell,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '../types'

export type View =
  | 'dashboard'
  | 'employees'
  | 'wallet'
  | 'payrolls'
  | 'transactions'
  | 'notifications'
  | 'settings'

export type NavigationItem = {
  id: View
  label: string
  headline: string
  icon: LucideIcon
  permission: Permission
}

export const appNavigation: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    headline: 'Your payroll operating picture',
    icon: LayoutDashboard,
    permission: 'dashboard.read',
  },
  {
    id: 'employees',
    label: 'Employees',
    headline: 'Team records and salary data',
    icon: Users,
    permission: 'employee.read',
  },
  {
    id: 'wallet',
    label: 'Wallet',
    headline: 'Fund and monitor payroll balance',
    icon: Wallet,
    permission: 'wallet.read',
  },
  {
    id: 'payrolls',
    label: 'Payroll',
    headline: 'Schedule and control payroll runs',
    icon: CalendarClock,
    permission: 'payroll.read',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    headline: 'Audit every money movement',
    icon: CreditCard,
    permission: 'transaction.read',
  },
  {
    id: 'notifications',
    label: 'Alerts',
    headline: 'Operational alerts',
    icon: Bell,
    permission: 'notification.read',
  },
  {
    id: 'settings',
    label: 'Settings',
    headline: 'Company profile and API settings',
    icon: Settings,
    permission: 'company.read',
  },
]
