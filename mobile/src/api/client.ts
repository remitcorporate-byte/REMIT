import type {
  ApiResponse,
  Bank,
  BankVerification,
  Dashboard,
  Employee,
  Paginated,
  Payroll,
  SystemStatus,
  Transaction,
  User,
  Wallet,
} from '@/src/types/api';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
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
    const errorPayload = payload as { error?: string; message?: string } | null;
    throw new Error(errorPayload?.error || errorPayload?.message || `Request failed (${response.status}).`);
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<ApiResponse<{ token: string; user: User }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }).then((response) => response.data),

  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName: string;
  }) =>
    request<ApiResponse<{ token: string; user: User }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((response) => response.data),

  me: () => request<ApiResponse<User>>('/auth/me').then((response) => response.data),
  dashboard: () => request<ApiResponse<Dashboard>>('/company/dashboard').then((response) => response.data),
  employees: (search = '') =>
    request<Paginated<Employee>>(`/employees?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(
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
  approvePayroll: (id: string) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}/approve`, { method: 'PUT' }).then((response) => response.data),
  cancelPayroll: (id: string) =>
    request<ApiResponse<Payroll>>(`/payrolls/${id}/cancel`, { method: 'PUT' }).then((response) => response.data),
  retryPayroll: (id: string) =>
    request<ApiResponse<{ message: string }>>(`/payrolls/${id}/retry`, { method: 'PUT' }),
  wallet: () => request<ApiResponse<Wallet>>('/wallet').then((response) => response.data),
  transactions: () => request<Paginated<Transaction>>('/transactions?limit=100').then((response) => response.data),
  deposit: (amount: number) =>
    request<ApiResponse<{ authorizationUrl: string; reference: string }>>('/wallet/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }).then((response) => response.data),
  systemStatus: () => request<ApiResponse<SystemStatus>>('/company/system-status').then((response) => response.data),
};

export const formatNaira = (kobo = 0) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(kobo / 100);

export const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value)) : 'Not set';
