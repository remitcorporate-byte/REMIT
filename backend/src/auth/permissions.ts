import { Role } from '@prisma/client';

export const permissionValues = [
  'dashboard.read',
  'company.read',
  'company.manage',
  'system.read',
  'team.read',
  'team.manage',
  'employee.read',
  'employee.manage',
  'bank.verify',
  'wallet.read',
  'wallet.fund',
  'payroll.read',
  'payroll.create',
  'payroll.update',
  'payroll.submit',
  'payroll.approve',
  'payroll.cancel',
  'payroll.retry',
  'payroll.export',
  'transaction.read',
  'transaction.export',
  'notification.read',
  'support.read',
  'support.create',
  'support.reply',
  'support.close',
  'audit.read',
] as const;

export type Permission = (typeof permissionValues)[number];

const operatorReadPermissions: Permission[] = [
  'dashboard.read',
  'company.read',
  'system.read',
  'team.read',
  'employee.read',
  'payroll.read',
  'payroll.export',
  'transaction.read',
  'transaction.export',
  'notification.read',
  'support.read',
  'support.create',
  'support.reply',
];

const payrollOperatorPermissions: Permission[] = [
  'bank.verify',
  'wallet.read',
  'wallet.fund',
  'payroll.create',
  'payroll.update',
  'payroll.submit',
  'payroll.approve',
  'payroll.cancel',
  'payroll.retry',
];

const rolePermissions: Record<Role, readonly Permission[]> = {
  OWNER: [
    ...operatorReadPermissions,
    ...payrollOperatorPermissions,
    'company.manage',
    'team.manage',
    'employee.manage',
    'support.close',
    'audit.read',
  ],
  ADMIN: [
    ...operatorReadPermissions,
    ...payrollOperatorPermissions,
    'company.manage',
    'employee.manage',
    'support.close',
    'audit.read',
  ],
  FINANCE: [...operatorReadPermissions, ...payrollOperatorPermissions],
  VIEWER: operatorReadPermissions,
  // Reserved for a future employee portal. It deliberately receives no
  // company payroll, wallet, employee-directory, or team permissions.
  EMPLOYEE: ['notification.read'],
};

export function getPermissions(role: Role): Permission[] {
  return [...rolePermissions[role]];
}

export function roleHasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].includes(permission);
}
