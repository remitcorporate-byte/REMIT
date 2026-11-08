import type {
  ApiResponse,
  AppNotification,
  Bank,
  BankVerification,
  Dashboard,
  NotificationPage,
  Employee,
  Paginated,
  Payroll,
  SystemStatus,
  Transaction,
  User,
  Wallet,
  Session,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
} from '@/src/types/api';
import { deleteSecureItem, getSecureItem, setSecureItem } from '@/src/lib/secure-storage';
import { Platform } from 'react-native';

export const NOTIFICATIONS_KEY = ['notifications'] as const;

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
const REFRESH_KEY = 'remit.mobile.refresh-token';

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export async function setRefreshToken(token: string | null) {
  if (token) await setSecureItem(REFRESH_KEY, token);
  else await deleteSecureItem(REFRESH_KEY);
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = getSecureItem(REFRESH_KEY).then(async (refreshToken) => {
      if (!refreshToken) return false;
      let response: Response;
      try {
        response = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', 'X-Device-Name': Platform.OS === 'web' ? 'REMIT mobile web' : Platform.OS === 'ios' ? 'REMIT app on iPhone' : 'REMIT app on Android' }, body: JSON.stringify({ refreshToken }) });
      } catch {
        // Offline or API unreachable: keep the stored refresh token so the user
        // isn't signed out just for opening the app without signal.
        return false;
      }
      if (response.status === 401 || response.status === 403) {
        setAccessToken(null);
        await setRefreshToken(null);
        return false;
      }
      if (!response.ok) return false;
      const payload = await response.json() as ApiResponse<{ accessToken?: string; token?: string; refreshToken?: string }>;
      setAccessToken(payload.data.accessToken || payload.data.token || null);
      if (payload.data.refreshToken) await setRefreshToken(payload.data.refreshToken);
      return true;
    }).catch(() => false).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Client', 'mobile');
  headers.set('X-Device-Name', Platform.OS === 'web' ? 'REMIT mobile web' : Platform.OS === 'ios' ? 'REMIT app on iPhone' : 'REMIT app on Android');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error(`Cannot reach the REMIT API at ${API_URL}. Check EXPO_PUBLIC_API_URL and your connection.`);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`The REMIT API returned an invalid response (${response.status}).`);
    }
  }

  if (!response.ok) {
    const noRefresh = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/password/forgot', '/auth/password/reset'].some((route) => path.startsWith(route));
    if (response.status === 401 && !retried && !noRefresh) {
      const restored = await refreshSession();
      if (restored) return request<T>(path, init, true);
    }
    const errorPayload = payload as { error?: string; message?: string } | null;
    throw new Error(errorPayload?.error || errorPayload?.message || `Request failed (${response.status}).`);
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<ApiResponse<{ accessToken?: string; token?: string; refreshToken?: string; user: User }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then(async (response) => { setAccessToken(response.data.accessToken || response.data.token || null); await setRefreshToken(response.data.refreshToken || null); return response.data; }),

  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName: string;
  }) =>
    request<ApiResponse<{ accessToken?: string; token?: string; refreshToken?: string; user: User }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(async (response) => { setAccessToken(response.data.accessToken || response.data.token || null); await setRefreshToken(response.data.refreshToken || null); return response.data; }),

  restore: async () => { const ok = await refreshSession(); return ok ? request<ApiResponse<User>>('/auth/me').then((r) => r.data) : null; },
  logout: async () => { try { await request('/auth/logout', { method: 'POST' }); } finally { setAccessToken(null); await setRefreshToken(null); } },
  logoutAll: async () => { try { await request('/auth/logout-all', { method: 'POST' }); } finally { setAccessToken(null); await setRefreshToken(null); } },
  forgotPassword: (email: string) => request<{ success: boolean; message?: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),

  me: () => request<ApiResponse<User>>('/auth/me').then((response) => response.data),
  dashboard: () => request<ApiResponse<Dashboard>>('/company/dashboard').then((response) => response.data),
  employees: (search = '', includeInactive = false) =>
    request<Paginated<Employee>>(`/employees?limit=100${includeInactive ? '&includeInactive=true' : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(
      (response) => response.data,
    ),
  createEmployee: (input: Omit<Employee, 'id' | 'isActive'>) =>
    request<ApiResponse<Employee>>('/employees', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((response) => response.data),
  banks: () => request<ApiResponse<Bank[]>>('/employees/banks').then((response) => response.data),
  verifyBank: (input: { bankCode: string; accountNumber: string }) =>
    request<ApiResponse<BankVerification>>('/employees/verify-bank', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((response) => response.data),
  payrolls: () => request<Paginated<Payroll>>('/payrolls?limit=100').then((response) => response.data),
  payroll: (id: string) => request<ApiResponse<Payroll>>(`/payrolls/${id}`).then((response) => response.data),
  createPayroll: (input: { scheduledDate: string; employeeIds: string[]; note?: string }) =>
    request<ApiResponse<Payroll>>('/payrolls/drafts', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((response) => response.data),
  submitPayroll: (id: string) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}/submit`, { method: 'PUT' }).then((response) => response.data),
  approvalCode: (id: string) => request<ApiResponse<{ required: boolean }>>(`/payrolls/${id}/approval-code`, { method: 'POST' }).then((response) => response.data),
  approvePayroll: (id: string, code?: string) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}/approve`, { method: 'PUT', body: JSON.stringify(code ? { code } : {}) }).then((response) => response.data),
  cancelPayroll: (id: string) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}/cancel`, { method: 'PUT' }).then((response) => response.data),
  retryPayroll: (id: string) =>
    request<ApiResponse<{ message: string }>>(`/payrolls/${id}/retry`, { method: 'PUT' }),
  wallet: () => request<ApiResponse<Wallet>>('/wallet').then((response) => response.data),
  transactions: () => request<Paginated<Transaction>>('/transactions?limit=100').then((response) => response.data),
  transactionPage: ({ page, type, status }: { page: number; type?: Transaction['type']; status?: Transaction['status'] }) => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    return request<Paginated<Transaction>>(`/transactions?${params.toString()}`);
  },
  transaction: (id: string) => request<ApiResponse<Transaction>>(`/transactions/${id}`).then((response) => response.data),
  employee: (id: string) => request<ApiResponse<Employee>>(`/employees/${id}`).then((response) => response.data),
  updateEmployee: (id: string, input: Partial<Employee>) => request<ApiResponse<Employee>>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(input) }).then((response) => response.data),
  deactivateEmployee: (id: string) => request<ApiResponse<unknown>>(`/employees/${id}`, { method: 'DELETE' }),
  reactivateEmployee: (id: string) => request<ApiResponse<Employee>>(`/employees/${id}/reactivate`, { method: 'PUT' }).then((response) => response.data),
  notifications: (page = 1) => request<NotificationPage>(`/notifications?page=${page}&limit=25`),
  markNotificationRead: (id: string) =>
    request<ApiResponse<AppNotification>>(`/notifications/${id}/read`, { method: 'PUT' }).then((response) => response.data),
  markAllNotificationsRead: () => request<{ success: boolean }>('/notifications/read-all', { method: 'PUT' }),
  deposit: (amount: number) =>
    request<ApiResponse<{ authorizationUrl: string; reference: string }>>('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }).then((response) => response.data),
  verifyDeposit: (reference: string) =>
    request<ApiResponse<{ transaction: Transaction; newBalance: number }>>(`/wallet/verify/${reference}`).then((response) => response.data),
  systemStatus: () => request<ApiResponse<SystemStatus>>('/company/system-status').then((response) => response.data),
  sessions: () => request<ApiResponse<Session[]>>('/auth/sessions').then((response) => response.data),
  revokeSession: (id: string) => request<{ success: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  changePassword: (currentPassword: string, newPassword: string) => request<ApiResponse<{ accessToken?: string; token?: string }>>('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }).then((response) => { setAccessToken(response.data.accessToken || response.data.token || accessToken); return response.data; }),
  supportTickets: () => request<Paginated<SupportTicket>>('/support/tickets?limit=100').then((response) => response.data),
  supportTicket: (id: string) => request<ApiResponse<SupportTicket>>(`/support/tickets/${id}`).then((response) => response.data),
  createSupportTicket: (input: { category: SupportTicketCategory; priority: SupportTicketPriority; subject: string; message: string; payrollId?: string; transactionId?: string }) => request<ApiResponse<SupportTicket>>('/support/tickets', { method: 'POST', body: JSON.stringify(input) }).then((response) => response.data),
  replyToSupportTicket: (id: string, message: string) => request<ApiResponse<SupportTicket>>(`/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ message }) }).then((response) => response.data),
};

export const formatNaira = (kobo = 0) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(kobo / 100);

export const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : 'Not set';

export const formatDateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Not set';

export function formatRelative(value: string) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

export function pageCount(pagination: { total: number; limit: number; totalPages?: number; pages?: number }) {
  return pagination.totalPages ?? pagination.pages ?? Math.max(1, Math.ceil(pagination.total / pagination.limit));
}
