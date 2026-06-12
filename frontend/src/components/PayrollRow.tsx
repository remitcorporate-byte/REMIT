import type { ReactNode } from 'react'
import type { Payroll } from '../types'
import { formatDate, formatNaira } from '../api'
import { StatusPill } from './ui/StatusPill'

export function PayrollRow({ payroll, actions }: { payroll: Payroll; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <strong className="block text-lg">{formatNaira(payroll.totalAmount)}</strong>
        <span className="text-sm text-slate-500">{formatDate(payroll.scheduledDate)} · {payroll.employeeCount || payroll._count?.payrollEmployees || 0} employees</span>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill value={payroll.status} />
        {actions}
      </div>
    </div>
  )
}
