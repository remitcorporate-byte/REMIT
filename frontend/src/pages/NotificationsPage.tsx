import { Bell } from 'lucide-react'
import { api, formatDate } from '../api'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'

export function NotificationsPage() {
  const notifications = useLoad(api.notifications)
  const rows = notifications.data?.notifications || []

  return (
    <PageState loading={notifications.loading} error={notifications.error} onRetry={notifications.reload}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <strong>{notifications.data?.unreadCount || 0} unread notifications</strong>
        <button className="btn-secondary" onClick={() => api.markAllRead().then(notifications.reload)}>Mark all read</button>
      </div>
      <Card title="Alerts" subtitle="Operational events from payroll, deposits, and employees">
        {rows.map((item) => (
          <div className={item.isRead ? 'flex gap-3 border-b border-slate-100 py-4 last:border-b-0' : 'flex gap-3 border-b border-slate-100 py-4 text-remit-600 last:border-b-0'} key={item.id}>
            <Bell size={18} />
            <div>
              <strong>{item.title}</strong>
              <p className="mt-1 text-sm text-slate-600">{item.message}</p>
              <small className="text-xs text-slate-500">{formatDate(item.createdAt)}</small>
            </div>
          </div>
        ))}
        <EmptyState show={!rows.length} text="No notifications yet." />
      </Card>
    </PageState>
  )
}
