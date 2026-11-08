import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, formatNaira } from '../api'
import { Can } from '../auth/Can'
import { PayrollRow } from '../components/PayrollRow'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import type { Payroll } from '../types'

export function PayrollPage() {
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16))
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const payrolls = useLoad(() => api.payrolls(status), [status])
  const employees = useLoad(() => api.employees(''))

  const total = useMemo(
    () => (employees.data || []).filter((employee) => selected.includes(employee.id)).reduce((sum, employee) => sum + employee.salary, 0),
    [employees.data, selected],
  )
  const minimumDate = new Date().toISOString().slice(0, 16)

  const createDraft = async () => {
    setMessage('')
    const scheduled = new Date(date)
    if (!date || Number.isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now()) {
      setMessage('Choose a valid date and time in the future.')
      return
    }
    try {
      await api.createPayrollDraft({ scheduledDate: scheduled.toISOString(), employeeIds: selected, note })
      setSelected([])
      setNote('')
      setMessage('Payroll draft created. Submit it for approval when ready.')
      payrolls.reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not schedule payroll')
    }
  }

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setActionMessage('')
    try {
      await action()
      setActionMessage(success)
      payrolls.reload()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Payroll action failed')
    }
  }

  const approve = async (id: string) => {
    if (!window.confirm('Approve this payroll and release the payment run?')) return
    await runAction(() => approveWithCode(id), 'Payroll approved.')
  }

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this payroll run? This cannot be undone.')) return
    await runAction(() => api.cancelPayroll(id), 'Payroll cancelled.')
  }

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
              <Field label="Scheduled date" type="datetime-local" min={minimumDate} value={date} onChange={setDate} required />
              <Field label="Note" value={note} onChange={setNote} />
            </div>
            <div className="my-4 flex justify-between rounded-lg bg-remit-50 p-3">
              <span>{selected.length} employees</span>
              <strong>{formatNaira(total)}</strong>
            </div>
            <button className="btn-primary" disabled={!selected.length} onClick={createDraft}>Create draft</button>
            {message && <div className="mt-4"><Notice title="Payroll status">{message}</Notice></div>}
          </Card>
        </Can>

        <Card title="Payroll analytics" subtitle="Status mix for the selected filter">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBuckets(payrolls.data || [])}>
                <CartesianGrid stroke="#e6dfda" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="status" tick={{ fill: '#766d73', fontSize: 10 }} axisLine={{ stroke: '#d8d0cc' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#766d73', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#e85d2a" radius={[5, 5, 0, 0]} />
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
                  <Can permission="payroll.submit">
                    {payroll.status === 'DRAFT' ? <button className="btn-secondary" onClick={(event) => {
                      event.stopPropagation()
                      api.submitPayroll(payroll.id).then(payrolls.reload)
                    }}>Submit</button> : null}
                  </Can>
                  <Can permission="payroll.approve">
                    {payroll.status === 'PENDING_APPROVAL' ? <button className="btn-secondary" onClick={(event) => {
                      event.stopPropagation()
                      void approve(payroll.id)
                    }}>Approve</button> : null}
                  </Can>
                  <Can permission="payroll.cancel">
                    {['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.status) ? <button className="btn-secondary" onClick={(event) => {
                      event.stopPropagation()
                      void cancel(payroll.id)
                    }}>Cancel</button> : null}
                  </Can>
                  <Can permission="payroll.retry">
                    {payroll.status === 'FAILED' ? <button className="btn-secondary" onClick={(event) => {
                      event.stopPropagation()
                      api.retryPayroll(payroll.id).then(payrolls.reload)
                    }}>Retry</button> : null}
                  </Can>
                </>
              }
            />
          </div>
        ))}
        <EmptyState show={!payrolls.data?.length} text="No payroll runs yet." />
      </Card>
      {actionMessage && <Notice title="Payroll status" tone={actionMessage.includes('failed') || actionMessage.includes('Failed') ? 'danger' : 'info'}>{actionMessage}</Notice>}
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
                <Can permission="payroll.submit">
                  {payroll.data.status === 'DRAFT' ? <button className="btn-secondary" onClick={() => api.submitPayroll(id).then(refreshAll)}>Submit for approval</button> : null}
                </Can>
                <Can permission="payroll.approve">
                  {payroll.data.status === 'PENDING_APPROVAL' ? <button className="btn-primary" onClick={async () => {
                    if (!window.confirm('Approve this payroll and release the payment run?')) return
                    await approveWithCode(id).then(refreshAll)
                  }}>Approve payroll</button> : null}
                </Can>
                <Can permission="payroll.cancel">
                  {['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.data.status) ? <button className="btn-secondary" onClick={async () => {
                    if (!window.confirm('Cancel this payroll run? This cannot be undone.')) return
                    await api.cancelPayroll(id).then(refreshAll)
                  }}>Cancel payroll</button> : null}
                </Can>
                <Can permission="payroll.retry">
                  {payroll.data.status === 'FAILED' ? <button className="btn-primary" onClick={() => {
                    if (confirm(`Retry ${failedRows.length} failed rows totaling ${formatNaira(failedRows.reduce((sum, row) => sum + row.amount, 0))}?`)) {
                      api.retryPayroll(id).then(refreshAll)
                    }
                  }}>Retry failed rows</button> : null}
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
                        <td className="px-3 py-3">{row.employee.bankName} ****{row.employee.accountNumberLast4 || '****'}</td>
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

async function approveWithCode(id: string) {
  const challenge = await api.approvalCode(id)
  if (challenge.required) {
    const code = window.prompt('Enter the 6-digit approval code sent to your email')
    if (!code) return
    return api.approvePayroll(id, code)
  }
  return api.approvePayroll(id)
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
