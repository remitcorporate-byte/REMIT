import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { getPaginationParams, paginatedResponse } from '../utils/formatters';
import { payrollQueue } from '../queues/payroll.queue';

const prisma = new PrismaClient();

const schedulePayrollSchema = z.object({
  scheduledDate: z.string().datetime('Invalid date format'),
  employeeIds: z.array(z.string().uuid()).min(1, 'At least one employee required'),
  note: z.string().optional(),
});

// @desc    Schedule a payroll
// @route   POST /api/v1/payrolls/schedule
export const schedulePayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const body = schedulePayrollSchema.parse(req.body);

    // Get active employees with matching IDs
    const employees = await prisma.employee.findMany({
      where: {
        id: { in: body.employeeIds },
        companyId: req.user.companyId,
        isActive: true,
      },
    });

    if (employees.length === 0) {
      throw new AppError('No valid active employees found', 400);
    }

    const totalAmount = employees.reduce((sum, emp) => sum + emp.salary, 0);

    // Check wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { companyId: req.user.companyId },
    });

    if (!wallet || wallet.balance < totalAmount) {
      throw new AppError(
        `Insufficient wallet balance. Required: ${totalAmount}, Available: ${wallet?.balance || 0}`,
        400
      );
    }

    // Create payroll with employee entries
    const payroll = await prisma.payroll.create({
      data: {
        companyId: req.user.companyId,
        scheduledDate: new Date(body.scheduledDate),
        totalAmount,
        employeeCount: employees.length,
        note: body.note,
        payrollEmployees: {
          create: employees.map((emp) => ({
            employeeId: emp.id,
            amount: emp.salary,
          })),
        },
      },
      include: {
        payrollEmployees: {
          include: {
            employee: {
              select: { firstName: true, lastName: true, email: true, salary: true },
            },
          },
        },
      },
    });

    // If scheduled for now or past, queue for immediate processing
    const scheduledDate = new Date(body.scheduledDate);
    if (scheduledDate <= new Date()) {
      await payrollQueue.add('process-payroll', {
        payrollId: payroll.id,
        companyId: req.user.companyId,
      });
    }

    res.status(201).json({
      success: true,
      data: payroll,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return next(new AppError(messages, 400));
    }
    next(error);
  }
};

// @desc    Get all payrolls
// @route   GET /api/v1/payrolls
export const getPayrolls = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const { skip, take, page, limit } = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 10
    );

    const status = req.query.status as string | undefined;

    const where = {
      companyId: req.user.companyId,
      ...(status && { status: status as any }),
    };

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledDate: 'desc' },
        include: {
          _count: { select: { payrollEmployees: true } },
        },
      }),
      prisma.payroll.count({ where }),
    ]);

    res.json(paginatedResponse(payrolls, total, page, limit));
  } catch (error) {
    next(error);
  }
};

// @desc    Get single payroll
// @route   GET /api/v1/payrolls/:id
export const getPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const payroll = await prisma.payroll.findFirst({
      where: {
        id: req.params.id as string,
        companyId: req.user.companyId,
      },
      include: {
        payrollEmployees: {
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                bankName: true,
                accountNumber: true,
                salary: true,
              },
            },
          },
        },
      },
    });

    if (!payroll) {
      throw new AppError('Payroll not found', 404);
    }

    res.json({
      success: true,
      data: payroll,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel a payroll
// @route   PUT /api/v1/payrolls/:id/cancel
export const cancelPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const payroll = await prisma.payroll.findFirst({
      where: {
        id: req.params.id as string,
        companyId: req.user.companyId,
      },
    });

    if (!payroll) {
      throw new AppError('Payroll not found', 404);
    }

    if (payroll.status !== 'SCHEDULED') {
      throw new AppError(`Cannot cancel payroll with status: ${payroll.status}`, 400);
    }

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: { status: 'CANCELLED' },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Retry a failed payroll
// @route   PUT /api/v1/payrolls/:id/retry
export const retryPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const payroll = await prisma.payroll.findFirst({
      where: {
        id: req.params.id as string,
        companyId: req.user.companyId,
      },
    });

    if (!payroll) {
      throw new AppError('Payroll not found', 404);
    }

    if (payroll.status !== 'FAILED') {
      throw new AppError('Only failed payrolls can be retried', 400);
    }

    // Reset status and re-queue
    await prisma.payroll.update({
      where: { id: payroll.id },
      data: { status: 'SCHEDULED' },
    });

    // Reset failed employee entries
    await prisma.payrollEmployee.updateMany({
      where: { payrollId: payroll.id, status: 'FAILED' },
      data: { status: 'PENDING' },
    });

    await payrollQueue.add('process-payroll', {
      payrollId: payroll.id,
      companyId: req.user.companyId,
    });

    res.json({
      success: true,
      message: 'Payroll queued for retry',
    });
  } catch (error) {
    next(error);
  }
};
