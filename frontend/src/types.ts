export type TeamRole = 'OWNER' | 'ADMIN' | 'FINANCE' | 'VIEWER' | 'EMPLOYEE'

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
  | 'audit.read'

export type User = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: TeamRole
  permissions: Permission[]
  companyId?: string | null
  companyName?: string
  company?: Company | null
}

export type TeamMember = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: TeamRole
  isActive: boolean
  createdAt: string
  temporaryPassword?: string
}

export type Company = {
  id: string
  name: string
  email: string
  phone?: string | null
  address?: string | null
  wallet?: Wallet | null
  _count?: {
    employees?: number
    payrolls?: number
  }
}

export type Wallet = {
  id: string
  companyId?: string
  balance: number
  reservedBalance: number
  availableBalance: number
  currency: string
}

export type Employee = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  bankName: string
  bankCode: string
  accountNumber: string
  accountName?: string
  salary: number
  department?: string | null
  position?: string | null
  paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  nextPaymentDate?: string | null
  isActive: boolean
}

export type PayrollStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type Bank = {
  name: string
  code: string
}

export type BankVerification = {
  account_name: string
  account_number?: string
  bank_id?: number
}

export type PayrollEmployee = {
  id: string
  amount: number
  status: Transaction['status']
  employee: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'email' | 'bankName' | 'accountName' | 'salary'> & { accountNumberLast4?: string | null }
  transaction?: Pick<Transaction, 'id' | 'status' | 'paystackReference' | 'paystackTransferId' | 'createdAt'> & {
    updatedAt?: string
  } | null
}

export type Payroll = {
  id: string
  scheduledDate: string
  processedDate?: string | null
  submittedAt?: string | null
  approvedAt?: string | null
  cancelledAt?: string | null
  failureReason?: string | null
  status: PayrollStatus
  totalAmount: number
  employeeCount: number
  note?: string | null
  payrollEmployees?: PayrollEmployee[]
  _count?: {
    payrollEmployees: number
  }
}

export type Transaction = {
  id: string
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'PAYROLL_DEBIT' | 'REFUND'
  amount: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED'
  description?: string | null
  paystackReference?: string | null
  paystackTransferId?: string | null
  createdAt: string
  employee?: {
    firstName: string
    lastName: string
    email: string
  } | null
}

export type Notification = {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

export type SupportTicketCategory =
  | 'PAYMENT_FAILURE'
  | 'WALLET_FUNDING'
  | 'BANK_VERIFICATION'
  | 'PAYROLL_ISSUE'
  | 'ACCOUNT_ACCESS'
  | 'GENERAL'

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export type SupportMessage = {
  id: string
  body: string
  senderType: 'CUSTOMER' | 'SUPPORT' | 'SYSTEM'
  createdAt: string
  author?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null
}

export type SupportTicket = {
  id: string
  reference: string
  category: SupportTicketCategory
  priority: SupportTicketPriority
  status: SupportTicketStatus
  subject: string
  lastMessageAt: string
  createdAt: string
  resolvedAt?: string | null
  closedAt?: string | null
  createdBy: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>
  payroll?: Pick<Payroll, 'id' | 'status' | 'scheduledDate' | 'totalAmount'> | null
  transaction?: Pick<Transaction, 'id' | 'type' | 'status' | 'amount' | 'description' | 'createdAt'> | null
  messages: SupportMessage[]
  _count?: { messages: number }
}

export type Dashboard = {
  employeeCount: number
  walletBalance: number
  reservedBalance: number
  availableBalance: number
  currency: string
  upcomingPayrolls: Payroll[]
  recentTransactions: Transaction[]
}

export type Stats = {
  financials: {
    totalDeposited: number
    totalPaidOut: number
    currentBalance: number
    reservedBalance: number
    availableBalance: number
  }
  employees: {
    total: number
    departmentDistribution: Record<string, { count: number; payroll: number }>
  }
  trends: Array<{ month: string; deposits: number; payroll: number }>
}

export type SystemStatus = {
  apiConnected: boolean
  databaseConnected: boolean
  schedulerMode: string
  queueMode: 'redis' | 'in-process'
  queueConnected: boolean
  queueWaiting?: number | null
  queueActive?: number | null
  queueFailed?: number | null
  paystackMode: 'mock' | 'live'
  frontendUrl?: string | null
}

export type AuditLog = {
  id: string
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
  user?: {
    firstName: string
    lastName: string
    email: string
  } | null
}

export type Paginated<T> = {
  success: true
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages?: number
    pages?: number
  }
}
