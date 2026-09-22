import { api, formatNaira } from '../api'
import { Can } from '../auth/Can'
import { Card } from './ui/Card'
import { Notice } from './ui/Notice'
import { PageState } from './ui/PageState'
import { useLoad } from '../hooks/useLoad'
import { printPayslip } from '../utils/printPayslip'
import type { Payroll } from '../types'

interface PayrollDetailProps {
  id: string
  onClose: () => void
  onChanged: () => void
}

export function PayrollDetail({ id, onClose, onChanged }: PayrollDetailProps) {
  const payroll = useLoad(() => api.payroll(id), [id])
  const rows = payroll.data?.payrollEmployees || []
  const failedRows = rows.filter((row) => row.status === 'FAILED')

  const refreshAll = () => {
    payroll.reload()
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/40 p-4">
      <div className="ml-auto grid max-h-[calc(100vh-2rem)] w-full max-w-4xl gap-4 overflow-auto rounded-lg bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Payroll detail</h2>
            <p className="text-sm text-slate-500">
              {payroll.data ? `${formatNaira(payroll.data.totalAmount)} · ${rows.length} employees` : 'Loading payroll...'}
            </p>
          </div>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        <PageState loading={payroll.loading} error={payroll.error} onRetry={payroll.reload}>
          {payroll.data && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Card title="Status"><strong>{payroll.data.status}</strong></Card>
                <Card title="Scheduled"><strong>{new Date(payroll.data.scheduledDate).toLocaleString()}</strong></Card>
                <Card title="Failed rows"><strong>{failedRows.length}</strong></Card>
                <Card title="Total"><strong>{formatNaira(payroll.data.totalAmount)}</strong></Card>
              </div>
              {payroll.data.failureReason && <Notice tone="danger" title="Failure reason">{payroll.data.failureReason}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Can permission="payroll.submit">
                  {payroll.data.status === 'DRAFT' ? (
                    <button className="btn-secondary" onClick={() => {
                      api.submitPayroll(id)
                        .then(refreshAll)
                        .catch((err) => alert(err instanceof Error ? err.message : 'Could not submit payroll'))
                    }}>Submit for approval</button>
                  ) : null}
                </Can>
                <Can permission="payroll.approve">
                  {payroll.data.status === 'PENDING_APPROVAL' ? (
                    <button className="btn-primary" onClick={() => {
                      api.approvePayroll(id)
                        .then(refreshAll)
                        .catch((err) => alert(err instanceof Error ? err.message : 'Could not approve payroll'))
                    }}>Approve payroll</button>
                  ) : null}
                </Can>
                <Can permission="payroll.cancel">
                  {['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.data.status) ? (
                    <button className="btn-secondary" onClick={() => {
                      api.cancelPayroll(id)
                        .then(refreshAll)
                        .catch((err) => alert(err instanceof Error ? err.message : 'Could not cancel payroll'))
                    }}>Cancel payroll</button>
                  ) : null}
                </Can>
                <Can permission="payroll.retry">
                  {payroll.data.status === 'FAILED' ? (
                    <button className="btn-primary" onClick={() => {
                      if (confirm(`Retry ${failedRows.length} failed rows totaling ${formatNaira(failedRows.reduce((sum, row) => sum + row.amount, 0))}?`)) {
                        api.retryPayroll(id)
                          .then(refreshAll)
                          .catch((err) => alert(err instanceof Error ? err.message : 'Could not retry payroll'))
                      }
                    }}>Retry failed rows</button>
                  ) : null}
                </Can>
                <Can permission="payroll.export">
                  <button className="btn-secondary" onClick={() => api.exportPayroll(id)}>Export CSV</button>
                </Can>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="px-3 py-3">Employee</th>
                      <th className="px-3 py-3">Bank</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Reference</th>
                      <th className="px-3 py-3">Payslip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-3 py-3">
                          <strong>{row.employee.firstName} {row.employee.lastName}</strong>
                          <small className="block text-slate-500">{row.employee.email}</small>
                        </td>
                        <td className="px-3 py-3">{row.employee.bankName} ****{row.employee.accountNumber.slice(-4)}</td>
                        <td className="px-3 py-3 font-bold">{formatNaira(row.amount)}</td>
                        <td className="px-3 py-3">{row.status}</td>
                        <td className="px-3 py-3">{row.transaction?.paystackReference || 'Awaiting transfer'}</td>
                        <td className="px-3 py-3">
                          <button className="btn-secondary" onClick={() => printPayslip(payroll.data!, row.id)}>Print</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PageState>
      </div>
    </div>
  )
}
