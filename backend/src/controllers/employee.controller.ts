import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { paystackService } from '../services/paystack.service';
import { getPaginationParams, paginatedResponse } from '../utils/formatters';
import { getNextPaymentDate } from '../utils/dateHelpers';

const prisma = new PrismaClient();

const createEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  bankName: z.string().min(1, 'Bank name is required'),
  bankCode: z.string().min(1, 'Bank code is required'),
  accountNumber: z.string().min(10, 'Account number must be at least 10 digits'),
  salary: z.number().positive('Salary must be positive'), // in kobo
  paymentFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('MONTHLY'),
  nextPaymentDate: z.string().datetime().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
});

const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  bankName: z.string().min(1).optional(),
  bankCode: z.string().min(1).optional(),
  accountNumber: z.string().min(10).optional(),
  salary: z.number().positive().optional(),
  paymentFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  nextPaymentDate: z.string().datetime().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
});

// @desc    Create employee
// @route   POST /api/v1/employees
export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const body = createEmployeeSchema.parse(req.body);

    // Check for duplicate email within company
    const existing = await prisma.employee.findUnique({
      where: {
        companyId_email: {
          companyId: req.user.companyId,
          email: body.email,
        },
      },
    });
    if (existing) {
      throw new AppError('An employee with this email already exists in your company', 400);
    }

    // Verify bank account with Paystack
    let accountName = '';
    try {
      const verification = await paystackService.verifyBankAccount(
        body.accountNumber,
        body.bankCode
      );
      accountName = verification.data.account_name;
    } catch {
      // Use provided info if Paystack verification fails in dev
      accountName = `${body.firstName} ${body.lastName}`;
    }

    // Create Paystack transfer recipient
    let paystackRecipientCode: string | undefined;
    try {
      const recipient = await paystackService.createTransferRecipient({
        name: accountName,
        accountNumber: body.accountNumber,
        bankCode: body.bankCode,
      });
      paystackRecipientCode = recipient.data.recipient_code;
    } catch {
      // Continue without recipient code - will be created during payroll
    }

    const nextPayment = body.nextPaymentDate
      ? new Date(body.nextPaymentDate)
      : getNextPaymentDate(new Date(), body.paymentFrequency);

    const employee = await prisma.employee.create({
      data: {
        companyId: req.user.companyId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        bankName: body.bankName,
        bankCode: body.bankCode,
        accountNumber: body.accountNumber,
        accountName,
        salary: body.salary,
        department: body.department,
        position: body.position,
        paymentFrequency: body.paymentFrequency,
        nextPaymentDate: nextPayment,
        paystackRecipientCode,
      },
    });

    res.status(201).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return next(new AppError(messages, 400));
    }
    next(error);
  }
};

// @desc    Get all employees
// @route   GET /api/v1/employees
export const getEmployees = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const { skip, take, page, limit } = getPaginationParams(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 10
    );

    const search = req.query.search as string | undefined;

    const where: any = {
      companyId: req.user.companyId,
      isActive: req.query.includeInactive === 'true' ? undefined : true,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.employee.count({ where }),
    ]);

    res.json(paginatedResponse(employees, total, page, limit));
  } catch (error) {
    next(error);
  }
};

// @desc    Get single employee
// @route   GET /api/v1/employees/:id
export const getEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id: req.params.id as string,
        companyId: req.user.companyId,
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        payrollEmployees: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            payroll: { select: { scheduledDate: true, status: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update employee
// @route   PUT /api/v1/employees/:id
export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const body = updateEmployeeSchema.parse(req.body);

    const existing = await prisma.employee.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
    });
    if (!existing) {
      throw new AppError('Employee not found', 404);
    }

    // If bank details changed, update Paystack recipient
    let paystackRecipientCode = existing.paystackRecipientCode;
    let accountName = existing.accountName;

    if (body.accountNumber || body.bankCode) {
      const accNum = body.accountNumber || existing.accountNumber;
      const bankCd = body.bankCode || existing.bankCode;

      try {
        const verification = await paystackService.verifyBankAccount(accNum, bankCd);
        accountName = verification.data.account_name;
      } catch {
        accountName = `${body.firstName || existing.firstName} ${body.lastName || existing.lastName}`;
      }

      try {
        const recipient = await paystackService.createTransferRecipient({
          name: accountName,
          accountNumber: accNum,
          bankCode: bankCd,
        });
        paystackRecipientCode = recipient.data.recipient_code;
      } catch {
        // Keep existing recipient code
      }
    }

    const employee = await prisma.employee.update({
      where: { id: req.params.id as string },
      data: {
        ...body,
        ...(body.nextPaymentDate && {
          nextPaymentDate: new Date(body.nextPaymentDate),
        }),
        accountName,
        paystackRecipientCode,
      },
    });

    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return next(new AppError(messages, 400));
    }
    next(error);
  }
};

// @desc    Delete (deactivate) employee
// @route   DELETE /api/v1/employees/:id
export const deleteEmployee = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('No company associated with this user', 400);
    }

    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id as string, companyId: req.user.companyId },
    });
    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    await prisma.employee.update({
      where: { id: req.params.id as string },
      data: { isActive: false },
    });

    res.json({
      success: true,
      message: 'Employee deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};
