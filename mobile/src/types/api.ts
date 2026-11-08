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
};

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
  createdAt: string;
};

export type Dashboard = {
  employeeCount: number;
  walletBalance: number;
  reservedBalance: number;
  availableBalance: number;
  currency: string;
  upcomingPayrolls: Payroll[];
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

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
};
