import { Prisma, PrismaClient, TransactionStatus } from '@prisma/client';
import { paystackService } from '../services/paystack.service';
import { auditService } from '../services/audit.service';
import { notificationService } from '../services/notification.service';
import { getNextPaymentDate } from '../utils/dateHelpers';

const prisma = new PrismaClient();

const reconciliationInclude = {
  payrollEmployee: {
    include: {
      employee: true,
    },
  },
} satisfies Prisma.TransactionInclude;

type ReconciliationTransaction = Prisma.TransactionGetPayload<{
  include: typeof reconciliationInclude;
}>;

type ConclusiveTransferStatus = 'SUCCESS' | 'FAILED' | 'REVERSED';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function providerData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Paystack transfer verification returned invalid data');
  }
  return value as Record<string, unknown>;
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

  const status = pendingCount > 0
    ? 'PROCESSING'
    : failedCount > 0
      ? 'FAILED'
      : 'COMPLETED';

  await prisma.payroll.update({
    where: { id: payrollId },
    data: {
      status,
      processingHeartbeatAt: null,
      ...(status !== 'PROCESSING' && { processedDate: new Date() }),
      ...(status === 'COMPLETED' && { failureReason: null }),
    },
  });
}

async function settleTransfer(
  transaction: ReconciliationTransaction,
  status: ConclusiveTransferStatus,
  transferCode?: string
) {
  const transitioned = await prisma.$transaction(async (tx) => {
    const allowedStatuses: TransactionStatus[] =
      status === 'REVERSED' ? ['PENDING', 'SUCCESS'] : ['PENDING'];
    const transition = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        status: { in: allowedStatuses },
      },
      data: {
        status,
        reconciliationStartedAt: null,
        reconciliationCheckedAt: new Date(),
        reconciliationError: null,
        ...(transferCode && { paystackTransferId: transferCode }),
      },
    });

    if (transition.count !== 1) return false;

    if (status === 'FAILED' || status === 'REVERSED') {
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
          description: `Refund for reconciled ${status.toLowerCase()} transfer: ${transaction.paystackReference}`,
        },
      });
    }

    if (transaction.payrollEmployeeId) {
      await tx.payrollEmployee.update({
        where: { id: transaction.payrollEmployeeId },
        data: { status },
      });
    }

    if (
      status === 'SUCCESS' &&
      transaction.payrollEmployee?.employee
    ) {
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

  if (!transitioned) return false;

  const payrollId = transaction.payrollEmployee?.payrollId;
  if (payrollId) await recomputePayrollStatus(payrollId);

  await auditService.record({
    companyId: transaction.companyId,
    action: `TRANSFER_RECONCILIATION_${status}`,
    entityType: 'Transaction',
    entityId: transaction.id,
    metadata: {
      reference: transaction.paystackReference,
      transferCode,
      payrollEmployeeId: transaction.payrollEmployeeId,
    },
  });

  if (status !== 'SUCCESS') {
    await notificationService.notifyCompanyAdmins({
      companyId: transaction.companyId,
      type: 'PAYROLL_FAILED',
      title: status === 'REVERSED' ? 'Transfer Reversed' : 'Transfer Failed',
      message:
        `A transfer of ${transaction.amount / 100} NGN was reconciled as ` +
        `${status.toLowerCase()}. The amount has been refunded to your wallet.`,
    });
  }

  return true;
}

async function releaseClaim(transactionId: string, error?: string) {
  await prisma.transaction.updateMany({
    where: { id: transactionId, status: 'PENDING' },
    data: {
      reconciliationStartedAt: null,
      reconciliationCheckedAt: new Date(),
      reconciliationError: error || null,
    },
  });
}

