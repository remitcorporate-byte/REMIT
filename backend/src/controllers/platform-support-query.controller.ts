import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { getPaginationParams, paginatedResponse } from '../utils/formatters';
import { platformTicketInclude } from './platform-support.shared';
import { buildPlatformTicketFilter } from './platform-support-filter';

const prisma = new PrismaClient();

const summaryInclude = {
  company: {
    select: { id: true, name: true, email: true, isActive: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  assignedTo: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      body: true,
      senderType: true,
      isInternal: true,
      createdAt: true,
    },
  },
  _count: { select: { messages: true } },
};

export const getPlatformSupportSummary = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [open, unassigned, waitingForCustomer, urgent, resolved] =
      await Promise.all([
        prisma.supportTicket.count({
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        }),
        prisma.supportTicket.count({
          where: { assignedToId: null, status: { not: 'CLOSED' } },
        }),
        prisma.supportTicket.count({
          where: { status: 'WAITING_FOR_CUSTOMER' },
        }),
        prisma.supportTicket.count({
          where: {
            priority: 'URGENT',
            status: { notIn: ['RESOLVED', 'CLOSED'] },
          },
        }),
        prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
      ]);

    res.json({
      success: true,
      data: { open, unassigned, waitingForCustomer, urgent, resolved },
    });
  } catch (error) {
    next(error);
  }
};

export const getPlatformSupportTickets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const pagination = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 30
    );
    const where = buildPlatformTicketFilter(req);

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { lastMessageAt: 'desc' },
        include: summaryInclude,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    res.json(
      paginatedResponse(
        tickets,
        total,
        pagination.page,
        pagination.limit
      )
    );
  } catch (error) {
    next(error);
  }
};

export const getPlatformSupportTicket = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id as string },
      include: platformTicketInclude,
    });

    if (!ticket) throw new AppError('Support ticket not found', 404);
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};
