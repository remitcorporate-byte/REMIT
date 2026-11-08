import { ReactNode, useState } from 'react'
import { ArrowRight, LogOut, Menu, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../auth/AuthContext'
import type { NavigationItem, View } from '../navigation/appNavigation'
import type { User } from '../types'
import './operations.css'
import { labelFor } from '../labels'

export function AppShell({ navigation, view, onViewChange, onLogout, children }: {
  navigation: NavigationItem[]
  view: View
  onViewChange: (view: View) => void
  onLogout: () => void
  children: ReactNode
}) {
  const { user, can } = useAuth()
  const [open, setOpen] = useState(false)
  const current = navigation.find((item) => item.id === view) || navigation[0]
  if (!user || !current) return null

  return (
    <div className="operations-shell">
      <aside className={clsx('operations-sidebar', open ? 'is-open' : '')}>
        <div className="operations-brand">
          <span aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>REMIT</strong>
          <button onClick={() => setOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>

        <nav className="operations-nav" aria-label="Operations navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={view === item.id ? 'is-active' : ''} onClick={() => { onViewChange(item.id); setOpen(false) }}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="operations-user">
          <span>{initials(user)}</span>
          <div><strong>{user.firstName} {user.lastName}</strong><small>{user.companyName || user.company?.name || 'REMIT company'}</small><em>{labelFor(user.role)}</em></div>
          <button onClick={onLogout} aria-label="Log out"><LogOut size={18} /></button>
        </div>
      </aside>

      {open ? <button className="operations-overlay" onClick={() => setOpen(false)} aria-label="Close menu" /> : null}

      <main className="operations-main">
        <header className="operations-mobile-header">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="operations-mobile-wordmark"><i /> REMIT</div>
          <span>{initials(user)}</span>
        </header>
        <div className="operations-page-heading">
          <div><p>{current.label}</p><h1>{current.headline}</h1></div>
          {can('payroll.create') && view !== 'payrolls' ? (
            <button className="btn-primary" onClick={() => onViewChange('payrolls')}>Run payroll <ArrowRight size={17} /></button>
          ) : null}
        </div>
        <section className="operations-content">{children}</section>
      </main>
    </div>
  )
}

function initials(user: User) {
  return `${user.firstName?.[0] || 'R'}${user.lastName?.[0] || ''}`.toUpperCase()
}
