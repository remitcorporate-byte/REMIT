import { ComponentType, lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AuthScreen } from './pages/AuthScreen'
import { LoadingState } from './components/ui/LoadingState'
import { useAuth } from './auth/AuthContext'
import { appNavigation, type View } from './navigation/appNavigation'
import { LandingPage } from './pages/LandingPage'
import { EmployeeWebBoundary } from './pages/EmployeeWebBoundary'

type PublicView = 'landing' | 'auth'
type AuthMode = 'login' | 'register'

const AppShell = lazy(() => import('./layouts/AppShell').then((module) => ({ default: module.AppShell })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const EmployeesPage = lazy(() => import('./pages/EmployeesPage').then((module) => ({ default: module.EmployeesPage })))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })))
const PayrollPage = lazy(() => import('./pages/PayrollPage').then((module) => ({ default: module.PayrollPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then((module) => ({ default: module.TransactionsPage })))
const WalletPage = lazy(() => import('./pages/WalletPage').then((module) => ({ default: module.WalletPage })))
const SupportPage = lazy(() => import('./pages/SupportPage').then((module) => ({ default: module.SupportPage })))

export default function App() {
  const { user, booting, can, setAuthenticatedUser, logout } = useAuth()
  const [view, setView] = useState<View>('dashboard')
  const [publicView, setPublicView] = useState<PublicView>('landing')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const navigation = useMemo(
    () => appNavigation.filter((item) => can(item.permission)),
    [can],
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedView = params.get('view')
    const requestedRoute = navigation.find((item) => item.id === requestedView)
    if (requestedRoute) {
      setView(requestedRoute.id)
      return
    }
    if (!navigation.some((item) => item.id === view) && navigation[0]) {
      setView(navigation[0].id)
    }
  }, [navigation, view])

  if (booting) return <LoadingState label="Checking session..." fullScreen />

  if (!user) {
    if (publicView === 'landing') {
      return <LandingPage onAuth={(mode) => {
        setAuthMode(mode)
        setPublicView('auth')
      }} />
    }
    return (
      <AuthScreen
        key={authMode}
        initialMode={authMode}
        onAuthed={setAuthenticatedUser}
        onBack={() => setPublicView('landing')}
      />
    )
  }

  if (user.role === 'EMPLOYEE') return <EmployeeWebBoundary onLogout={logout} />

  const activeRoute = navigation.find((item) => item.id === view) || navigation[0]
  if (!activeRoute) return <main className="p-8">This account has no application permissions.</main>
  const CurrentPage = viewComponents[activeRoute.id]

  return (
    <Suspense fallback={<LoadingState label="Loading workspace..." fullScreen />}>
      <AppShell navigation={navigation} view={activeRoute.id} onViewChange={setView} onLogout={() => {
        logout()
        setView('dashboard')
      }}>
        <CurrentPage />
      </AppShell>
    </Suspense>
  )
}

const viewComponents: Record<View, ComponentType> = {
  dashboard: DashboardPage,
  employees: EmployeesPage,
  wallet: WalletPage,
  payrolls: PayrollPage,
  transactions: TransactionsPage,
  notifications: NotificationsPage,
  support: SupportPage,
  settings: SettingsPage,
}
