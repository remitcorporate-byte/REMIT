import { useEffect, useState } from 'react'
import { AuthScreen } from './pages/AuthScreen'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PayrollPage } from './pages/PayrollPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { WalletPage } from './pages/WalletPage'
import { AppShell, type View } from './layouts/AppShell'
import { api, authStore } from './api'
import type { User } from './types'
import { LoadingState } from './components/ui/LoadingState'

export default function App() {
  const [user, setUser] = useState<User | null>(() => authStore.user())
  const [view, setView] = useState<View>('dashboard')
  const [booting, setBooting] = useState(Boolean(authStore.token()))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedView = params.get('view')
    if (requestedView && ['dashboard', 'employees', 'wallet', 'payrolls', 'transactions', 'notifications', 'settings'].includes(requestedView)) {
      setView(requestedView as View)
    }

    if (!authStore.token()) return

    api
      .me()
      .then((me) => setUser({ ...me, companyName: me.company?.name }))
      .catch(() => {
        authStore.clear()
        setUser(null)
      })
      .finally(() => setBooting(false))
  }, [])

  if (booting) return <LoadingState label="Checking session..." fullScreen />

  if (!user) return <AuthScreen onAuthed={setUser} />

  return (
    <AppShell user={user} view={view} onViewChange={setView} onLogout={() => {
      authStore.clear()
      setUser(null)
      setView('dashboard')
    }}>
      {view === 'dashboard' && <DashboardPage />}
      {view === 'employees' && <EmployeesPage />}
      {view === 'wallet' && <WalletPage />}
      {view === 'payrolls' && <PayrollPage />}
      {view === 'transactions' && <TransactionsPage />}
      {view === 'notifications' && <NotificationsPage />}
      {view === 'settings' && <SettingsPage />}
    </AppShell>
  )
}
