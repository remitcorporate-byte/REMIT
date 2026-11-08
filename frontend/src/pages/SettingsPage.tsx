import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card } from '../components/ui/Card'
import { Field } from '../components/ui/Field'
import { Notice } from '../components/ui/Notice'
import { PageState } from '../components/ui/PageState'
import { useLoad } from '../hooks/useLoad'
import type { Company, TeamMember, TeamRole } from '../types'
import { Can } from '../auth/Can'
import { useAuth } from '../auth/AuthContext'
import { deviceLabel, labelFor } from '../labels'

const assignableRoles: Array<Extract<TeamRole, 'ADMIN' | 'FINANCE' | 'VIEWER'>> = ['ADMIN', 'FINANCE', 'VIEWER']

export function SettingsPage() {
  const { can, logoutAll } = useAuth()
  const canManageCompany = can('company.manage')
  const canViewAudit = can('audit.read')
  const company = useLoad(api.company)
  const systemStatus = useLoad(api.systemStatus)
  const auditLog = useLoad(() => (canViewAudit ? api.auditLog() : Promise.resolve([])), [canViewAudit])
  const team = useLoad(api.team)
  const sessions = useLoad(api.sessions)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })
  const [passwordMessage, setPasswordMessage] = useState('')
  const [form, setForm] = useState<Partial<Company>>({})
  const [message, setMessage] = useState('')
  const [teamMessage, setTeamMessage] = useState('')
  const [invite, setInvite] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'FINANCE' as Extract<TeamRole, 'ADMIN' | 'FINANCE' | 'VIEWER'>,
    password: '',
  })

  useEffect(() => {
    if (company.data) setForm(company.data)
  }, [company.data])

  const save = async () => {
    setMessage('')
    try {
      await api.updateCompany(form)
      setMessage('Company settings saved.')
      company.reload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save company')
    }
  }

  const inviteMember = async () => {
    setTeamMessage('')
    try {
      const created = await api.inviteTeamMember({
        ...invite,
        password: invite.password || undefined,
      })
      setInvite({ firstName: '', lastName: '', email: '', role: 'FINANCE', password: '' })
      setTeamMessage(
        created.temporaryPassword
          ? `Team member invited. Temporary password: ${created.temporaryPassword}`
          : 'Team member invited.',
      )
      team.reload()
    } catch (err) {
      setTeamMessage(err instanceof Error ? err.message : 'Could not invite team member')
    }
  }

  const updateRole = async (member: TeamMember, role: Extract<TeamRole, 'ADMIN' | 'FINANCE' | 'VIEWER'>) => {
    setTeamMessage('')
    try {
      await api.updateTeamMemberRole(member.id, role)
      setTeamMessage('Team member role updated.')
      team.reload()
    } catch (err) {
      setTeamMessage(err instanceof Error ? err.message : 'Could not update role')
    }
  }

  const deactivate = async (member: TeamMember) => {
    if (!confirm(`Deactivate ${member.firstName} ${member.lastName}?`)) return
    setTeamMessage('')
    try {
      await api.deactivateTeamMember(member.id)
      setTeamMessage('Team member deactivated.')
      team.reload()
    } catch (err) {
      setTeamMessage(err instanceof Error ? err.message : 'Could not deactivate team member')
    }
  }

  const changePassword = async () => {
    try { await api.changePassword(passwords.currentPassword, passwords.newPassword); setPasswords({ currentPassword: '', newPassword: '' }); setPasswordMessage('Password changed.') } catch (err) { setPasswordMessage(err instanceof Error ? err.message : 'Could not change password') }
  }

  return (
    <PageState loading={company.loading} error={company.error} onRetry={company.reload}>
      <Card title="Company profile" subtitle="Updates the /company backend resource">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" value={form.name || ''} onChange={(name) => setForm({ ...form, name })} disabled={!canManageCompany} />
          <Field label="Email" type="email" value={form.email || ''} onChange={(email) => setForm({ ...form, email })} disabled={!canManageCompany} />
          <Field label="Phone" value={form.phone || ''} onChange={(phone) => setForm({ ...form, phone })} disabled={!canManageCompany} />
          <Field label="Address" value={form.address || ''} onChange={(address) => setForm({ ...form, address })} disabled={!canManageCompany} />
        </div>
        <Can permission="company.manage">
          <button className="btn-primary mt-5" onClick={save}>Save settings</button>
        </Can>
        {message && <div className="mt-4"><Notice title="Settings status">{message}</Notice></div>}
      </Card>

      <Card title="Team access" subtitle="Invite finance users, admins, and read-only viewers">
        <PageState loading={team.loading} error={team.error} onRetry={team.reload}>
          <Can permission="team.manage">
            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1fr_1.3fr_.8fr_1fr_auto]">
              <Field label="First name" value={invite.firstName} onChange={(firstName) => setInvite({ ...invite, firstName })} />
              <Field label="Last name" value={invite.lastName} onChange={(lastName) => setInvite({ ...invite, lastName })} />
              <Field label="Email" type="email" value={invite.email} onChange={(email) => setInvite({ ...invite, email })} />
              <label className="field">
                <span className="field-label">Role</span>
                <select
                  className="field-control"
                  value={invite.role}
                  onChange={(event) => setInvite({ ...invite, role: event.target.value as typeof invite.role })}
                >
                  {assignableRoles.map((role) => <option key={role} value={role}>{labelFor(role)}</option>)}
                </select>
              </label>
              <Field label="Password optional" type="password" value={invite.password} onChange={(password) => setInvite({ ...invite, password })} />
              <button className="btn-primary self-end" onClick={inviteMember}>Invite</button>
            </div>
          </Can>
          {teamMessage && <div className="mb-4"><Notice title="Team status">{teamMessage}</Notice></div>}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <Can permission="team.manage">
                    <th className="px-3 py-3">Actions</th>
                  </Can>
                </tr>
              </thead>
              <tbody>
                {(team.data || []).map((member) => (
                  <tr key={member.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-medium">{member.firstName} {member.lastName}</td>
                    <td className="px-3 py-3">{member.email}</td>
                    <td className="px-3 py-3">
                      <Can permission="team.manage" fallback={member.role}>
                        {member.role !== 'OWNER' ? (
                          <select
                            className="field-control min-w-32"
                            value={member.role}
                            onChange={(event) => updateRole(member, event.target.value as Extract<TeamRole, 'ADMIN' | 'FINANCE' | 'VIEWER'>)}
                          >
                            {assignableRoles.map((role) => <option key={role} value={role}>{labelFor(role)}</option>)}
                          </select>
                        ) : labelFor(member.role)}
                      </Can>
                    </td>
                    <td className="px-3 py-3">{member.isActive ? 'Active' : 'Inactive'}</td>
                    <Can permission="team.manage">
                      <td className="px-3 py-3">
                        {member.role !== 'OWNER' && member.isActive ? (
                          <button className="btn-secondary" onClick={() => deactivate(member)}>Deactivate</button>
                        ) : null}
                      </td>
                    </Can>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageState>
      </Card>

      <Card title="System status" subtitle="Backend provider and runtime readiness">
        <PageState loading={systemStatus.loading} error={systemStatus.error} onRetry={systemStatus.reload}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Status label="API" value={systemStatus.data?.apiConnected ? 'Connected' : 'Unavailable'} />
            <Status label="Database" value={systemStatus.data?.databaseConnected ? 'Connected' : 'Unavailable'} />
            <Status label="Paystack" value={systemStatus.data?.paystackMode || 'unknown'} />
            <Status label="Scheduler" value={systemStatus.data?.schedulerMode || 'unknown'} />
            <Status
              label="Queue"
              value={
                systemStatus.data
                  ? `${systemStatus.data.queueMode} · ${systemStatus.data.queueConnected ? 'connected' : 'unavailable'}`
                  : 'unknown'
              }
            />
          </div>
        </PageState>
      </Card>

      <Card title="Password and sessions" subtitle="Protect your account across devices">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password" type="password" value={passwords.currentPassword} onChange={(currentPassword) => setPasswords({ ...passwords, currentPassword })} />
          <Field label="New password" type="password" minLength={8} value={passwords.newPassword} onChange={(newPassword) => setPasswords({ ...passwords, newPassword })} />
        </div>
        <button className="btn-primary mt-4" disabled={!passwords.currentPassword || passwords.newPassword.length < 8} onClick={changePassword}>Change password</button>
        {passwordMessage && <Notice title="Password status">{passwordMessage}</Notice>}
        <div className="mt-6 grid gap-2">
          {(sessions.data || []).map((session) => <div key={session.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"><span>{deviceLabel(session.userAgent, session.deviceName)} {session.current ? '· This device' : ''}<small className="ml-2 text-slate-500">Last used {new Date(session.lastUsedAt).toLocaleString()}</small></span>{!session.current && <button className="btn-secondary" onClick={() => api.revokeSession(session.id).then(sessions.reload)}>Revoke</button>}</div>)}
        </div>
        <button className="btn-secondary mt-4" onClick={() => {
          if (window.confirm('Sign out of every active REMIT session?')) void logoutAll()
        }}>Sign out everywhere</button>
      </Card>

      <Can permission="audit.read">
        <Card title="Activity log" subtitle="Recent operational actions and provider events">
          <PageState loading={auditLog.loading} error={auditLog.error} onRetry={auditLog.reload}>
            <div className="grid gap-3">
              {(auditLog.data || []).map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <strong>{item.action}</strong>
                  <p className="text-sm text-slate-500">{item.entityType}{item.entityId ? ` - ${item.entityId}` : ''}</p>
                  <small className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</small>
                </div>
              ))}
              {!auditLog.data?.length && <p className="text-sm text-slate-500">No activity recorded yet.</p>}
            </div>
          </PageState>
        </Card>
      </Can>
    </PageState>
  )
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <span className="text-xs uppercase text-slate-500">{label}</span>
      <strong className="mt-1 block">{value}</strong>
    </div>
  )
}
