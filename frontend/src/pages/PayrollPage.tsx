import { useState } from 'react'
import { api } from '../api'
import { Can } from '../auth/Can'
import { CreatePayrollDraftCard } from '../components/CreatePayrollDraftCard'
import { PayrollAnalyticsCard } from '../components/PayrollAnalyticsCard'
import { PayrollDetail } from '../components/PayrollDetail'
import { PayrollRow } from '../components/PayrollRow'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'

export function PayrollPage() {
  const [status, setStatus] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const payrolls = useLoad(() => api.payrolls(status), [status])
  const employees = useLoad(() => api.employees(''))

  return (
    <PageState loading={payrolls.loading} error={payrolls.error} onRetry={payrolls.reload}>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <Can
          permission="payroll.create"
          fallback={(
            <Card title="Payroll access" subtitle="This account can review payroll activity but cannot create or approve payroll runs">
              <Notice title="Read-only access">Your assigned permissions do not allow payroll creation.</Notice>
            </Card>
          )}
        >
          <CreatePayrollDraftCard
            employees={employees.data || []}
            onCreated={payrolls.reload}
          />
        </Can>

        <PayrollAnalyticsCard payrolls={payrolls.data || []} />
      </div>

      <div className="flex justify-end">
        <select className="field-control max-w-xs" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="PROCESSING">Processing</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <Card title="Payroll runs" subtitle="Cancel scheduled runs or retry failed runs">
        {(payrolls.data || []).map((payroll) => (
          <div key={payroll.id} onClick={() => setDetailId(payroll.id)} className="cursor-pointer">
            <PayrollRow
              payroll={payroll}
              actions={
                <>
                  <Can permission="payroll.submit">
                    {payroll.status === 'DRAFT' ? (
                      <button className="btn-secondary" onClick={(event) => {
                        event.stopPropagation()
                        api.submitPayroll(payroll.id)
                          .then(payrolls.reload)
                          .catch((err) => alert(err instanceof Error ? err.message : 'Could not submit payroll'))
                      }}>Submit</button>
                    ) : null}
                  </Can>
                  <Can permission="payroll.approve">
                    {payroll.status === 'PENDING_APPROVAL' ? (
                      <button className="btn-secondary" onClick={(event) => {
                        event.stopPropagation()
                        api.approvePayroll(payroll.id)
                          .then(payrolls.reload)
                          .catch((err) => alert(err instanceof Error ? err.message : 'Could not approve payroll'))
                      }}>Approve</button>
                    ) : null}
                  </Can>
                  <Can permission="payroll.cancel">
                    {['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.status) ? (
                      <button className="btn-secondary" onClick={(event) => {
                        event.stopPropagation()
                        api.cancelPayroll(payroll.id)
                          .then(payrolls.reload)
                          .catch((err) => alert(err instanceof Error ? err.message : 'Could not cancel payroll'))
                      }}>Cancel</button>
                    ) : null}
                  </Can>
                  <Can permission="payroll.retry">
                    {payroll.status === 'FAILED' ? (
                      <button className="btn-secondary" onClick={(event) => {
                        event.stopPropagation()
                        api.retryPayroll(payroll.id)
                          .then(payrolls.reload)
                          .catch((err) => alert(err instanceof Error ? err.message : 'Could not retry payroll'))
                      }}>Retry</button>
                    ) : null}
                  </Can>
                </>
              }
            />
          </div>
        ))}
        <EmptyState show={!payrolls.data?.length} text="No payroll runs yet." />
      </Card>
      {detailId && <PayrollDetail id={detailId} onClose={() => setDetailId(null)} onChanged={payrolls.reload} />}
    </PageState>
  )
}
