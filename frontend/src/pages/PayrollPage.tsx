import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, authStore, formatNaira } from '../api'
import { PayrollRow } from '../components/PayrollRow'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import type { Payroll } from '../types'

export function PayrollPage() {
  const canRunPayroll = ['OWNER', 'ADMIN', 'FINANCE'].includes(authStore.user()?.role || '')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16))
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const payrolls = useLoad(() => api.payrolls(status), [status])
  const employees = useLoad(() => api.employees(''))

  const total = useMemo(
    () => (employees.data || []).filter((employee) => selected.includes(employee.id)).reduce((sum, employee) => sum + employee.salary, 0),
    [employees.data, selected],
  )

  const createDraft = async () => {
    setMessage('')
    try {
      await api.createPayrollDraft({ scheduledDate: new Date(date).toISOString(), employeeIds: selected, note })
      setSelected([])
      setNote('')
      setMessage('Payroll draft created. Submit it for approval when ready.')
      payrolls.reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not schedule payroll')
    }
  }

  return (
    <PageState loading={payrolls.loading} error={payrolls.error} onRetry={payrolls.reload}>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        {canRunPayroll ? (
          <Card title="Create payroll draft" subtitle="Select employees, review totals, then submit for approval">
            <div className="mb-4 grid max-h-72 gap-2 overflow-auto">
              {(employees.data || []).map((employee) => (
                <label key={employee.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(employee.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id),
                      )
                    }
                  />
                  <span>{employee.firstName} {employee.lastName}</span>
                  <strong>{formatNaira(employee.salary)}</strong>
                </label>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scheduled date" type="datetime-local" value={date} onChange={setDate} />
              <Field label="Note" value={note} onChange={setNote} />
            </div>
            <div className="my-4 flex justify-between rounded-lg bg-remit-50 p-3">
              <span>{selected.length} employees</span>
              <strong>{formatNaira(total)}</strong>
            </div>
            <button className="btn-primary" disabled={!selected.length} onClick={createDraft}>Create draft</button>
            {message && <div className="mt-4"><Notice title="Payroll status">{message}</Notice></div>}
          </Card>
        ) : (
          <Card title="Payroll access" subtitle="This account can review payroll activity but cannot create or approve payroll runs">
            <Notice title="Read-only role">Ask the company owner to grant Finance or Admin access before running payroll.</Notice>
          </Card>
        )}

        <Card title="Payroll analytics" subtitle="Status mix for the selected filter">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBuckets(payrolls.data || [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
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
                  {canRunPayroll && payroll.status === 'DRAFT' && <button className="btn-secondary" onClick={(event) => {
                    event.stopPropagation()
                    api.submitPayroll(payroll.id).then(payrolls.reload)
                  }}>Submit</button>}
                  {canRunPayroll && payroll.status === 'PENDING_APPROVAL' && <button className="btn-secondary" onClick={(event) => {
                    event.stopPropagation()
                    api.approvePayroll(payroll.id).then(payrolls.reload)
                  }}>Approve</button>}
                  {canRunPayroll && ['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.status) && <button className="btn-secondary" onClick={(event) => {
                    event.stopPropagation()
                    api.cancelPayroll(payroll.id).then(payrolls.reload)
                  }}>Cancel</button>}
                  {canRunPayroll && payroll.status === 'FAILED' && <button className="btn-secondary" onClick={(event) => {
                    event.stopPropagation()
                    api.retryPayroll(payroll.id).then(payrolls.reload)
                  }}>Retry</button>}
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

function statusBuckets(payrolls: Payroll[]) {
  const buckets = ['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((status) => ({ status, count: 0 }))
  payrolls.forEach((payroll) => {
    const bucket = buckets.find((item) => item.status === payroll.status)
    if (bucket) bucket.count += 1
  })
  return buckets
}

function PayrollDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const canRunPayroll = ['OWNER', 'ADMIN', 'FINANCE'].includes(authStore.user()?.role || '')
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
            <p className="text-sm text-slate-500">{payroll.data ? `${formatNaira(payroll.data.totalAmount)} · ${rows.length} employees` : 'Loading payroll...'}</p>
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
                {canRunPayroll && payroll.data.status === 'DRAFT' && <button className="btn-secondary" onClick={() => api.submitPayroll(id).then(refreshAll)}>Submit for approval</button>}
                {canRunPayroll && payroll.data.status === 'PENDING_APPROVAL' && <button className="btn-primary" onClick={() => api.approvePayroll(id).then(refreshAll)}>Approve payroll</button>}
                {canRunPayroll && ['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.data.status) && <button className="btn-secondary" onClick={() => api.cancelPayroll(id).then(refreshAll)}>Cancel payroll</button>}
                {canRunPayroll && payroll.data.status === 'FAILED' && <button className="btn-primary" onClick={() => {
                  if (confirm(`Retry ${failedRows.length} failed rows totaling ${formatNaira(failedRows.reduce((sum, row) => sum + row.amount, 0))}?`)) {
                    api.retryPayroll(id).then(refreshAll)
                  }
                }}>Retry failed rows</button>}
                <button className="btn-secondary" onClick={() => api.exportPayroll(id)}>Export CSV</button>
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

function printPayslip(payroll: Payroll, rowId: string) {
  const row = payroll.payrollEmployees?.find((item) => item.id === rowId)
  if (!row) return
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <html><head><title>Payslip</title></head><body style="font-family:Arial;padding:32px">
      <h1>REMIT Payslip</h1>
      <p><strong>Employee:</strong> ${row.employee.firstName} ${row.employee.lastName}</p>
      <p><strong>Email:</strong> ${row.employee.email}</p>
      <p><strong>Payroll Date:</strong> ${new Date(payroll.scheduledDate).toLocaleString()}</p>
      <p><strong>Amount:</strong> ${formatNaira(row.amount)}</p>
      <p><strong>Status:</strong> ${row.status}</p>
      <p><strong>Reference:</strong> ${row.transaction?.paystackReference || 'N/A'}</p>
    </body></html>
  `)
  win.document.close()
  win.print()
}
