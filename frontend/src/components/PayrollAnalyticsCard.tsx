import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from './ui/Card'
import type { Payroll } from '../types'

interface PayrollAnalyticsCardProps {
  payrolls: Payroll[]
}

function statusBuckets(payrolls: Payroll[]) {
  const buckets = [
    'DRAFT',
    'PENDING_APPROVAL',
    'SCHEDULED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
  ].map((status) => ({ status, count: 0 }))

  payrolls.forEach((payroll) => {
    const bucket = buckets.find((item) => item.status === payroll.status)
    if (bucket) bucket.count += 1
  })
  return buckets
}

export function PayrollAnalyticsCard({ payrolls }: PayrollAnalyticsCardProps) {
  return (
    <Card title="Payroll analytics" subtitle="Status mix for the selected filter">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusBuckets(payrolls)}>
            <CartesianGrid stroke="#e6dfda" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="status" tick={{ fill: '#766d73', fontSize: 10 }} axisLine={{ stroke: '#d8d0cc' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#766d73', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#e85d2a" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
