import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import config from '../config';
import { notificationService } from '../services/notification.service';
import { getNextPaymentDate } from '../utils/dateHelpers';
import { auditService } from '../services/audit.service';

const prisma = new PrismaClient();

// @desc    Handle Paystack webhooks
// @route   POST /api/v1/webhooks/paystack
export const handlePaystackWebhook = async (req: Request, res: Response, _next: NextFunction) => {
  // Verify signature
  const hash = crypto
    .createHmac('sha512', config.paystack.secretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    res.status(400).json({ success: false, error: 'Invalid signature' });
    return;
  }

  const event = req.body;

  try {
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data);
        break;
      case 'transfer.success':
        await handleTransferSuccess(event.data);
        break;
      case 'transfer.failed':
        await handleTransferFailed(event.data);
        break;
      case 'transfer.reversed':
        await handleTransferReversed(event.data);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ success: true });
};

async function handleChargeSuccess(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
  });

  if (!transaction || transaction.status === 'SUCCESS') return;

  await prisma.$transaction(async (tx: any) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SUCCESS' },
    });

    if (transaction.type === 'DEPOSIT') {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: transaction.amount } },
      });
    }
  });

  await notificationService.notifyCompanyAdmins({
    companyId: transaction.companyId,
    type: 'DEPOSIT_SUCCESS',
    title: 'Deposit Successful',
    message: `Your deposit of ${transaction.amount / 100} NGN has been confirmed.`,
  });

  await auditService.record({
    companyId: transaction.companyId,
    action: 'DEPOSIT_WEBHOOK_SUCCESS',
    entityType: 'Transaction',
    entityId: transaction.id,
    metadata: { reference },
  });
}

async function handleTransferSuccess(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
    include: {
      employee: true,
      payrollEmployee: {
        include: {
          payroll: true,
          employee: true,
        },
      },
    },
  });

  if (!transaction || transaction.status !== 'PENDING') return;

  await prisma.$transaction(async (tx: any) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        paystackTransferId: data.transfer_code,
      },
    });

    if (transaction.payrollEmployeeId) {
      await tx.payrollEmployee.update({
        where: { id: transaction.payrollEmployeeId },
        data: { status: 'SUCCESS' },
      });
    }

    if (transaction.payrollEmployee?.employee) {
      await tx.employee.update({
        where: { id: transaction.payrollEmployee.employee.id },
        data: {
          nextPaymentDate: getNextPaymentDate(
            new Date(),
            transaction.payrollEmployee.employee.paymentFrequency
          ),
        },
      });
    }
  });

  if (transaction.payrollEmployee?.payrollId) {
    await recomputePayrollStatus(transaction.payrollEmployee.payrollId);
  }

  await auditService.record({
    companyId: transaction.companyId,
    action: 'TRANSFER_WEBHOOK_SUCCESS',
    entityType: 'Transaction',
    entityId: transaction.id,
    metadata: { reference, payrollEmployeeId: transaction.payrollEmployeeId },
  });
}

async function handleTransferFailed(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
    include: { payrollEmployee: true },
  });

  if (!transaction || transaction.status !== 'PENDING') return;

  await prisma.$transaction(async (tx: any) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    });

    // Refund wallet
    if (transaction.type === 'PAYROLL_DEBIT') {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: transaction.amount } },
      });

      // Create refund transaction record
      await tx.transaction.create({
        data: {
          companyId: transaction.companyId,
          walletId: transaction.walletId,
          employeeId: transaction.employeeId,
          type: 'REFUND',
          amount: transaction.amount,
          status: 'SUCCESS',
          description: `Refund for failed transfer: ${reference}`,
        },
      });
    }

    if (transaction.payrollEmployeeId) {
      await tx.payrollEmployee.update({
        where: { id: transaction.payrollEmployeeId },
        data: { status: 'FAILED' },
      });
    }
  });

  if (transaction.payrollEmployee?.payrollId) {
    await recomputePayrollStatus(transaction.payrollEmployee.payrollId);
  }

  await notificationService.notifyCompanyAdmins({
    companyId: transaction.companyId,
    type: 'PAYROLL_FAILED',
    title: 'Transfer Failed',
    message: `A transfer of ${transaction.amount / 100} NGN has failed. The amount has been refunded to your wallet.`,
  });

  await auditService.record({
    companyId: transaction.companyId,
    action: 'TRANSFER_WEBHOOK_FAILED',
    entityType: 'Transaction',
    entityId: transaction.id,
    metadata: { reference, payrollEmployeeId: transaction.payrollEmployeeId },
  });
}

async function handleTransferReversed(data: any) {
  const reference = data.reference;

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
    include: { payrollEmployee: true },
  });

  if (!transaction || transaction.status !== 'PENDING') return;

  await prisma.$transaction(async (tx: any) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: 'REVERSED' },
    });

    // Refund wallet
    await tx.wallet.update({
      where: { id: transaction.walletId },
      data: { balance: { increment: transaction.amount } },
    });

    await tx.transaction.create({
      data: {
        companyId: transaction.companyId,
        walletId: transaction.walletId,
        employeeId: transaction.employeeId,
        type: 'REFUND',
        amount: transaction.amount,
        status: 'SUCCESS',
        description: `Refund for reversed transfer: ${reference}`,
      },
    });

    if (transaction.payrollEmployeeId) {
      await tx.payrollEmployee.update({
        where: { id: transaction.payrollEmployeeId },
        data: { status: 'REVERSED' },
      });
    }
  });

  if (transaction.payrollEmployee?.payrollId) {
    await recomputePayrollStatus(transaction.payrollEmployee.payrollId);
  }

  await notificationService.notifyCompanyAdmins({
    companyId: transaction.companyId,
    type: 'PAYROLL_FAILED',
    title: 'Transfer Reversed',
    message: `A transfer of ${transaction.amount / 100} NGN has been reversed. The amount has been refunded to your wallet.`,
  });

  await auditService.record({
    companyId: transaction.companyId,
    action: 'TRANSFER_WEBHOOK_REVERSED',
    entityType: 'Transaction',
    entityId: transaction.id,
    metadata: { reference, payrollEmployeeId: transaction.payrollEmployeeId },
  });
}

async function recomputePayrollStatus(payrollId: string) {
  const [pendingCount, failedCount, totalCount] = await Promise.all([
    prisma.payrollEmployee.count({ where: { payrollId, status: 'PENDING' } }),
    prisma.payrollEmployee.count({
      where: { payrollId, status: { in: ['FAILED', 'REVERSED'] } },
    }),
    prisma.payrollEmployee.count({ where: { payrollId } }),
  ]);

  if (totalCount === 0) return;

  const status = pendingCount > 0 ? 'PROCESSING' : failedCount > 0 ? 'FAILED' : 'COMPLETED';

  await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status,
      ...(status !== 'PROCESSING' && { processedDate: new Date() }),
    },
  });
}
