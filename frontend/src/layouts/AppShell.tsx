import { ReactNode, useState } from 'react'
import {
  Bell,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { User } from '../types'

export type View = 'dashboard' | 'employees' | 'wallet' | 'payrolls' | 'transactions' | 'notifications' | 'settings'

const nav: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'payrolls', label: 'Payroll', icon: CalendarClock },
  { id: 'transactions', label: 'Transactions', icon: CreditCard },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const headlines: Record<View, string> = {
  dashboard: 'Your payroll operating picture',
  employees: 'Team records and salary data',
  wallet: 'Fund and monitor payroll balance',
  payrolls: 'Schedule and control payroll runs',
  transactions: 'Audit every money movement',
  notifications: 'Operational alerts',
  settings: 'Company profile and API settings',
}

export function AppShell({ user, view, onViewChange, onLogout, children }: {
  user: User
  view: View
  onViewChange: (view: View) => void
  onLogout: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const current = nav.find((item) => item.id === view)!

  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[280px_1fr]">
      <aside className={clsx('fixed inset-y-0 left-0 z-30 w-[min(86vw,320px)] border-r border-slate-200 bg-white p-5 transition lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-remit-600 font-black text-white">R</div>
          <div className="min-w-0">
            <strong className="block text-ink">REMIT</strong>
            <span className="block text-xs text-slate-500">Payroll command center</span>
          </div>
          <button className="icon-button ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={19} />
          </button>
        </div>

        <nav className="mt-7 grid gap-2">
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={clsx('flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition', view === item.id ? 'bg-remit-50 text-remit-600' : 'text-slate-600 hover:bg-slate-50')}
                onClick={() => {
                  onViewChange(item.id)
                  setOpen(false)
                }}
              >
                <Icon size={19} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm shadow-soft">
          <ShieldCheck className="mb-2 text-remit-600" size={22} />
          <strong className="block">Paystack-ready</strong>
          <span className="mt-1 block text-slate-500">Wallet funding, recipients, payroll scheduling, and webhooks map to the backend.</span>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-20 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu" />}

      <main className="min-w-0">
        <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-slate-200 bg-slate-100/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:px-7">
          <div className="flex items-start gap-3">
            <button className="icon-button lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div>
              <p className="text-sm text-slate-500">{current.label}</p>
              <h1 className="text-xl font-bold tracking-normal text-ink sm:text-2xl">{headlines[view]}</h1>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-remit-100 font-black text-remit-600">{initials(user)}</span>
              <div className="min-w-0">
                <strong className="block truncate text-sm">{user.firstName} {user.lastName}</strong>
                <small className="block truncate text-xs text-slate-500">{user.companyName || user.company?.name || 'REMIT company'}</small>
              </div>
            </div>
            <button className="icon-button" onClick={onLogout} aria-label="Log out">
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <section className="grid gap-5 p-5 lg:p-7">{children}</section>
      </main>
    </div>
  )
}

function initials(user: User) {
  return `${user.firstName?.[0] || 'R'}${user.lastName?.[0] || ''}`.toUpperCase()
}
