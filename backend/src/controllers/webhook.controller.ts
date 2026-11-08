import { prisma } from '../lib/prisma';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import config from '../config';
import { notificationService } from '../services/notification.service';
import { getNextPaymentDate } from '../utils/dateHelpers';
import { auditService } from '../services/audit.service';


type PaystackWebhookRequest = Request & { rawBody?: Buffer };
const transferTransactionInclude = {
  employee: true,
  payrollEmployee: {
    include: {
      payroll: true,
      employee: true,
    },
  },
} satisfies Prisma.TransactionInclude;

type TransferTransaction = Prisma.TransactionGetPayload<{
  include: typeof transferTransactionInclude;
}>;

type PaystackEventData = Record<string, unknown>;

function eventData(value: unknown): PaystackEventData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Paystack webhook data must be an object');
  }
  return value as PaystackEventData;
}

function optionalProviderString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function requiredProviderString(value: unknown, field: string): string {
  const parsed = optionalProviderString(value);
  if (!parsed) throw new Error(`Paystack webhook is missing ${field}`);
  return parsed;
}

// @desc    Handle Paystack webhooks
// @route   POST /api/v1/webhooks/paystack
export const handlePaystackWebhook = async (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = (req as PaystackWebhookRequest).rawBody;

  if (!rawBody || typeof signature !== 'string') {
    res.status(400).json({ success: false, error: 'Invalid signature' });
    return;
  }

  const hash = crypto
    .createHmac('sha512', config.paystack.secretKey)
    .update(rawBody)
    .digest('hex');

  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(signature, 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
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

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    next(error);
  }
};

async function handleChargeSuccess(data: unknown) {
  const payload = eventData(data);
  const reference = requiredProviderString(payload.reference, 'reference');

  const transaction = await prisma.transaction.findUnique({
    where: { paystackReference: reference },
  });

  if (!transaction || transaction.status === 'SUCCESS') return;
  if (transaction.type !== 'DEPOSIT') {
    throw new Error(`Paystack charge reference ${reference} is not a deposit`);
  }

  const providerAmount = Number(payload.amount);
  const providerCurrency = String(payload.currency || '').toUpperCase();
  if (!Number.isSafeInteger(providerAmount) || providerAmount !== transaction.amount) {
    throw new Error(`Paystack charge amount mismatch for reference ${reference}`);
  }
  if (providerCurrency && providerCurrency !== 'NGN') {
    throw new Error(`Paystack charge currency mismatch for reference ${reference}`);
  }

  const credited = await prisma.$transaction(async (tx) => {
    const transition = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        type: 'DEPOSIT',
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'SUCCESS' },
    });

    if (transition.count === 1) {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: transaction.amount } },
      });
    }

    return transition.count === 1;
  });

  if (!credited) return;

  await Promise.all([
    notificationService.notifyCompanyAdmins({
      companyId: transaction.companyId,
      type: 'DEPOSIT_SUCCESS',
      title: 'Deposit Successful',
      message: `Your deposit of ${transaction.amount / 100} NGN has been confirmed.`,
    }),
    auditService.record({
      companyId: transaction.companyId,
      action: 'DEPOSIT_WEBHOOK_SUCCESS',
      entityType: 'Transaction',
      entityId: transaction.id,
      metadata: { reference, amount: transaction.amount },
    }),
  ]);
}

async function handleTransferSuccess(data: unknown) {
  const payload = eventData(data);
  const reference = optionalProviderString(payload.reference);
  const transferCode = optionalProviderString(payload.transfer_code);

  const transaction = await findTransferTransaction(reference, transferCode);

  if (!transaction || transaction.status !== 'PENDING') return;

  const transitioned = await prisma.$transaction(async (tx) => {
    const transition = await tx.transaction.updateMany({
      where: { id: transaction.id, status: 'PENDING' },
      data: {
        status: 'SUCCESS',
        ...(transferCode && { paystackTransferId: transferCode }),
      },
    });

    if (transition.count !== 1) return false;

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

    return true;
  });

  if (!transitioned) return;

  if (transaction.payrollEmployee?.payrollId) {
    await recomputePayrollStatus(transaction.payrollEmployee.payrollId);
  }

  await auditService.record({
    companyId: transaction.companyId,
    action: 'TRANSFER_WEBHOOK_SUCCESS',
    entityType: 'Transaction',
    entityId: transaction.id,
    metadata: { reference, transferCode, payrollEmployeeId: transaction.payrollEmployeeId },
  });
}

async function handleTransferFailed(data: unknown) {
  const payload = eventData(data);
  const reference = optionalProviderString(payload.reference);
  const transferCode = optionalProviderString(payload.transfer_code);

  const transaction = await findTransferTransaction(reference, transferCode);

  if (!transaction || transaction.status !== 'PENDING') return;

  const transitioned = await prisma.$transaction(async (tx) => {
    const transition = await tx.transaction.updateMany({
      where: { id: transaction.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    if (transition.count !== 1) return false;

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

    return true;
  });

  if (!transitioned) return;

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
    metadata: { reference, transferCode, payrollEmployeeId: transaction.payrollEmployeeId },
  });
}

async function handleTransferReversed(data: unknown) {
  const payload = eventData(data);
  const reference = optionalProviderString(payload.reference);
  const transferCode = optionalProviderString(payload.transfer_code);

  const transaction = await findTransferTransaction(reference, transferCode);

  if (!transaction || transaction.status === 'REVERSED' || transaction.status === 'FAILED') return;

  const transitioned = await prisma.$transaction(async (tx) => {
    const transition = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        status: { in: ['PENDING', 'SUCCESS'] },
      },
      data: {
        status: 'REVERSED',
        ...(transferCode && { paystackTransferId: transferCode }),
      },
    });

    if (transition.count !== 1) return false;

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

    return true;
  });

  if (!transitioned) return;

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
    metadata: { reference, transferCode, payrollEmployeeId: transaction.payrollEmployeeId },
  });
}

async function findTransferTransaction(
  reference?: string,
  transferCode?: string
): Promise<TransferTransaction | null> {
  if (reference) {
    const transaction = await prisma.transaction.findUnique({
      where: { paystackReference: reference },
      include: transferTransactionInclude,
    });

    if (
      transaction &&
      transferCode &&
      transaction.paystackTransferId &&
      transaction.paystackTransferId !== transferCode
    ) {
      throw new Error(`Paystack transfer code mismatch for reference ${reference}`);
    }

    if (transaction) return transaction;
  }

  if (!transferCode) return null;

  return prisma.transaction.findUnique({
    where: { paystackTransferId: transferCode },
    include: transferTransactionInclude,
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
