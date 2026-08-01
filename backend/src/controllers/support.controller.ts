import { NextFunction, Request, Response } from 'express';
import {
  Prisma,
  PrismaClient,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { auditService } from '../services/audit.service';
import { generateReference, getPaginationParams, paginatedResponse } from '../utils/formatters';

const prisma = new PrismaClient();

const createTicketSchema = z.object({
  category: z.nativeEnum(SupportTicketCategory),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(120),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(5000),
  payrollId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
}).refine((body) => !(body.payrollId && body.transactionId), {
  message: 'Link either a payroll or a transaction, not both',
});

const replySchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(5000),
});

function companyId(req: Request) {
  if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);
  return req.user.companyId;
}

function handleValidationError(error: unknown, next: NextFunction) {
  if (error instanceof z.ZodError) {
    next(new AppError(error.errors.map((item) => item.message).join(', '), 400));
    return true;
  }
  return false;
}

const ticketSummaryInclude = {
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  payroll: {
    select: { id: true, status: true, scheduledDate: true, totalAmount: true },
  },
  transaction: {
    select: { id: true, type: true, status: true, amount: true, description: true, createdAt: true },
  },
  messages: {
    where: { isInternal: false },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { body: true, senderType: true, createdAt: true },
  },
  _count: { select: { messages: { where: { isInternal: false } } } },
};

export const getSupportTickets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scopedCompanyId = companyId(req);
    const { skip, take, page, limit } = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const search = String(req.query.search || '').trim();

    if (status && !Object.values(SupportTicketStatus).includes(status as SupportTicketStatus)) {
      throw new AppError(`Invalid support ticket status: ${status}`, 400);
    }
    if (category && !Object.values(SupportTicketCategory).includes(category as SupportTicketCategory)) {
      throw new AppError(`Invalid support ticket category: ${category}`, 400);
    }

    const where: Prisma.SupportTicketWhereInput = {
      companyId: scopedCompanyId,
      ...(status && { status: status as SupportTicketStatus }),
      ...(category && { category: category as SupportTicketCategory }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        skip,
        take,
        orderBy: { lastMessageAt: 'desc' },
        include: ticketSummaryInclude,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    res.json(paginatedResponse(tickets, total, page, limit));
  } catch (error) {
    next(error);
  }
};

export const getSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id as string, companyId: companyId(req) },
      include: {
        ...ticketSummaryInclude,
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!ticket) throw new AppError('Support ticket not found', 404);
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

export const createSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scopedCompanyId = companyId(req);
    const body = createTicketSchema.parse(req.body);

    const [payroll, transaction] = await Promise.all([
      body.payrollId
        ? prisma.payroll.findFirst({ where: { id: body.payrollId, companyId: scopedCompanyId }, select: { id: true } })
        : null,
      body.transactionId
        ? prisma.transaction.findFirst({ where: { id: body.transactionId, companyId: scopedCompanyId }, select: { id: true } })
        : null,
    ]);

    if (body.payrollId && !payroll) throw new AppError('Related payroll not found', 404);
    if (body.transactionId && !transaction) throw new AppError('Related transaction not found', 404);

    const ticket = await prisma.supportTicket.create({
      data: {
        reference: generateReference('SUP'),
        companyId: scopedCompanyId,
        createdById: req.user!.id,
        category: body.category,
        priority: body.priority,
        subject: body.subject,
        payrollId: body.payrollId,
        transactionId: body.transactionId,
        messages: {
          create: {
            authorUserId: req.user!.id,
            senderType: 'CUSTOMER',
            body: body.message,
          },
        },
      },
      include: ticketSummaryInclude,
    });

    await auditService.record({
      companyId: scopedCompanyId,
      userId: req.user!.id,
      action: 'SUPPORT_TICKET_CREATED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { reference: ticket.reference, category: ticket.category, priority: ticket.priority },
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    if (!handleValidationError(error, next)) next(error);
  }
};

export const replyToSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scopedCompanyId = companyId(req);
    const body = replySchema.parse(req.body);
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id as string, companyId: scopedCompanyId },
      select: { id: true, reference: true, status: true },
    });

    if (!ticket) throw new AppError('Support ticket not found', 404);
    if (ticket.status === 'CLOSED') throw new AppError('Closed support tickets cannot receive new replies', 409);

    const now = new Date();
    await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          authorUserId: req.user!.id,
          senderType: 'CUSTOMER',
          body: body.message,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          lastMessageAt: now,
          ...(ticket.status === 'RESOLVED' && { status: 'OPEN', resolvedAt: null }),
        },
      }),
    ]);

    await auditService.record({
      companyId: scopedCompanyId,
      userId: req.user!.id,
      action: 'SUPPORT_TICKET_REPLIED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { reference: ticket.reference },
    });

    const updated = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      include: {
        ...ticketSummaryInclude,
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });
    res.status(201).json({ success: true, data: updated });
  } catch (error) {
    if (!handleValidationError(error, next)) next(error);
  }
};

export const closeSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scopedCompanyId = companyId(req);
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: req.params.id as string, companyId: scopedCompanyId },
    });
    if (!ticket) throw new AppError('Support ticket not found', 404);
    if (ticket.status === 'CLOSED') throw new AppError('Support ticket is already closed', 409);

    const closedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'SYSTEM',
          body: `${req.user!.firstName} ${req.user!.lastName} closed this ticket.`,
        },
      });
      return tx.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'CLOSED', closedAt, lastMessageAt: closedAt },
        include: ticketSummaryInclude,
      });
    });

    await auditService.record({
      companyId: scopedCompanyId,
      userId: req.user!.id,
      action: 'SUPPORT_TICKET_CLOSED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      metadata: { reference: ticket.reference },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};
