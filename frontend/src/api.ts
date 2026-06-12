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
  TeamMember,
  TeamRole,
  Transaction,
  User,
  Wallet,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
const TOKEN_KEY = 'remit_token'
const USER_KEY = 'remit_user'

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
  const response = await fetch(`${API_URL}${path}`, { headers })
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
  token: () => localStorage.getItem(TOKEN_KEY),
  user: (): User | null => {
    const value = localStorage.getItem(USER_KEY)
    return value ? JSON.parse(value) : null
  },
  save(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  const token = authStore.token()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new Error('Cannot reach REMIT API. Start the backend or check VITE_API_URL.')
  }

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`)
  }
  return payload
}

export const api = {
  async login(email: string, password: string) {
    const res = await request<ApiResponse<{ token: string; user: User }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    authStore.save(res.data.token, res.data.user)
    return res.data.user
  },
  async register(input: {
    email: string
    password: string
    firstName: string
    lastName: string
    companyName: string
  }) {
    const res = await request<ApiResponse<{ token: string; user: User }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    authStore.save(res.data.token, res.data.user)
    return res.data.user
  },
  me: () => request<ApiResponse<User>>('/auth/me').then((r) => r.data),
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
  schedulePayroll: (input: { scheduledDate: string; employeeIds: string[]; note?: string }) =>
    request<ApiResponse<Payroll>>('/payrolls/schedule', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data),
  createPayrollDraft: (input: { scheduledDate: string; employeeIds: string[]; note?: string }) =>
    request<ApiResponse<Payroll>>('/payrolls/drafts', { method: 'POST', body: JSON.stringify(input) }).then((r) => r.data),
  updatePayrollDraft: (id: string, input: { scheduledDate?: string; employeeIds?: string[]; note?: string }) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}`, { method: 'PUT', body: JSON.stringify(input) }).then((r) => r.data),
  payroll: (id: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}`).then((r) => r.data),
  submitPayroll: (id: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}/submit`, { method: 'PUT' }).then((r) => r.data),
  approvePayroll: (id: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}/approve`, { method: 'PUT' }).then((r) => r.data),
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
}

export const formatNaira = (kobo = 0) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100)

export const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not set'
