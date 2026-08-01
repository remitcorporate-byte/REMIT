import type { LucideIcon } from 'lucide-react'

export function MetricCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="metric-card">
      <span><Icon size={20} strokeWidth={1.7} /></span>
      <div><p>{title}</p><strong>{value}</strong></div>
    </div>
  )
}
