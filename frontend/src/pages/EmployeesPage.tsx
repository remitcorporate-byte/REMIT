import { FormEvent, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { api, formatDate, formatNaira } from '../api'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import type { Employee } from '../types'

export function EmployeesPage() {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const employees = useLoad(() => api.employees(search), [search])

  return (
    <PageState loading={employees.loading} error={employees.error} onRetry={employees.reload}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <Search size={18} className="text-slate-400" />
          <input className="w-full bg-transparent outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employees by name or email" />
        </label>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Add employee
        </button>
      </div>

      {(showForm || editing) && (
        <EmployeeForm
          employee={editing}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onDone={employees.reload}
        />
      )}

      <Card title="Employees" subtitle={`${employees.data?.length || 0} active team members`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3">Salary</th>
                <th className="px-3 py-3">Next pay date</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(employees.data || []).map((employee) => (
                <tr key={employee.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-3 py-4">
                    <strong className="block">{employee.firstName} {employee.lastName}</strong>
                    <small className="text-slate-500">{employee.email}</small>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">{employee.department || 'Unassigned'}</td>
                  <td className="whitespace-nowrap px-3 py-4">{employee.bankName} ****{employee.accountNumber.slice(-4)}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-bold">{formatNaira(employee.salary)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{formatDate(employee.nextPaymentDate)}</td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <div className="flex gap-2">
                      <button className="btn-secondary" onClick={() => setEditing(employee)}>Edit</button>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (confirm(`Deactivate ${employee.firstName} ${employee.lastName}?`)) {
                            api.deleteEmployee(employee.id).then(employees.reload)
                          }
                        }}
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <EmptyState show={!employees.data?.length} text="Add employees to unlock payroll scheduling." />
      </Card>
    </PageState>
  )
}

function EmployeeForm({ employee, onClose, onDone }: { employee?: Employee | null; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const banks = useLoad(api.banks)
  const [verifiedName, setVerifiedName] = useState(employee?.accountName || '')
  const [form, setForm] = useState({
    firstName: employee?.firstName || '',
    lastName: employee?.lastName || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    bankName: employee?.bankName || 'GTBank',
    bankCode: employee?.bankCode || '058',
    accountNumber: employee?.accountNumber || '',
    salary: employee ? String(employee.salary / 100) : '250000',
    department: employee?.department || '',
    position: employee?.position || '',
    paymentFrequency: employee?.paymentFrequency || 'MONTHLY' as Employee['paymentFrequency'],
    nextPaymentDate: employee?.nextPaymentDate ? employee.nextPaymentDate.slice(0, 16) : '',
  })

  const verifyAccount = async () => {
    setError('')
    try {
      const result = await api.verifyBank({ bankCode: form.bankCode, accountNumber: form.accountNumber })
      setVerifiedName(result.account_name)
    } catch (err) {
      setVerifiedName('')
      setError(err instanceof Error ? err.message : 'Could not verify account')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        salary: Math.round(Number(form.salary) * 100),
        nextPaymentDate: form.nextPaymentDate ? new Date(form.nextPaymentDate).toISOString() : undefined,
      }
      if (employee) {
        await api.updateEmployee(employee.id, payload)
      } else {
        await api.createEmployee(payload)
      }
      onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create employee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card bg-slate-50" onSubmit={submit}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">{employee ? 'Edit employee' : 'Add employee'}</h3>
          <p className="mt-1 text-sm text-slate-500">Verify bank details before saving salary and recipient data.</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close form"><X size={18} /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required />
        <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required />
        <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
        <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <label className="field">
          <span className="field-label">Bank</span>
          <select
            className="field-control"
            value={form.bankCode}
            onChange={(event) => {
              const bank = banks.data?.find((item) => item.code === event.target.value)
              setForm({ ...form, bankCode: event.target.value, bankName: bank?.name || form.bankName })
              setVerifiedName('')
            }}
          >
            {(banks.data?.length ? banks.data : [{ name: form.bankName, code: form.bankCode }]).map((bank) => (
              <option key={bank.code} value={bank.code}>{bank.name}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-2">
          <Field label="Account number" value={form.accountNumber} onChange={(accountNumber) => {
            setForm({ ...form, accountNumber })
            setVerifiedName('')
          }} required />
          <button type="button" className="btn-secondary" onClick={verifyAccount} disabled={form.accountNumber.length < 10}>Verify account</button>
          {verifiedName && <small className="font-semibold text-mint-700">Verified: {verifiedName}</small>}
        </div>
        <Field label="Monthly salary in naira" type="number" value={form.salary} onChange={(salary) => setForm({ ...form, salary })} required />
        <Field label="Department" value={form.department} onChange={(department) => setForm({ ...form, department })} />
        <Field label="Position" value={form.position} onChange={(position) => setForm({ ...form, position })} />
        <label className="field">
          <span className="field-label">Frequency</span>
          <select className="field-control" value={form.paymentFrequency} onChange={(event) => setForm({ ...form, paymentFrequency: event.target.value as Employee['paymentFrequency'] })}>
            <option value="MONTHLY">Monthly</option>
            <option value="BIWEEKLY">Biweekly</option>
            <option value="WEEKLY">Weekly</option>
          </select>
        </label>
        <Field label="Next payment date" type="datetime-local" value={form.nextPaymentDate} onChange={(nextPaymentDate) => setForm({ ...form, nextPaymentDate })} />
      </div>
      {error && <div className="mt-4"><Notice tone="danger" title="Employee error">{error}</Notice></div>}
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={saving}>{saving ? 'Saving...' : employee ? 'Save changes' : 'Save employee'}</button>
      </div>
    </form>
  )
}
