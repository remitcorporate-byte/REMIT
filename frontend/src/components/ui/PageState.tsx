import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { LoadingState } from './LoadingState'

export function PageState({ loading, error, onRetry, children }: {
  loading: boolean
  error: string
  onRetry: () => void
  children: ReactNode
}) {
  if (loading) return <LoadingState label="Loading live REMIT data..." />

  if (error) {
    return (
      <div className="card grid min-h-48 place-items-center gap-3 text-center text-red-800">
        <AlertTriangle />
        <strong>Backend connection issue</strong>
        <p className="max-w-xl text-sm">{error}</p>
        <button className="btn-secondary" onClick={onRetry}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    )
  }

  return <>{children}</>
}
