import { NextFunction, Request, Response } from 'express';
import { PrismaClient, SupportTicketStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { notificationService } from '../services/notification.service';
import { platformAuditService } from '../services/platform-audit.service';
import {
  handlePlatformValidationError,
  platformTicketInclude,
} from './platform-support.shared';

const prisma = new PrismaClient();
const statusSchema = z.object({
  status: z.nativeEnum(SupportTicketStatus),
});

export const updatePlatformSupportStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = statusSchema.parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id as string },
    });

    if (!ticket) throw new AppError('Support ticket not found', 404);

    const now = new Date();
    const statusLabel = body.status.replace(/_/g, ' ').toLowerCase();
    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'SYSTEM',
          body: `REMIT Support changed the ticket status to ${statusLabel}.`,
        },
      });

      return transaction.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: body.status,
          lastMessageAt: now,
          resolvedAt: body.status === 'RESOLVED' ? now : null,
          closedAt: body.status === 'CLOSED' ? now : null,
        },
        include: platformTicketInclude,
      });
    });

    await Promise.all([
      platformAuditService.record({
        platformUserId: req.platformUser!.id,
        companyId: ticket.companyId,
        action: 'SUPPORT_TICKET_STATUS_UPDATED',
        entityType: 'SupportTicket',
        entityId: ticket.id,
        metadata: { from: ticket.status, to: body.status },
      }),
      notificationService.notifySupportParticipants({
        companyId: ticket.companyId,
        createdById: ticket.createdById,
        title: `Support ticket ${ticket.reference} updated`,
        message: `Your support ticket is now ${statusLabel}.`,
      }),
    ]);

    res.json({ success: true, data: updated });
  } catch (error) {
    if (!handlePlatformValidationError(error, next)) next(error);
  }
};
