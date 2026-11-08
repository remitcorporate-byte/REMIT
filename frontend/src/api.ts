import type {
  AuditLog,
  Bank,
  BankVerification,
  Company,
  Dashboard,
  Employee,
  Notification,
  Paginated,
  Payroll,
  Stats,
  SystemStatus,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  TeamMember,
  TeamRole,
  Transaction,
  User,
  Wallet,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
let accessToken: string | null = null
let cachedUser: User | null = null
let refreshPromise: Promise<User | null> | null = null

type ApiResponse<T> = {
  success: boolean
  data: T
  message?: string
  error?: string
}

async function download(path: string, filename: string) {
  const token = authStore.token()
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' })
  if (response.status === 401 && await refreshSession()) {
    const retryHeaders = new Headers(headers)
    const retryToken = authStore.token()
    if (retryToken) retryHeaders.set('Authorization', `Bearer ${retryToken}`)
    response = await fetch(`${API_URL}${path}`, { headers: retryHeaders, credentials: 'include' })
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Download failed (${response.status})`)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const authStore = {
  token: () => accessToken,
  user: (): User | null => cachedUser,
  save(token: string, user: User) {
    accessToken = token
    cachedUser = user
  },
  saveUser(user: User) {
    cachedUser = user
  },
  clear() {
    accessToken = null
    cachedUser = null
  },
}

async function refreshSession(): Promise<User | null> {
  if (typeof window !== 'undefined' && window.localStorage.getItem('remit_has_session') !== '1') return null
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired')
        const payload = await response.json() as ApiResponse<{ accessToken?: string; token?: string; user: User }>
        accessToken = payload.data.accessToken || payload.data.token || null
        cachedUser = payload.data.user
        window.localStorage.setItem('remit_has_session', '1')
        return cachedUser
      })
      .catch(() => {
        authStore.clear()
        window.localStorage.removeItem('remit_has_session')
        return null
      })
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export const restoreSession = refreshSession

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  const token = authStore.token()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' })
  } catch {
    throw new Error('Cannot connect to REMIT right now. Check your connection and try again.')
  }

  const text = await response.text()
  let payload: any = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      const contentType = response.headers.get('content-type') || 'unknown'
      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
        throw new Error(
          `API returned HTML instead of JSON. Check VITE_API_URL. Current target: ${API_URL} (${contentType})`,
        )
      }
      throw new Error(`API returned a non-JSON response. Check VITE_API_URL. Current target: ${API_URL} (${contentType})`)
    }
  }
  if (!response.ok) {
    const noRefresh = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/password/forgot', '/auth/password/reset'].some((route) => path.startsWith(route))
    if (response.status === 401 && !retried && !noRefresh) {
      const restored = await refreshSession()
      if (restored) return request<T>(path, init, true)
    }
    throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`)
  }
  return payload
}

