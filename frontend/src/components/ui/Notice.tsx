import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'

export function Notice({ title, children, tone = 'info' }: {
  title: string
  children: ReactNode
  tone?: 'info' | 'danger'
}) {
  const danger = tone === 'danger'
  const Icon = danger ? AlertTriangle : CheckCircle2

  return (
    <div className={clsx('flex gap-3 rounded-lg border p-3 text-sm', danger ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800')}>
      <Icon size={18} />
      <div>
        <strong>{title}</strong>
        <p className="mt-1">{children}</p>
      </div>
    </div>
  )
}
