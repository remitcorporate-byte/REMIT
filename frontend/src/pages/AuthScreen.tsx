import { FormEvent, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import { api, authStore } from '../api'
import type { User } from '../types'
import { Notice } from '../components/ui/Notice'
import './auth.css'

type Mode = 'login' | 'register'

function AuthBrand() {
  return <span className="auth-brand"><span aria-hidden="true"><i /><i /><i /><i /></span><strong>REMIT</strong></span>
}

export function AuthScreen({ onAuthed, initialMode = 'login', onBack }: {
  onAuthed: (user: User) => void
  initialMode?: Mode
  onBack?: () => void
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', companyName: '' })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = mode === 'login'
        ? await api.login(form.email.trim().toLowerCase(), form.password)
        : await api.register({ ...form, email: form.email.trim().toLowerCase() })
      if (user.role === 'EMPLOYEE') {
        authStore.clear()
        throw new Error('Employee accounts use the REMIT mobile app. This web workspace is for payroll operations.')
      }
      onAuthed(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode)
    setError('')
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <AuthBrand />
        {onBack && <button className="auth-back" onClick={onBack}><ArrowLeft size={18} /> Back to home</button>}
        <div className="auth-story-copy">
          <h1>Payday,<br />under control.</h1>
          <p>One workspace for funding, approvals, employee payments, and reconciliation.</p>
          <div className="auth-story-steps">
            {['Prepare with confidence', 'Approve with the right role', 'Track every outcome'].map((label) => (
              <span key={label}><i><Check size={17} /></i>{label}</span>
            ))}
          </div>
        </div>
        <div className="auth-flow-art" aria-hidden="true"><i /><i /><i /><i /><span><Check /></span></div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><AuthBrand />{onBack && <button onClick={onBack}><ArrowLeft size={18} /> Home</button>}</div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
          <p>{mode === 'login' ? 'Sign in to continue to your payroll workspace.' : 'Set up your company and prepare your first payroll run.'}</p>

          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <div className="auth-name-grid">
                <AuthField label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} autoComplete="given-name" />
                <AuthField label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} autoComplete="family-name" />
              </div>
            )}
            {mode === 'register' && <AuthField label="Company name" value={form.companyName} onChange={(companyName) => setForm({ ...form, companyName })} autoComplete="organization" />}
            <AuthField label="Work email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} autoComplete="email" />
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password">
                <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</button>
              </div>
            </label>

            {error && <Notice tone="danger" title="Could not sign in">{error}</Notice>}
            <button className="auth-submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={19} /> : <>{mode === 'login' ? 'Sign in' : 'Create workspace'} <ArrowRight size={19} /></>}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? 'New to REMIT?' : 'Already have an account?'}{' '}
            <button onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
          </p>
          <span className="auth-trust"><LockKeyhole size={17} /> Protected by role-based access</span>
        </div>
      </section>
    </main>
  )
}

function AuthField({ label, value, onChange, type = 'text', autoComplete }: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
}) {
  return <label className="auth-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required /></label>
}
