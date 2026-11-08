import { FormEvent, useMemo, useState } from 'react'
import { api } from '../api'
import { Notice } from '../components/ui/Notice'

export function PasswordRecoveryPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      if (token) { await api.resetPassword(token, password); setMessage('Password reset. You can sign in now.') }
      else { const response = await api.forgotPassword(email); setMessage(response.message || 'If an account exists, reset instructions have been sent.') }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed') }
  }
  return <main className="auth-page"><section className="auth-form-side"><div className="auth-form-wrap"><h2>{token ? 'Set a new password' : 'Forgot your password?'}</h2><p>{token ? 'Choose a new password for your REMIT account.' : 'Enter your work email and we will send reset instructions.'}</p><form onSubmit={submit} className="auth-form">{token ? <label className="auth-field"><span>New password</span><input type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required /></label> : <label className="auth-field"><span>Work email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}{error && <Notice tone="danger" title="Could not complete request">{error}</Notice>}{message && <Notice title="Request status">{message}</Notice>}<button className="auth-submit">{token ? 'Reset password' : 'Send reset link'}</button></form><a href="/" className="auth-switch">Back to sign in</a></div></section></main>
}
