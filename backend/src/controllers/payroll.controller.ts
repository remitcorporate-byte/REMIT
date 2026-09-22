import { Request, Response, NextFunction } from 'express';
import { PayrollStatus, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { getPaginationParams, paginatedResponse, escapeCsvValue } from '../utils/formatters';
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

async function availableWalletBalance(
  companyId: string,
  tx: Prisma.TransactionClient | PrismaClient = prisma
) {
  const wallet = await tx.wallet.findUnique({ where: { companyId } });
  return {
    wallet,
    availableBalance: wallet ? wallet.balance - wallet.reservedBalance : 0,
  };
}

async function reservePayrollFunds(
  payroll: { id: string; companyId: string; totalAmount: number },
  tx: Prisma.TransactionClient | PrismaClient = prisma
) {
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
}

async function releasePayrollReservation(
  payroll: { companyId: string; totalAmount: number },
  tx: Prisma.TransactionClient | PrismaClient = prisma
) {
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

    res.status(410).json({
      success: false,
      error: 'Direct payroll scheduling has been removed. Create a draft, submit it, and approve it through the controlled workflow.',
      replacement: {
        createDraft: 'POST /api/v1/payrolls/drafts',
        submit: 'PUT /api/v1/payrolls/:id/submit',
        approve: 'PUT /api/v1/payrolls/:id/approve',
      },
    });
  } catch (error) {
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

    const payroll = await prisma.$transaction(async (tx) => {
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

    // Guarded transition: only one request can move this payroll from
    // PENDING_APPROVAL to SCHEDULED, and the wallet reservation happens in the
    // same transaction. Two concurrent approvals cannot double-reserve, and an
    // approval racing a cancel cannot reserve funds for a cancelled payroll.
    const approved = await prisma.$transaction(async (tx) => {
      const transition = await tx.payroll.updateMany({
        where: {
          id: req.params.id as string,
          companyId: req.user!.companyId!,
          status: 'PENDING_APPROVAL',
        },
        data: {
          status: 'SCHEDULED',
          approvedAt: new Date(),
          approvedById: req.user!.id,
        },
      });

      if (transition.count !== 1) return null;

      await reservePayrollFunds(payroll, tx);

      return tx.payroll.findUnique({
        where: { id: req.params.id as string },
        include: payrollInclude(),
      });
    });

    if (!approved) {
      throw new AppError(
        'Payroll could not be approved. It may already be approved or cancelled.',
        400
      );
    }

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_APPROVED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { totalAmount: payroll.totalAmount, employeeCount: payroll.employeeCount },
    });

    if (approved.scheduledDate <= new Date()) {
      await payrollQueue.add('process-payroll', { payrollId: approved.id, companyId: req.user.companyId }, { jobId: approved.id });
    }

    res.json({ success: true, data: approved });
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
    if (status && !Object.values(PayrollStatus).includes(status as PayrollStatus)) {
      throw new AppError(`Invalid payroll status: ${status}`, 400);
    }
    const where: Prisma.PayrollWhereInput = {
      companyId: req.user.companyId,
      ...(status && { status: status as PayrollStatus }),
    };

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

    // Guarded transition: cancelling and releasing the reservation happen
    // atomically, and only the request that wins the status transition may
    // release funds. Racing the processing claim can no longer double-release
    // the reservation or stamp CANCELLED on a payroll that has started paying.
    const cancelled = await prisma.$transaction(async (tx) => {
      // DRAFT and PENDING_APPROVAL payrolls never reserved funds.
      const unreserved = await tx.payroll.updateMany({
        where: {
          id: req.params.id as string,
          companyId: req.user!.companyId!,
          status: { in: ['DRAFT', 'PENDING_APPROVAL'] },
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      if (unreserved.count === 1) {
        return tx.payroll.findUnique({
          where: { id: req.params.id as string },
          include: payrollInclude(),
        });
      }

      // SCHEDULED payrolls hold a reservation — release it on cancel.
      const scheduled = await tx.payroll.updateMany({
        where: {
          id: req.params.id as string,
          companyId: req.user!.companyId!,
          status: 'SCHEDULED',
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      if (scheduled.count !== 1) return null;

      await releasePayrollReservation(payroll, tx);

      return tx.payroll.findUnique({
        where: { id: req.params.id as string },
        include: payrollInclude(),
      });
    });

    if (!cancelled) {
      throw new AppError(
        'Payroll could not be cancelled. It may already be processing or cancelled.',
        400
      );
    }

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_CANCELLED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { previousStatus: payroll.status },
    });

    res.json({ success: true, data: cancelled });
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

    const unresolvedTransferCount = await prisma.transaction.count({
      where: {
        type: 'PAYROLL_DEBIT',
        status: 'PENDING',
        payrollEmployee: { payrollId: payroll.id },
      },
    });
    if (unresolvedTransferCount > 0) {
      throw new AppError(
        'Payroll has unresolved provider transfers and cannot be retried until reconciliation completes',
        409
      );
    }

    const retryableRows = await prisma.payrollEmployee.findMany({
      where: {
        payrollId: payroll.id,
        status: { in: ['FAILED', 'REVERSED'] },
      },
      select: { id: true, amount: true },
    });
    const retryAmount = retryableRows.reduce((sum, pe) => sum + pe.amount, 0);
    if (retryAmount === 0) throw new AppError('No failed payroll employee rows to retry', 400);

    const { wallet, availableBalance } = await availableWalletBalance(req.user.companyId);
    if (!wallet || availableBalance < retryAmount) {
      throw new AppError(`Insufficient wallet balance. Required: ${retryAmount}, Available: ${availableBalance}`, 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { reservedBalance: { increment: retryAmount } },
      });
      await tx.payroll.update({
        where: { id: payroll.id },
        data: {
          status: 'SCHEDULED',
          failureReason: null,
          processedDate: null,
          processingStartedAt: null,
          processingHeartbeatAt: null,
          reservationReleasedAt: null,
        },
      });
      await tx.payrollEmployee.updateMany({
        where: { payrollId: payroll.id, status: { in: ['FAILED', 'REVERSED'] } },
        data: { status: 'PENDING' },
      });
    });

    await auditService.record({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'PAYROLL_RETRY_REQUESTED',
      entityType: 'Payroll',
      entityId: payroll.id,
      metadata: { retryAmount, failedRows: retryableRows.length },
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
      ...payroll.payrollEmployees.map((row) => [
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
    res.send(rows.map((row) => row.map((value) => escapeCsvValue(value)).join(',')).join('\n'));
  } catch (error) {
    next(error);
  }
};
