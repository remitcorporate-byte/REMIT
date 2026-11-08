export const labelFor = (value: string) => ({ OWNER: 'Owner', ADMIN: 'Admin', FINANCE: 'Finance', VIEWER: 'Viewer', EMPLOYEE: 'Employee', WEEKLY: 'Every week', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Every month', DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', PAYROLL_DEBIT: 'Salary payment', REFUND: 'Refund', PENDING_APPROVAL: 'Awaiting approval', SCHEDULED: 'Scheduled', PROCESSING: 'Processing', COMPLETED: 'Completed', FAILED: 'Failed', CANCELLED: 'Cancelled', DRAFT: 'Draft', SUCCESS: 'Successful', REVERSED: 'Reversed', OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_FOR_CUSTOMER: 'Waiting for you', RESOLVED: 'Resolved', CLOSED: 'Closed', PAYMENT_FAILURE: 'Payment failure', WALLET_FUNDING: 'Wallet funding', BANK_VERIFICATION: 'Bank verification', PAYROLL_ISSUE: 'Payroll issue', ACCOUNT_ACCESS: 'Account access', GENERAL: 'General' } as Record<string, string>)[value] || value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())

export function deviceLabel(userAgent?: string | null, deviceName?: string | null) {
  if (deviceName && !/^Mozilla\//i.test(deviceName)) return deviceName
  const ua = userAgent || ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Linux/.test(ua) ? 'Linux' : 'device'
  return `${browser} on ${os}`
}
