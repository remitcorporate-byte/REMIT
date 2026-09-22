import type {
  PlatformSupportSummary,
  PlatformSupportTicket,
  PlatformUser,
} from "./platform-types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";
const PLATFORM_TOKEN_KEY = "remit_platform_token";
const PLATFORM_USER_KEY = "remit_platform_user";

export type {
  PlatformPermission,
  PlatformSupportMessage,
  PlatformSupportSummary,
  PlatformSupportTicket,
  PlatformUser,
} from "./platform-types";

type Response<T> = { success: boolean; data: T; error?: string };
type Paginated<T> = {
  success: boolean;
  data: T[];
  pagination: { total: number; page: number; limit: number };
};

export const platformStore = {
  token: () => localStorage.getItem(PLATFORM_TOKEN_KEY),
  user: (): PlatformUser | null => {
    const value = localStorage.getItem(PLATFORM_USER_KEY);
    return value ? JSON.parse(value) : null;
  },
  save(token: string, user: PlatformUser) {
    localStorage.setItem(PLATFORM_TOKEN_KEY, token);
    localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(user));
  },
  saveUser(user: PlatformUser) {
    localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    localStorage.removeItem(PLATFORM_USER_KEY);
  },
};

async function request<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = platformStore.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: globalThis.Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error("Cannot connect to the REMIT platform API.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload as T;
}

export const platformApi = {
  async login(email: string, password: string) {
    const response = await request<
      Response<{ token: string; user: PlatformUser }>
    >("/platform/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    platformStore.save(response.data.token, response.data.user);
    return response.data.user;
  },
  me: () =>
    request<Response<PlatformUser>>("/platform/auth/me").then(
      (response) => response.data,
    ),
  staff: () =>
    request<Response<PlatformUser[]>>("/platform/auth/staff").then(
      (response) => response.data,
    ),
  summary: () =>
    request<Response<PlatformSupportSummary>>("/platform/support/summary").then(
      (response) => response.data,
    ),
  tickets: (filters = "") =>
    request<Paginated<PlatformSupportTicket>>(
      `/platform/support/tickets?limit=100${filters}`,
    ).then((response) => response.data),
  ticket: (id: string) =>
    request<Response<PlatformSupportTicket>>(
      `/platform/support/tickets/${id}`,
    ).then((response) => response.data),
  assign: (id: string, assignedToId: string | null) =>
    request<Response<PlatformSupportTicket>>(
      `/platform/support/tickets/${id}/assignment`,
      { method: "PUT", body: JSON.stringify({ assignedToId }) },
    ).then((response) => response.data),
  updateStatus: (id: string, status: PlatformSupportTicket["status"]) =>
    request<Response<PlatformSupportTicket>>(
      `/platform/support/tickets/${id}/status`,
      { method: "PUT", body: JSON.stringify({ status }) },
    ).then((response) => response.data),
  addMessage: (id: string, message: string, isInternal: boolean) =>
    request<Response<PlatformSupportTicket>>(
      `/platform/support/tickets/${id}/messages`,
      { method: "POST", body: JSON.stringify({ message, isInternal }) },
    ).then((response) => response.data),
};
