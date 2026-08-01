import { Banknote, CalendarClock, Check, Users, Wallet } from 'lucide-react'
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
      <div className="dashboard-metrics">
        <MetricCard title="Active employees" value={dashboard.data?.employeeCount || 0} icon={Users} />
        <MetricCard title="Available balance" value={formatNaira(dashboard.data?.availableBalance || 0)} icon={Wallet} />
        <MetricCard title="Payroll paid" value={formatNaira(paid)} icon={Banknote} />
        <MetricCard title="Scheduled runs" value={dashboard.data?.upcomingPayrolls.length || 0} icon={CalendarClock} />
      </div>

      <div className="dashboard-primary-grid">
        <Card title="Cash movement" subtitle="Deposits versus payroll debit trends">
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#e6dfda" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="month" interval="preserveStartEnd" minTickGap={16} tick={{ fill: '#766d73', fontSize: 10 }} axisLine={{ stroke: '#d8d0cc' }} tickLine={false} />
                <YAxis width={48} tickFormatter={(value) => `${Number(value) / 1000000}m`} tick={{ fill: '#766d73', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => formatNaira(Number(value))} />
                <Area type="monotone" dataKey="deposits" stroke="#2b132b" fill="#2b132b" fillOpacity={0.04} strokeWidth={2.2} />
                <Area type="monotone" dataKey="payroll" stroke="#e85d2a" fill="#e85d2a" fillOpacity={0.05} strokeWidth={2.2} />
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
        <div className="onboarding-rail">
          {onboarding.map((item) => (
            <div key={item.label} className={item.done ? 'is-done' : ''}>
              <strong>{item.done ? <Check size={16} strokeWidth={2.5} /> : onboarding.indexOf(item) + 1}</strong>
              <p>{item.label}<span>{item.done ? 'Completed' : 'Pending'}</span></p>
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
