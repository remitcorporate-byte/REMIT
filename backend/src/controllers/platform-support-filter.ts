import { Request } from 'express';
import {
  Prisma,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export function buildPlatformTicketFilter(
  req: Request
): Prisma.SupportTicketWhereInput {
  const status = req.query.status as SupportTicketStatus | undefined;
  const category = req.query.category as SupportTicketCategory | undefined;
  const priority = req.query.priority as SupportTicketPriority | undefined;
  const assigned = String(req.query.assigned || '').trim();
  const search = String(req.query.search || '').trim();

  validateEnum(status, SupportTicketStatus, 'status');
  validateEnum(category, SupportTicketCategory, 'category');
  validateEnum(priority, SupportTicketPriority, 'priority');

  return {
    ...(status && { status }),
    ...(category && { category }),
    ...(priority && { priority }),
    ...(assigned === 'me' && { assignedToId: req.platformUser!.id }),
    ...(assigned === 'unassigned' && { assignedToId: null }),
    ...(assigned &&
      !['me', 'unassigned'].includes(assigned) && { assignedToId: assigned }),
    ...(search && {
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
        { createdBy: { email: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  };
}

function validateEnum<T extends string>(
  value: T | undefined,
  values: Record<string, T>,
  label: string
) {
  if (value && !Object.values(values).includes(value)) {
    throw new AppError(`Invalid ticket ${label}`, 400);
  }
}
