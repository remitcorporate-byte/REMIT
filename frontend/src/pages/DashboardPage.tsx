import { Banknote, CalendarClock, Users, Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, formatNaira } from '../api'
import { MetricCard } from '../components/MetricCard'
import { PayrollRow } from '../components/PayrollRow'
import { TransactionsTable } from '../components/TransactionsTable'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'

const fallbackTrends = [
  { month: 'Jan', deposits: 780000000, payroll: 520000000 },
  { month: 'Feb', deposits: 640000000, payroll: 540000000 },
  { month: 'Mar', deposits: 890000000, payroll: 610000000 },
  { month: 'Apr', deposits: 760000000, payroll: 650000000 },
  { month: 'May', deposits: 930000000, payroll: 690000000 },
  { month: 'Jun', deposits: 1040000000, payroll: 720000000 },
]

export function DashboardPage() {
  const dashboard = useLoad(api.dashboard)
  const stats = useLoad(api.stats)
  const employees = useLoad(() => api.employees(''))
  const payrolls = useLoad(() => api.payrolls(''))
  const trends = stats.data?.trends.length ? stats.data.trends : fallbackTrends
  const paid = stats.data?.financials.totalPaidOut || 0
  const onboarding = [
    { label: 'Company profile created', done: Boolean(dashboard.data) },
    { label: 'Wallet funded', done: (dashboard.data?.walletBalance || 0) > 0 },
    { label: 'Employee added', done: Boolean(employees.data?.length) },
    { label: 'Payroll draft created', done: Boolean(payrolls.data?.some((payroll) => ['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'PROCESSING', 'COMPLETED'].includes(payroll.status))) },
    { label: 'Payroll approved or processed', done: Boolean(payrolls.data?.some((payroll) => ['SCHEDULED', 'PROCESSING', 'COMPLETED'].includes(payroll.status))) },
  ]

  return (
    <PageState loading={dashboard.loading} error={dashboard.error} onRetry={dashboard.reload}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active employees" value={dashboard.data?.employeeCount || 0} icon={Users} />
        <MetricCard title="Available balance" value={formatNaira(dashboard.data?.availableBalance || 0)} icon={Wallet} />
        <MetricCard title="Payroll paid" value={formatNaira(paid)} icon={Banknote} />
        <MetricCard title="Scheduled runs" value={dashboard.data?.upcomingPayrolls.length || 0} icon={CalendarClock} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Card title="Cash movement" subtitle="Deposits versus payroll debit trends">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${Number(value) / 1000000}m`} />
                <Tooltip formatter={(value) => formatNaira(Number(value))} />
                <Area type="monotone" dataKey="deposits" stroke="#1d4ed8" fill="#dbeafe" />
                <Area type="monotone" dataKey="payroll" stroke="#0f766e" fill="#ccfbf1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Upcoming payrolls" subtitle="Runs waiting on the scheduler">
          {dashboard.data?.upcomingPayrolls.map((payroll) => <PayrollRow payroll={payroll} key={payroll.id} />)}
          <EmptyState show={!dashboard.data?.upcomingPayrolls.length} text="No scheduled payrolls yet." />
        </Card>
      </div>

      <Card title="Onboarding checklist" subtitle="Operational steps to get the first payroll out">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {onboarding.map((item) => (
            <div key={item.label} className={item.done ? 'rounded-lg border border-mint-200 bg-mint-50 p-3' : 'rounded-lg border border-slate-200 p-3'}>
              <strong>{item.done ? 'Done' : 'Open'}</strong>
              <p className="mt-1 text-sm text-slate-600">{item.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recent transactions" subtitle="Latest wallet and payroll activity">
        <TransactionsTable rows={dashboard.data?.recentTransactions || []} compact />
      </Card>
    </PageState>
  )
}
