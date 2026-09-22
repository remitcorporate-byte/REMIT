import { formatNaira } from '../api'
import type { Payroll } from '../types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function printPayslip(payroll: Payroll, rowId: string) {
  const row = payroll.payrollEmployees?.find((item) => item.id === rowId)
  if (!row) return
  const win = window.open('', '_blank')
  if (!win) return

  const employeeName = escapeHtml(`${row.employee.firstName} ${row.employee.lastName}`)
  const email = escapeHtml(row.employee.email)
  const scheduledDate = escapeHtml(new Date(payroll.scheduledDate).toLocaleString())
  const amount = escapeHtml(formatNaira(row.amount))
  const status = escapeHtml(row.status)
  const reference = escapeHtml(row.transaction?.paystackReference || 'N/A')

  win.document.write(`
    <html><head><title>Payslip</title></head><body style="font-family:Arial;padding:32px">
      <h1>REMIT Payslip</h1>
      <p><strong>Employee:</strong> ${employeeName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Payroll Date:</strong> ${scheduledDate}</p>
      <p><strong>Amount:</strong> ${amount}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Reference:</strong> ${reference}</p>
    </body></html>
  `)
  win.document.close()
  win.print()
}