export async function reconcilePendingTransfers(options?: {
  companyId?: string;
  transactionIds?: string[];
}) {
  const now = new Date();
  const minimumAgeMs = Number(
    process.env.TRANSFER_RECONCILIATION_MIN_AGE_MS || 2 * 60 * 1000
  );
  const retryIntervalMs = Number(
    process.env.TRANSFER_RECONCILIATION_INTERVAL_MS || 5 * 60 * 1000
  );
  const claimTimeoutMs = Number(
    process.env.TRANSFER_RECONCILIATION_CLAIM_TIMEOUT_MS || 2 * 60 * 1000
  );
  const batchSize = Number(process.env.TRANSFER_RECONCILIATION_BATCH_SIZE || 50);
  const createdCutoff = new Date(now.getTime() - minimumAgeMs);
  const checkedCutoff = new Date(now.getTime() - retryIntervalMs);
  const claimCutoff = new Date(now.getTime() - claimTimeoutMs);

  const candidates = await prisma.transaction.findMany({
    where: {
      type: 'PAYROLL_DEBIT',
      status: 'PENDING',
      paystackReference: { not: null },
      createdAt: { lte: createdCutoff },
      ...(options?.companyId && { companyId: options.companyId }),
      ...(options?.transactionIds && { id: { in: options.transactionIds } }),
      AND: [
        {
          OR: [
            { reconciliationCheckedAt: null },
            { reconciliationCheckedAt: { lte: checkedCutoff } },
          ],
        },
        {
          OR: [
            { reconciliationStartedAt: null },
            { reconciliationStartedAt: { lte: claimCutoff } },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    include: reconciliationInclude,
  });

  const result = {
    scanned: candidates.length,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    reversed: 0,
    pending: 0,
    errors: 0,
  };

  for (const transaction of candidates) {
    const claim = await prisma.transaction.updateMany({
      where: {
        id: transaction.id,
        status: 'PENDING',
        ...(options?.companyId && { companyId: options.companyId }),
        AND: [
          {
            OR: [
              { reconciliationCheckedAt: null },
              { reconciliationCheckedAt: { lte: checkedCutoff } },
            ],
          },
          {
            OR: [
              { reconciliationStartedAt: null },
              { reconciliationStartedAt: { lte: claimCutoff } },
            ],
          },
        ],
      },
      data: {
        reconciliationStartedAt: now,
        reconciliationAttempt: { increment: 1 },
        reconciliationError: null,
      },
    });
    if (claim.count !== 1) continue;
    result.claimed++;

    try {
      const reference = transaction.paystackReference;
      if (!reference) {
        await releaseClaim(transaction.id, 'Transfer reference is missing');
        result.errors++;
        continue;
      }

      const verification = await paystackService.verifyTransfer(reference);
      const data = providerData(verification?.data);
      const providerStatus = optionalString(data.status)?.toLowerCase();
      const transferCode = optionalString(data.transfer_code);
      const providerReference = optionalString(data.reference);
      const providerCurrency = optionalString(data.currency)?.toUpperCase();
      const providerAmount =
        data.amount === undefined || data.amount === null
          ? undefined
          : Number(data.amount);

      if (providerReference && providerReference !== reference) {
        throw new Error(`Paystack transfer reference mismatch for ${reference}`);
      }
      if (
        transferCode &&
        transaction.paystackTransferId &&
        transaction.paystackTransferId !== transferCode
      ) {
        throw new Error(`Paystack transfer code mismatch for ${reference}`);
      }
      if (
        providerAmount !== undefined &&
        (!Number.isSafeInteger(providerAmount) || providerAmount !== transaction.amount)
      ) {
        throw new Error(`Paystack transfer amount mismatch for ${reference}`);
      }
      if (providerCurrency && providerCurrency !== 'NGN') {
        throw new Error(`Paystack transfer currency mismatch for ${reference}`);
      }

      if (
        providerStatus === 'success' ||
        providerStatus === 'failed' ||
        providerStatus === 'reversed'
      ) {
        const status = providerStatus.toUpperCase() as ConclusiveTransferStatus;
        const changed = await settleTransfer(transaction, status, transferCode);
        if (changed) {
          if (status === 'SUCCESS') result.succeeded++;
          if (status === 'FAILED') result.failed++;
          if (status === 'REVERSED') result.reversed++;
        }
        continue;
      }

      await releaseClaim(
        transaction.id,
        providerStatus && providerStatus !== 'pending'
          ? `Unsupported provider status: ${providerStatus}`
          : undefined
      );
      result.pending++;
    } catch (error) {
      await releaseClaim(transaction.id, errorMessage(error));
      result.errors++;
    }
  }

  return result;
}
