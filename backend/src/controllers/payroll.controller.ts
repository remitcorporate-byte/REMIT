import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { getPaginationParams, paginatedResponse } from '../utils/formatters';
import { payrollQueue } from '../queues/payroll.queue';
import { auditService } from '../services/audit.service';

const prisma = new PrismaClient();

const payrollInputSchema = z.object({
  scheduledDate: z.string().datetime('Invalid date format'),
  employeeIds: z.array(z.string().uuid()).min(1, 'At least one employee required'),
  note: z.string().optional(),
});

const updatePayrollSchema = payrollInputSchema.partial().refine(
  (body) => body.scheduledDate || body.employeeIds || body.note !== undefined,
  'At least one payroll field is required'
);

async function buildPayrollData(companyId: string, employeeIds: string[]) {
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, companyId, isActive: true },
  });

  if (employees.length !== employeeIds.length) {
    throw new AppError('One or more employees are invalid or inactive', 400);
  }

  const totalAmount = employees.reduce((sum, emp) => sum + emp.salary, 0);
  return { employees, totalAmount };
}

async function availableWalletBalance(companyId: string, tx: any = prisma) {
  const wallet = await tx.wallet.findUnique({ where: { companyId } });
  return {
    wallet,
    availableBalance: wallet ? wallet.balance - wallet.reservedBalance : 0,
  };
}

async function reservePayrollFunds(payroll: { id: string; companyId: string; totalAmount: number }) {
  await prisma.$transaction(async (tx: any) => {
    const { wallet, availableBalance } = await availableWalletBalance(payroll.companyId, tx);

    if (!wallet || availableBalance < payroll.totalAmount) {
      throw new AppError(
        `Insufficient wallet balance. Required: ${payroll.totalAmount}, Available: ${availableBalance}`,
        400
      );
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { reservedBalance: { increment: payroll.totalAmount } },
    });
  });
}

async function releasePayrollReservation(payroll: { companyId: string; totalAmount: number }) {
  await prisma.$transaction(async (tx: any) => {
    const { wallet } = await availableWalletBalance(payroll.companyId, tx);
    if (!wallet || wallet.reservedBalance <= 0) return;

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        reservedBalance: {
          decrement: Math.min(wallet.reservedBalance, payroll.totalAmount),
        },
      },
    });
  });
}

function payrollInclude() {
  return {
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    payrollEmployees: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            bankName: true,
            accountNumber: true,
            accountName: true,
            salary: true,
          },
        },
        transaction: {
          select: {
            id: true,
            status: true,
            paystackReference: true,
            paystackTransferId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    },
  };
}

export const createPayrollDraft = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const body = payrollInputSchema.parse(req.body);
    const { employees, totalAmount } = await buildPayrollData(req.user.companyId, body.employeeIds);

    const payroll = await prisma.payroll.create({
      data: {
        companyId: req.user.companyId,
        createdById: req.user.id,
        scheduledDate: new Date(body.scheduledDate),
        status: 'DRAFT',
        totalAmount,
        employeeCount: employees.length,
        note: body.note,
        payrollEmployees: {
          create: employees.map((employee) => ({
            employeeId: employee.id,
            amount: employee.salary,
          })),
        },
      },
      include: payrollInclude(),
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_DRAFT_CREATED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { totalAmount, employeeCount: employees.length },
    });

    res.status(201).json({ success: true, data: payroll });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    next(error);
  }
};

export const schedulePayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const body = payrollInputSchema.parse(req.body);
    const { employees, totalAmount } = await buildPayrollData(req.user.companyId, body.employeeIds);
    const scheduledDate = new Date(body.scheduledDate);

    await reservePayrollFunds({ id: '', companyId: req.user.companyId, totalAmount });

    const payroll = await prisma.payroll.create({
      data: {
        companyId: req.user.companyId,
        createdById: req.user.id,
        approvedById: req.user.id,
        scheduledDate,
        submittedAt: new Date(),
        approvedAt: new Date(),
        status: 'SCHEDULED',
        totalAmount,
        employeeCount: employees.length,
        note: body.note,
        payrollEmployees: {
          create: employees.map((employee) => ({
            employeeId: employee.id,
            amount: employee.salary,
          })),
        },
      },
      include: payrollInclude(),
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_CREATED_AND_APPROVED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { totalAmount, employeeCount: employees.length },
    });

    if (scheduledDate <= new Date()) {
      await payrollQueue.add('process-payroll', { payrollId: payroll.id, companyId: req.user.companyId }, { jobId: payroll.id });
    }

    res.status(201).json({ success: true, data: payroll });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    next(error);
  }
};

export const updatePayrollDraft = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const body = updatePayrollSchema.parse(req.body);
    const existing = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
      include: { payrollEmployees: true },
    });

    if (!existing) throw new AppError('Payroll not found', 404);
    if (existing.status !== 'DRAFT') throw new AppError(`Cannot edit payroll with status: ${existing.status}`, 400);

    let totalAmount = existing.totalAmount;
    let employeeCount = existing.employeeCount;
    let employeeRows: Array<{ employeeId: string; amount: number }> | null = null;

    if (body.employeeIds) {
      const built = await buildPayrollData(req.user.companyId, body.employeeIds);
      totalAmount = built.totalAmount;
      employeeCount = built.employees.length;
      employeeRows = built.employees.map((employee) => ({ employeeId: employee.id, amount: employee.salary }));
    }

    const payroll = await prisma.$transaction(async (tx: any) => {
      if (employeeRows) {
        await tx.payrollEmployee.deleteMany({ where: { payrollId: existing.id } });
      }

      return tx.payroll.update({
        where: { id: existing.id },
        data: {
          ...(body.scheduledDate && { scheduledDate: new Date(body.scheduledDate) }),
          ...(body.note !== undefined && { note: body.note }),
          totalAmount,
          employeeCount,
          ...(employeeRows && {
            payrollEmployees: {
              create: employeeRows,
            },
          }),
        },
        include: payrollInclude(),
      });
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_DRAFT_UPDATED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { totalAmount, employeeCount },
    });

    res.json({ success: true, data: payroll });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    next(error);
  }
};

