export type TeamRole = 'OWNER' | 'ADMIN' | 'FINANCE' | 'VIEWER' | 'EMPLOYEE';

export type Permission =
  | 'dashboard.read'
  | 'company.read'
  | 'company.manage'
  | 'system.read'
  | 'team.read'
  | 'team.manage'
  | 'employee.read'
  | 'employee.manage'
  | 'bank.verify'
  | 'wallet.read'
  | 'wallet.fund'
  | 'payroll.read'
  | 'payroll.create'
  | 'payroll.update'
  | 'payroll.submit'
  | 'payroll.approve'
  | 'payroll.cancel'
  | 'payroll.retry'
  | 'payroll.export'
  | 'transaction.read'
  | 'transaction.export'
  | 'notification.read'
  | 'support.read'
  | 'support.create'
  | 'support.reply'
  | 'support.close'
  | 'audit.read';

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: TeamRole;
  permissions: Permission[];
  companyId?: string | null;
  companyName?: string;
};

export type Wallet = {
  id: string;
  balance: number;
  reservedBalance: number;
  availableBalance: number;
  currency: string;
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  salary: number;
  department?: string | null;
  position?: string | null;
  paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  nextPaymentDate?: string | null;
  isActive: boolean;
  transactions?: Transaction[];
  payrollEmployees?: { id: string; amount: number; status: Transaction['status']; payroll?: { scheduledDate: string; status: PayrollStatus } | null }[];
};

export type SupportTicketCategory = 'PAYMENT_FAILURE' | 'WALLET_FUNDING' | 'BANK_VERIFICATION' | 'PAYROLL_ISSUE' | 'ACCOUNT_ACCESS' | 'GENERAL';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type SupportMessage = { id: string; body: string; senderType: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM'; createdAt: string; author?: Pick<User, 'firstName' | 'lastName'> | null };
export type SupportTicket = { id: string; reference: string; category: SupportTicketCategory; priority: SupportTicketPriority; status: SupportTicketStatus; subject: string; lastMessageAt: string; messages: SupportMessage[]; payroll?: Pick<Payroll, 'id' | 'status' | 'scheduledDate' | 'totalAmount'> | null; transaction?: Pick<Transaction, 'id' | 'type' | 'status' | 'amount' | 'description' | 'createdAt'> | null; _count?: { messages: number } };
export type Session = { id: string; deviceName?: string | null; userAgent?: string | null; ip?: string | null; createdAt: string; lastUsedAt: string; current: boolean };

export type Bank = {
  name: string;
  code: string;
};

export type BankVerification = {
  account_name: string;
  account_number?: string;
  bank_id?: number;
};

export type PayrollStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type Payroll = {
  id: string;
  scheduledDate: string;
  processedDate?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  cancelledAt?: string | null;
  failureReason?: string | null;
  status: PayrollStatus;
  totalAmount: number;
  employeeCount: number;
  note?: string | null;
  payrollEmployees?: {
    id: string;
    amount: number;
    status: Transaction['status'];
    employee: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'email' | 'bankName'> & { accountNumberLast4?: string | null };
  }[];
};

export type Transaction = {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'PAYROLL_DEBIT' | 'REFUND';
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';
  description?: string | null;
  paystackReference?: string | null;
  employee?: { firstName: string; lastName: string; email: string } | null;
  createdAt: string;
};

export type NotificationType =
  | 'PAYROLL_SCHEDULED'
  | 'PAYROLL_COMPLETED'
  | 'PAYROLL_FAILED'
  | 'DEPOSIT_SUCCESS'
  | 'LOW_BALANCE'
  | 'EMPLOYEE_ADDED'
  | 'GENERAL';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export type Dashboard = {
  employeeCount: number;
  payrollCount: number;
  pendingApprovalCount: number;
  walletBalance: number;
  reservedBalance: number;
  availableBalance: number;
  currency: string;
  upcomingPayrolls: Payroll[];
  pendingApprovalPayrolls: Payroll[];
  recentTransactions: Transaction[];
};

export type SystemStatus = {
  apiConnected: boolean;
  databaseConnected: boolean;
  schedulerMode: string;
  queueMode: 'redis' | 'in-process';
  queueConnected: boolean;
  paystackMode: 'mock' | 'live';
};

export type Paginated<T> = {
  success: true;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
    pages?: number;
  };
};

export type NotificationPage = Paginated<AppNotification> & { unreadCount: number };

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
};
