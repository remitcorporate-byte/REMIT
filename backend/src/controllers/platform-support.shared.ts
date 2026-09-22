import { NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';

export const platformTicketInclude = {
  company: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
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
  payroll: {
    select: {
      id: true,
      status: true,
      scheduledDate: true,
      totalAmount: true,
    },
  },
  transaction: {
    select: {
      id: true,
      type: true,
      status: true,
      amount: true,
      description: true,
      createdAt: true,
    },
  },
  messages: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      authorPlatformUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
    },
  },
};

export function handlePlatformValidationError(
  error: unknown,
  next: NextFunction
) {
  if (!(error instanceof z.ZodError)) return false;

  const message = error.errors.map((item) => item.message).join(', ');
  next(new AppError(message, 400));
  return true;
}
