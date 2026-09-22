import { useMemo, useState } from 'react'
import { api, formatNaira } from '../api'
import { Card } from './ui/Card'
import { Field } from './ui/Field'
import { Notice } from './ui/Notice'
import type { Employee } from '../types'

interface CreatePayrollDraftCardProps {
  employees: Employee[]
  onCreated: () => void
}

export function CreatePayrollDraftCard({ employees, onCreated }: CreatePayrollDraftCardProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16))
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')

  const total = useMemo(
    () => employees.filter((employee) => selected.includes(employee.id)).reduce((sum, employee) => sum + employee.salary, 0),
    [employees, selected],
  )

  const createDraft = async () => {
    setMessage('')
    try {
      await api.createPayrollDraft({ scheduledDate: new Date(date).toISOString(), employeeIds: selected, note })
      setSelected([])
      setNote('')
      setMessage('Payroll draft created. Submit it for approval when ready.')
      onCreated()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not schedule payroll')
    }
  }

  return (
    <Card title="Create payroll draft" subtitle="Select employees, review totals, then submit for approval">
      <div className="mb-4 grid max-h-72 gap-2 overflow-auto">
        {employees.map((employee) => (
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
  )
}
