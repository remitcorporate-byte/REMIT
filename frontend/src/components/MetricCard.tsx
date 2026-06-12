import type { LucideIcon } from 'lucide-react'

export function MetricCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <strong className="mt-2 block text-2xl tracking-normal text-ink">{value}</strong>
      </div>
      <Icon className="text-remit-600" size={25} />
    </div>
  )
}
