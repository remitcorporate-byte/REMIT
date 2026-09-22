import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { AuthProvider } from './auth/AuthContext'
import '@fontsource-variable/manrope'
import '@fontsource-variable/oswald'

const PlatformApp = lazy(() => import('./platform/PlatformApp').then((module) => ({ default: module.PlatformApp })))
const platformMode = window.location.pathname.startsWith('/platform')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {platformMode ? (
      <Suspense fallback={<main className="grid min-h-screen place-items-center">Loading REMIT Support…</main>}>
        <PlatformApp />
      </Suspense>
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>,
)
