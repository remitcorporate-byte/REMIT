import { LogOut, Smartphone } from 'lucide-react'

export function EmployeeWebBoundary({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="employee-web-boundary">
      <div className="employee-web-mark"><i /><i /><i /><i /></div>
      <span><Smartphone size={28} /></span>
      <h1>Employee access is mobile-only.</h1>
      <p>The REMIT web workspace is reserved for company payroll operations. Use the REMIT mobile app to view payments, payslips, and personal alerts.</p>
      <button className="btn-secondary" onClick={onLogout}><LogOut size={17} /> Sign out</button>
    </main>
  )
}
