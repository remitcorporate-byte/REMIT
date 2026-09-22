import { PlatformRole } from '@prisma/client';

export const platformPermissionValues = [
  'support.queue.read',
  'support.ticket.assign',
  'support.ticket.reply',
  'support.ticket.status',
  'support.note.create',
  'support.staff.manage',
] as const;

export type PlatformPermission = (typeof platformPermissionValues)[number];

const agentPermissions: PlatformPermission[] = [
  'support.queue.read',
  'support.ticket.assign',
  'support.ticket.reply',
  'support.ticket.status',
  'support.note.create',
];

const rolePermissions: Record<PlatformRole, readonly PlatformPermission[]> = {
  SUPPORT_AGENT: agentPermissions,
  SUPPORT_ADMIN: [...agentPermissions, 'support.staff.manage'],
};

export function getPlatformPermissions(role: PlatformRole) {
  return [...rolePermissions[role]];
}

export function platformRoleHasPermission(role: PlatformRole, permission: PlatformPermission) {
  return rolePermissions[role].includes(permission);
}