export const submitPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const payroll = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
    });

    if (!payroll) throw new AppError('Payroll not found', 404);
    if (payroll.status !== 'DRAFT') throw new AppError(`Cannot submit payroll with status: ${payroll.status}`, 400);

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
      include: payrollInclude(),
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_SUBMITTED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { totalAmount: payroll.totalAmount, employeeCount: payroll.employeeCount },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const approvePayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const payroll = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
    });

    if (!payroll) throw new AppError('Payroll not found', 404);
    if (payroll.status !== 'PENDING_APPROVAL') {
      throw new AppError(`Cannot approve payroll with status: ${payroll.status}`, 400);
    }

    if (payroll.createdById === req.user.id) {
      const otherApproverCount = await prisma.user.count({
        where: {
          companyId: req.user.companyId,
          id: { not: req.user.id },
          isActive: true,
          role: { in: ['OWNER', 'ADMIN', 'FINANCE'] },
        },
      });

      if (otherApproverCount > 0) {
        throw new AppError('Payroll must be approved by a different authorized team member', 400);
      }
    }

    await reservePayrollFunds(payroll);

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: {
        status: 'SCHEDULED',
        approvedAt: new Date(),
        approvedById: req.user.id,
      },
      include: payrollInclude(),
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_APPROVED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { totalAmount: payroll.totalAmount, employeeCount: payroll.employeeCount },
    });

    if (updated.scheduledDate <= new Date()) {
      await payrollQueue.add('process-payroll', { payrollId: updated.id, companyId: req.user.companyId }, { jobId: updated.id });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const getPayrolls = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const { skip, take, page, limit } = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 10
    );
    const status = req.query.status as string | undefined;
    const where = { companyId: req.user.companyId, ...(status && { status: status as any }) };

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledDate: 'desc' },
        include: { _count: { select: { payrollEmployees: true } } },
      }),
      prisma.payroll.count({ where }),
    ]);

    res.json(paginatedResponse(payrolls, total, page, limit));
  } catch (error) {
    next(error);
  }
};

export const getPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const payroll = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
      include: payrollInclude(),
    });

    if (!payroll) throw new AppError('Payroll not found', 404);
    res.json({ success: true, data: payroll });
  } catch (error) {
    next(error);
  }
};

export const cancelPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const payroll = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
    });

    if (!payroll) throw new AppError('Payroll not found', 404);
    if (!['DRAFT', 'PENDING_APPROVAL', 'SCHEDULED'].includes(payroll.status)) {
      throw new AppError(`Cannot cancel payroll with status: ${payroll.status}`, 400);
    }

    if (payroll.status === 'SCHEDULED') {
      await releasePayrollReservation(payroll);
    }

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: payrollInclude(),
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_CANCELLED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { previousStatus: payroll.status },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const retryPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const payroll = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
      include: {
        payrollEmployees: { where: { status: 'FAILED' }, select: { id: true, amount: true } },
      },
    });

    if (!payroll) throw new AppError('Payroll not found', 404);
    if (payroll.status !== 'FAILED') throw new AppError('Only failed payrolls can be retried', 400);

    const retryAmount = payroll.payrollEmployees.reduce((sum, pe) => sum + pe.amount, 0);
    if (retryAmount === 0) throw new AppError('No failed payroll employee rows to retry', 400);

    const { wallet, availableBalance } = await availableWalletBalance(req.user.companyId);
    if (!wallet || availableBalance < retryAmount) {
      throw new AppError(`Insufficient wallet balance. Required: ${retryAmount}, Available: ${availableBalance}`, 400);
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.payroll.update({
        where: { id: payroll.id },
        data: { status: 'SCHEDULED', failureReason: null },
      });
      await tx.payrollEmployee.updateMany({
        where: { payrollId: payroll.id, status: 'FAILED' },
        data: { status: 'PENDING' },
      });
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_RETRY_REQUESTED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { retryAmount, failedRows: payroll.payrollEmployees.length },
    });

    await payrollQueue.add(
      'process-payroll',
      { payrollId: payroll.id, companyId: req.user.companyId },
      { jobId: `${payroll.id}-retry-${Date.now()}` }
    );

    res.json({ success: true, message: 'Payroll queued for retry' });
  } catch (error) {
    next(error);
  }
};

export const exportPayroll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const payroll = await prisma.payroll.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
      include: payrollInclude(),
    });
    if (!payroll) throw new AppError('Payroll not found', 404);

    const rows = [
      ['Employee', 'Email', 'Bank', 'Account Last 4', 'Amount Kobo', 'Status', 'Reference', 'Transfer Id'],
      ...payroll.payrollEmployees.map((row: any) => [
        `${row.employee.firstName} ${row.employee.lastName}`,
        row.employee.email,
        row.employee.bankName,
        row.employee.accountNumber.slice(-4),
        row.amount,
        row.status,
        row.transaction?.paystackReference || '',
        row.transaction?.paystackTransferId || '',
      ]),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${payroll.id}.csv"`);
    res.send(rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'));
  } catch (error) {
    next(error);
  }
};
