export type PlatformPermission =
  | "support.queue.read"
  | "support.ticket.assign"
  | "support.ticket.reply"
  | "support.ticket.status"
  | "support.note.create"
  | "support.staff.manage";

export type PlatformUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "SUPPORT_AGENT" | "SUPPORT_ADMIN";
  isActive: boolean;
  permissions: PlatformPermission[];
  lastLoginAt?: string | null;
};

export type PlatformSupportMessage = {
  id: string;
  body: string;
  senderType: "CUSTOMER" | "SUPPORT" | "SYSTEM";
  isInternal: boolean;
  createdAt: string;
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  authorPlatformUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
};

export type PlatformSupportTicket = {
  id: string;
  reference: string;
  subject: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status:
    | "OPEN"
    | "IN_PROGRESS"
    | "WAITING_FOR_CUSTOMER"
    | "RESOLVED"
    | "CLOSED";
  createdAt: string;
  lastMessageAt: string;
  company: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    isActive: boolean;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedTo?: PlatformUser | null;
  messages: PlatformSupportMessage[];
  _count?: { messages: number };
};

export type PlatformSupportSummary = {
  open: number;
  unassigned: number;
  waitingForCustomer: number;
  urgent: number;
  resolved: number;
};
