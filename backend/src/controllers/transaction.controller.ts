import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { getPaginationParams, paginatedResponse } from '../utils/formatters';

const prisma = new PrismaClient();

// @desc    Get all transactions
// @route   GET /api/v1/transactions
export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const { skip, take, page, limit } = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 10
    );

    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const employeeId = req.query.employeeId as string | undefined;

    const where = {
      companyId: req.user.companyId,
      ...(type && { type: type as any }),
      ...(status && { status: status as any }),
      ...(employeeId && { employeeId }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json(paginatedResponse(transactions, total, page, limit));
  } catch (error) {
    next(error);
  }
};

// @desc    Get single transaction
// @route   GET /api/v1/transactions/:id
export const getTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        id: req.params.id as string,
        companyId: req.user.companyId,
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, email: true },
        },
        wallet: {
          select: { balance: true, currency: true },
        },
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export transactions as CSV
// @route   GET /api/v1/transactions/export
export const exportTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const transactions = await prisma.transaction.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    const rows = [
      ['Date', 'Type', 'Status', 'Amount Kobo', 'Employee', 'Reference', 'Description'],
      ...transactions.map((transaction) => [
        transaction.createdAt.toISOString(),
        transaction.type,
        transaction.status,
        transaction.amount,
        transaction.employee
          ? `${transaction.employee.firstName} ${transaction.employee.lastName}`
          : '',
        transaction.paystackReference || transaction.paystackTransferId || '',
        transaction.description || '',
      ]),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'));
  } catch (error) {
    next(error);
  }
};
