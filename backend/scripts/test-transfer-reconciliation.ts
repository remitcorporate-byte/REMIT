import { prisma } from '../src/lib/prisma';
import axios from 'axios';
import { TransactionStatus } from '@prisma/client';
import { reconcilePendingTransfers } from '../src/jobs/transfer-reconciliation.job';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('Starting transfer reconciliation tests...');
  process.env.TRANSFER_RECONCILIATION_MIN_AGE_MS = '0';
  process.env.TRANSFER_RECONCILIATION_INTERVAL_MS = '60000';

  const timestamp = Date.now();
  const ownerEmail = `reconciliation_owner_${timestamp}@example.com`;
  const registration = await axios.post(`${BASE_URL}/auth/register`, {
    email: ownerEmail,
    password: 'Owner-Test-123!',
    firstName: 'Reconciliation',
    lastName: 'Owner',
    companyName: `Reconciliation Test ${timestamp}`,
  });
  const ownerAuth = {
    headers: { Authorization: `Bearer ${registration.data.data.token}` },
  };

  const owner = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { companyId: true },
  });
  assert(owner?.companyId, 'Registered owner should belong to a company');
  const companyId = owner.companyId;

  const deposit = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: 500_000 },
    ownerAuth
  );
  await axios.get(
    `${BASE_URL}/wallet/verify/${deposit.data.data.reference}`,
    ownerAuth
  );

  const employee = await axios.post(
    `${BASE_URL}/employees`,
    {
      firstName: 'Reconciled',
      lastName: 'Employee',
      email: `reconciled_employee_${timestamp}@example.com`,
      bankName: 'GTBank',
      bankCode: '058',
      accountNumber: '0123456789',
      salary: 100_000,
      paymentFrequency: 'MONTHLY',
    },
    ownerAuth
  );
  const employeeId = employee.data.data.id as string;

  async function createDispatchedPayroll(providerStatus: string) {
    const draft = await axios.post(
      `${BASE_URL}/payrolls/drafts`,
      {
        scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
        employeeIds: [employeeId],
        note: `Reconciliation ${providerStatus}`,
      },
      ownerAuth
    );
    const payrollId = draft.data.data.id as string;
    await axios.put(`${BASE_URL}/payrolls/${payrollId}/submit`, undefined, ownerAuth);
    await axios.put(`${BASE_URL}/payrolls/${payrollId}/approve`, undefined, ownerAuth);

    const reference = `PAY_mock_${providerStatus}_${timestamp}`;
    const transaction = await prisma.$transaction(async (tx) => {
      const payrollEmployee = await tx.payrollEmployee.findFirstOrThrow({
        where: { payrollId },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { companyId } });
      const oldTime = new Date(Date.now() - 5 * 60_000);

      await tx.payroll.update({
        where: { id: payrollId },
        data: {
          status: 'FAILED',
          processedDate: oldTime,
          processingStartedAt: oldTime,
          processingHeartbeatAt: null,
          reservationReleasedAt: oldTime,
          processingAttempt: { increment: 1 },
          failureReason: 'Awaiting provider reconciliation',
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: payrollEmployee.amount },
          reservedBalance: { decrement: payrollEmployee.amount },
        },
      });
      return tx.transaction.create({
        data: {
          companyId,
          walletId: wallet.id,
          employeeId,
          payrollEmployeeId: payrollEmployee.id,
          type: 'PAYROLL_DEBIT',
          amount: payrollEmployee.amount,
          status: 'PENDING',
          description: `Transfer awaiting ${providerStatus} reconciliation`,
          paystackReference: reference,
          createdAt: oldTime,
        },
      });
    });

    return { payrollId, transactionId: transaction.id, reference };
  }

  const success = await createDispatchedPayroll('success');
  const failed = await createDispatchedPayroll('failed');
  const reversed = await createDispatchedPayroll('reversed');
  const pending = await createDispatchedPayroll('pending');
  const mismatch = await createDispatchedPayroll('mismatch');
  const reconciliationScope = {
    companyId,
    transactionIds: [
      success.transactionId,
      failed.transactionId,
      reversed.transactionId,
      pending.transactionId,
      mismatch.transactionId,
    ],
  };

  const blockedRetry = await axios.put(
    `${BASE_URL}/payrolls/${pending.payrollId}/retry`,
    undefined,
    {
      ...ownerAuth,
      validateStatus: () => true,
    }
  );
  assert(
    blockedRetry.status === 409,
    `Unresolved transfer retry should return 409; received ${blockedRetry.status}`
  );

  const runs = await Promise.all([
    reconcilePendingTransfers(reconciliationScope),
    reconcilePendingTransfers(reconciliationScope),
    reconcilePendingTransfers(reconciliationScope),
  ]);
  const totals = runs.reduce(
    (sum, run) => ({
      succeeded: sum.succeeded + run.succeeded,
      failed: sum.failed + run.failed,
      reversed: sum.reversed + run.reversed,
      pending: sum.pending + run.pending,
      errors: sum.errors + run.errors,
    }),
    { succeeded: 0, failed: 0, reversed: 0, pending: 0, errors: 0 }
  );

  assert(totals.succeeded === 1, `Expected one success settlement; got ${totals.succeeded}`);
  assert(totals.failed === 1, `Expected one failed settlement; got ${totals.failed}`);
  assert(totals.reversed === 1, `Expected one reversed settlement; got ${totals.reversed}`);
  assert(totals.pending === 1, `Expected one pending result; got ${totals.pending}`);
  assert(totals.errors === 1, `Expected one rejected mismatch; got ${totals.errors}`);

  const expectedStatuses: Array<{
    transactionId: string;
    status: TransactionStatus;
  }> = [
    { transactionId: success.transactionId, status: 'SUCCESS' },
    { transactionId: failed.transactionId, status: 'FAILED' },
    { transactionId: reversed.transactionId, status: 'REVERSED' },
    { transactionId: pending.transactionId, status: 'PENDING' },
    { transactionId: mismatch.transactionId, status: 'PENDING' },
  ];

  for (const expected of expectedStatuses) {
    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: expected.transactionId },
      include: { payrollEmployee: true },
    });
    assert(
      transaction.status === expected.status,
      `${expected.transactionId} should be ${expected.status}; got ${transaction.status}`
    );
    assert(
      transaction.payrollEmployee?.status === expected.status,
      `Payroll employee should be ${expected.status}`
    );
    assert(
      transaction.reconciliationAttempt === 1,
      `Concurrent reconcilers should claim ${expected.transactionId} once`
    );
    assert(
      transaction.reconciliationStartedAt === null,
      `Reconciliation claim should be released for ${expected.transactionId}`
    );
  }

  const mismatchTransaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: mismatch.transactionId },
  });
  assert(
    mismatchTransaction.reconciliationError?.includes('amount mismatch'),
    'Provider amount mismatch should be retained for operator diagnosis'
  );

  for (const outcome of [failed, reversed]) {
    const refundCount = await prisma.transaction.count({
      where: {
        companyId,
        type: 'REFUND',
        description: { contains: outcome.reference },
      },
    });
    assert(refundCount === 1, `${outcome.reference} produced ${refundCount} refunds`);
  }

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { companyId } });
  assert(
    wallet.balance === 200_000,
    `Wallet should contain 200000 after two exact refunds; got ${wallet.balance}`
  );
  assert(wallet.reservedBalance === 0, 'All reconciliation reservations should be released');

  const completedPayroll = await prisma.payroll.findUniqueOrThrow({
    where: { id: success.payrollId },
  });
  assert(completedPayroll.status === 'COMPLETED', 'Successful reconciliation should complete payroll');

  console.log('Transfer reconciliation tests passed.');
}

main()
  .catch((error: unknown) => {
    const detail =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error(
      'Transfer reconciliation test failed:',
      detail || (error instanceof Error ? error.message : error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