export const api = {
  async login(email: string, password: string) {
    const res = await request<ApiResponse<{ accessToken?: string; token?: string; user: User }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    authStore.save(res.data.accessToken || res.data.token || '', res.data.user)
    window.localStorage.setItem('remit_has_session', '1')
    return res.data.user
  },
  async register(input: {
    email: string
    password: string
    firstName: string
    lastName: string
    companyName: string
  }) {
    const res = await request<ApiResponse<{ accessToken?: string; token?: string; user: User }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    authStore.save(res.data.accessToken || res.data.token || '', res.data.user)
    window.localStorage.setItem('remit_has_session', '1')
    return res.data.user
  },
  me: () => request<ApiResponse<User>>('/auth/me').then((r) => r.data),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }).finally(() => { authStore.clear(); window.localStorage.removeItem('remit_has_session') }),
  logoutAll: () => request<{ success: boolean }>('/auth/logout-all', { method: 'POST' }).finally(() => { authStore.clear(); window.localStorage.removeItem('remit_has_session') }),
  forgotPassword: (email: string) => request<{ success: boolean; message?: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ success: boolean }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (currentPassword: string, newPassword: string) => request<ApiResponse<{ accessToken?: string; token?: string }>>('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }).then((r) => { accessToken = r.data.accessToken || r.data.token || accessToken; return r }),
  sessions: () => request<ApiResponse<Array<{ id: string; deviceName?: string; userAgent?: string; ip?: string; createdAt: string; lastUsedAt: string; current: boolean }>>>('/auth/sessions').then((r) => r.data),
  revokeSession: (id: string) => request<{ success: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  company: () => request<ApiResponse<Company>>('/company').then((r) => r.data),
  updateCompany: (input: Partial<Company>) =>
    request<ApiResponse<Company>>('/company', { method: 'PUT', body: JSON.stringify(input) }).then((r) => r.data),
  team: () => request<ApiResponse<TeamMember[]>>('/team').then((r) => r.data),
  inviteTeamMember: (input: {
    email: string
    firstName: string
    lastName: string
    role: Extract<TeamRole, 'ADMIN' | 'FINANCE' | 'VIEWER'>
    password?: string
  }) =>
    request<ApiResponse<TeamMember>>('/team/invite', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data),
  updateTeamMemberRole: (id: string, role: Extract<TeamRole, 'ADMIN' | 'FINANCE' | 'VIEWER'>) =>
    request<ApiResponse<TeamMember>>(`/team/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }).then((r) => r.data),
  deactivateTeamMember: (id: string) =>
    request<ApiResponse<TeamMember>>(`/team/${id}/deactivate`, { method: 'PUT' }).then((r) => r.data),
  dashboard: () => request<ApiResponse<Dashboard>>('/company/dashboard').then((r) => r.data),
  stats: () => request<ApiResponse<Stats>>('/company/stats').then((r) => r.data),
  wallet: () => request<ApiResponse<Wallet>>('/wallet').then((r) => r.data),
  verifyDeposit: (reference: string) =>
    request<ApiResponse<{ transaction: Transaction; newBalance: number }>>(`/wallet/verify/${reference}`).then((r) => r.data),
  deposit: (amount: number) =>
    request<ApiResponse<{ authorizationUrl: string; reference: string }>>('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }).then((r) => r.data),
  employees: (search = '') =>
    request<Paginated<Employee>>(`/employees?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(
      (r) => r.data,
    ),
  createEmployee: (input: Omit<Employee, 'id' | 'isActive'>) =>
    request<ApiResponse<Employee>>('/employees', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data),
  banks: () => request<ApiResponse<Bank[]>>('/employees/banks').then((r) => r.data),
  verifyBank: (input: { bankCode: string; accountNumber: string }) =>
    request<ApiResponse<BankVerification>>('/employees/verify-bank', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.data),
  updateEmployee: (id: string, input: Partial<Employee>) =>
    request<ApiResponse<Employee>>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(input) }).then((r) => r.data),
  deleteEmployee: (id: string) => request<ApiResponse<unknown>>(`/employees/${id}`, { method: 'DELETE' }),
  payrolls: (status = '') =>
    request<Paginated<Payroll>>(`/payrolls?limit=100${status ? `&status=${status}` : ''}`).then((r) => r.data),
  createPayrollDraft: (input: { scheduledDate: string; employeeIds: string[]; note?: string }) =>
    request<ApiResponse<Payroll>>('/payrolls/drafts', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data),
  updatePayrollDraft: (id: string, input: { scheduledDate?: string; employeeIds?: string[]; note?: string }) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}`, { method: 'PUT', body: JSON.stringify(input) }).then((r) => r.data),
  payroll: (id: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}`).then((r) => r.data),
  submitPayroll: (id: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}/submit`, { method: 'PUT' }).then((r) => r.data),
  approvalCode: (id: string) => request<ApiResponse<{ required: boolean; expiresIn?: number }>>(`/payrolls/${id}/approval-code`, { method: 'POST' }).then((r) => r.data),
  approvePayroll: (id: string, code?: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}/approve`, { method: 'PUT', body: JSON.stringify(code ? { code } : {}) }).then((r) => r.data),
  cancelPayroll: (id: string) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}/cancel`, { method: 'PUT' }).then((r) => r.data),
  retryPayroll: (id: string) => request<ApiResponse<{ message: string }>>(`/payrolls/${id}/retry`, { method: 'PUT' }),
  transactions: () => request<Paginated<Transaction>>('/transactions?limit=100').then((r) => r.data),
  exportTransactions: () => download('/transactions/export', 'transactions.csv'),
  exportPayroll: (id: string) => download(`/payrolls/${id}/export`, `payroll-${id}.csv`),
  notifications: () =>
    request<Paginated<Notification> & { unreadCount: number }>('/notifications?limit=100').then((r) => ({
      notifications: r.data,
      unreadCount: r.unreadCount,
    })),
  markAllRead: () => request<ApiResponse<unknown>>('/notifications/read-all', { method: 'PUT' }),
  systemStatus: () => request<ApiResponse<SystemStatus>>('/company/system-status').then((r) => r.data),
  auditLog: () => request<ApiResponse<AuditLog[]>>('/company/audit-log?limit=50').then((r) => r.data),
  supportTickets: () => request<Paginated<SupportTicket>>('/support/tickets?limit=100').then((r) => r.data),
  supportTicket: (id: string) => request<ApiResponse<SupportTicket>>(`/support/tickets/${id}`).then((r) => r.data),
  createSupportTicket: (input: {
    category: SupportTicketCategory
    priority: SupportTicketPriority
    subject: string
    message: string
    payrollId?: string
    transactionId?: string
  }) => request<ApiResponse<SupportTicket>>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.data),
  replyToSupportTicket: (id: string, message: string) =>
    request<ApiResponse<SupportTicket>>(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }).then((r) => r.data),
  closeSupportTicket: (id: string) =>
    request<ApiResponse<SupportTicket>>(`/support/tickets/${id}/close`, { method: 'PUT' }).then((r) => r.data),
}

export const formatNaira = (kobo = 0) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100)

export const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not set'
