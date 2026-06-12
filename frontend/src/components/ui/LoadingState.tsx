import { Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

export function LoadingState({ label, fullScreen = false }: { label: string; fullScreen?: boolean }) {
  return (
    <div className={clsx('grid place-items-center gap-3 p-8 text-center text-slate-500', fullScreen ? 'min-h-screen' : 'min-h-40')}>
      <Loader2 className="animate-spin text-remit-600" />
      <span>{label}</span>
    </div>
  )
}
