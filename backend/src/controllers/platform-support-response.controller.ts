import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { notificationService } from '../services/notification.service';
import { platformAuditService } from '../services/platform-audit.service';
import {
  handlePlatformValidationError,
  platformTicketInclude,
} from './platform-support.shared';

const prisma = new PrismaClient();
const messageSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

export const addPlatformSupportMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = messageSchema.parse(req.body);
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id as string },
    });

    if (!ticket) throw new AppError('Support ticket not found', 404);
    if (ticket.status === 'CLOSED') {
      throw new AppError('Closed tickets cannot receive new messages', 409);
    }

    await saveSupportMessage(req, ticket, body);
    await recordSupportMessageActivity(req, ticket, body);

    const updated = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: platformTicketInclude,
    });

    res.status(201).json({ success: true, data: updated });
  } catch (error) {
    if (!handlePlatformValidationError(error, next)) next(error);
  }
};

async function saveSupportMessage(
  req: Request,
  ticket: { id: string },
  body: z.infer<typeof messageSchema>
) {
  const now = new Date();
  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorPlatformUserId: req.platformUser!.id,
        senderType: 'SUPPORT',
        body: body.message,
        isInternal: body.isInternal,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        lastMessageAt: now,
        ...(!body.isInternal && {
          status: 'WAITING_FOR_CUSTOMER',
          resolvedAt: null,
        }),
      },
    }),
  ]);
}

async function recordSupportMessageActivity(
  req: Request,
  ticket: {
    id: string;
    companyId: string;
    createdById: string;
    reference: string;
  },
  body: z.infer<typeof messageSchema>
) {
  await platformAuditService.record({
    platformUserId: req.platformUser!.id,
    companyId: ticket.companyId,
    action: body.isInternal
      ? 'SUPPORT_INTERNAL_NOTE_ADDED'
      : 'SUPPORT_REPLY_SENT',
    entityType: 'SupportTicket',
    entityId: ticket.id,
  });

  if (body.isInternal) return;

  const message =
    body.message.length > 140
      ? `${body.message.slice(0, 137)}...`
      : body.message;

  await notificationService.notifySupportParticipants({
    companyId: ticket.companyId,
    createdById: ticket.createdById,
    title: `REMIT Support replied to ${ticket.reference}`,
    message,
  });
}
