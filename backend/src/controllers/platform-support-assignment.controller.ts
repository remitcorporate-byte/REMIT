import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { platformAuditService } from '../services/platform-audit.service';
import {
  handlePlatformValidationError,
  platformTicketInclude,
} from './platform-support.shared';

const prisma = new PrismaClient();
const assignSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
});

export const assignPlatformSupportTicket = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = assignSchema.parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id as string },
    });

    if (!ticket) throw new AppError('Support ticket not found', 404);

    const isAdmin = req.platformUser!.role === 'SUPPORT_ADMIN';
    const isSelfAssignment = body.assignedToId === req.platformUser!.id;

    if (body.assignedToId && !isAdmin && !isSelfAssignment) {
      throw new AppError(
        'Support agents can only assign tickets to themselves',
        403
      );
    }

    if (!body.assignedToId && !isAdmin) {
      throw new AppError('Only support admins can unassign tickets', 403);
    }

    if (body.assignedToId) {
      const assignee = await prisma.platformUser.findFirst({
        where: { id: body.assignedToId, isActive: true },
      });

      if (!assignee) {
        throw new AppError('Active support assignee not found', 404);
      }
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        assignedToId: body.assignedToId,
        ...(body.assignedToId &&
          ticket.status === 'OPEN' && { status: 'IN_PROGRESS' }),
      },
      include: platformTicketInclude,
    });

    await platformAuditService.record({
      platformUserId: req.platformUser!.id,
      companyId: ticket.companyId,
      action: body.assignedToId
        ? 'SUPPORT_TICKET_ASSIGNED'
        : 'SUPPORT_TICKET_UNASSIGNED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { assignedToId: body.assignedToId },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (!handlePlatformValidationError(error, next)) next(error);
  }
};
