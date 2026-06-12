import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

// @desc    Get company profile
// @route   GET /api/v1/company
export const getCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      include: {
        wallet: { select: { id: true, balance: true, reservedBalance: true, currency: true } },
        _count: {
          select: {
            employees: { where: { isActive: true } },
            payrolls: true,
          },
        },
      },
    });

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    res.json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update company profile
// @route   PUT /api/v1/company
export const updateCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const body = updateCompanySchema.parse(req.body);

    // Check email uniqueness if updating email
    if (body.email) {
      const existing = await prisma.company.findFirst({
        where: { email: body.email, id: { not: req.user.companyId } },
      });
      if (existing) {
        throw new AppError('A company with this email already exists', 400);
      }
    }

    const company = await prisma.company.update({
      where: { id: req.user.companyId },
      data: body,
    });

    res.json({
      success: true,
      data: company,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return next(new AppError(messages, 400));
    }
    next(error);
  }
};

// @desc    Get dashboard summary
// @route   GET /api/v1/company/dashboard
export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const companyId = req.user.companyId;

    const [employeeCount, wallet, upcomingPayrolls, recentTransactions] =
      await Promise.all([
        prisma.employee.count({
          where: { companyId, isActive: true },
        }),
        prisma.wallet.findUnique({
          where: { companyId },
          select: { balance: true, reservedBalance: true, currency: true },
        }),
        prisma.payroll.findMany({
          where: {
            companyId,
            status: 'SCHEDULED',
            scheduledDate: { gte: new Date() },
          },
          orderBy: { scheduledDate: 'asc' },
          take: 5,
        }),
        prisma.transaction.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            employee: {
              select: { firstName: true, lastName: true },
            },
          },
        }),
      ]);

    res.json({
      success: true,
      data: {
        employeeCount,
        walletBalance: wallet?.balance || 0,
        reservedBalance: wallet?.reservedBalance || 0,
        availableBalance: wallet ? wallet.balance - wallet.reservedBalance : 0,
        currency: wallet?.currency || 'NGN',
        upcomingPayrolls,
        recentTransactions,
      },
    });
  } catch (error) {
    next(error);
  }
};
// @desc    Get advanced analytics
// @route   GET /api/v1/company/stats
export const getAdvancedStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }
    const companyId = req.user.companyId;

    const [wallet, transactions, employees] = await Promise.all([
      prisma.wallet.findUnique({
        where: { companyId },
        select: { balance: true, reservedBalance: true }
      }),
      prisma.transaction.findMany({
        where: { companyId, status: 'SUCCESS' },
        select: { type: true, amount: true, createdAt: true }
      }),
      prisma.employee.findMany({
        where: { companyId, isActive: true },
        select: { department: true, salary: true }
      })
    ]);

    // Financial Metrics
    const totalDeposited = transactions
      .filter((t: any) => t.type === 'DEPOSIT')
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalPaidOut = transactions
      .filter((t: any) => t.type === 'PAYROLL_DEBIT')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    // Employee Analytics
    const depts: Record<string, { count: number; payroll: number }> = {};
    employees.forEach((emp: any) => {
      const dept = emp.department || 'Unassigned';
      if (!depts[dept]) depts[dept] = { count: 0, payroll: 0 };
      depts[dept].count++;
      depts[dept].payroll += emp.salary;
    });

    // Monthly Trends (Last 6 months)
    const monthlyStats: Record<string, { month: string; deposits: number; payroll: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyStats[key] = { month: key, deposits: 0, payroll: 0 };
    }

    transactions.forEach((t: any) => {
      const monthKey = t.createdAt.toISOString().slice(0, 7);
      if (monthlyStats[monthKey]) {
        if (t.type === 'DEPOSIT') monthlyStats[monthKey].deposits += t.amount;
        if (t.type === 'PAYROLL_DEBIT') monthlyStats[monthKey].payroll += t.amount;
      }
    });

    res.json({
      success: true,
      data: {
        financials: {
          totalDeposited,
          totalPaidOut,
          currentBalance: wallet?.balance || 0,
          reservedBalance: wallet?.reservedBalance || 0,
          availableBalance: wallet ? wallet.balance - wallet.reservedBalance : 0
        },
        employees: {
          total: employees.length,
          departmentDistribution: depts
        },
        trends: Object.values(monthlyStats)
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get system/provider status
// @route   GET /api/v1/company/system-status
export const getSystemStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      data: {
        apiConnected: true,
        databaseConnected: true,
        schedulerMode: 'in-process',
        paystackMode: process.env.USE_PAYSTACK_MOCK === 'true' ? 'mock' : 'live',
        frontendUrl: process.env.FRONTEND_URL || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get company audit log
// @route   GET /api/v1/company/audit-log
export const getAuditLog = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const logs = await prisma.auditLog.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};
