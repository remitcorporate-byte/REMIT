import { FormEvent, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { api } from '../api'
import type { User } from '../types'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'

type Mode = 'login' | 'register'

export function AuthScreen({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    companyName: '',
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const user =
        mode === 'login'
          ? await api.login(form.email, form.password)
          : await api.register({
              email: form.email,
              password: form.password,
              firstName: form.firstName,
              lastName: form.lastName,
              companyName: form.companyName,
            })
      onAuthed(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[1fr_minmax(360px,520px)]">
      <section
        className="flex min-h-[520px] flex-col justify-between bg-cover bg-center p-7 text-white sm:p-12"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(15,23,42,.76), rgba(29,78,216,.58)), url("https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1600&q=80")',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-remit-600 font-black">R</div>
          <div>
            <strong className="block">REMIT</strong>
            <span className="text-sm text-blue-100">Nigerian payroll operations</span>
          </div>
        </div>
        <div className="max-w-3xl">
          <p className="mb-5 text-lg text-blue-100">Payroll, wallet funding, employee records, approvals, and transaction history in one API-connected workspace.</p>
          <h1 className="max-w-4xl text-5xl font-black leading-none tracking-normal sm:text-7xl">Pay teams with clarity before money leaves the wallet.</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {['Live API', 'Kobo-safe', 'Paystack'].map((value) => (
            <div key={value} className="rounded-lg border border-white/20 bg-slate-950/50 p-4 backdrop-blur">
              <span className="text-sm text-slate-300">REMIT frontend</span>
              <strong className="mt-1 block text-xl">{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="m-0 self-center bg-white p-7 shadow-soft sm:m-8 sm:rounded-lg">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-remit-50 p-1">
          <button className={mode === 'login' ? 'rounded-md bg-white py-3 font-bold text-remit-600 shadow' : 'py-3 font-bold text-slate-500'} onClick={() => setMode('login')}>Sign in</button>
          <button className={mode === 'register' ? 'rounded-md bg-white py-3 font-bold text-remit-600 shadow' : 'py-3 font-bold text-slate-500'} onClick={() => setMode('register')}>Create account</button>
        </div>
        <h2 className="mt-6 text-3xl font-black tracking-normal">{mode === 'login' ? 'Welcome back' : 'Start your company workspace'}</h2>
        <p className="mt-2 text-sm text-slate-500">Connected to {import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}.</p>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          {mode === 'register' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required />
              <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required />
              <div className="sm:col-span-2">
                <Field label="Company name" value={form.companyName} onChange={(companyName) => setForm({ ...form, companyName })} required />
              </div>
            </div>
          )}
          <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
          <Field label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
          {error && <Notice tone="danger" title="Request failed">{error}</Notice>}
          <button className="btn-primary" disabled={loading}>
            {loading && <Loader2 className="animate-spin" size={18} />}
            {mode === 'login' ? 'Sign in' : 'Create workspace'}
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  )
}
