import { prisma } from '../src/lib/prisma';
import axios from 'axios';
import { processPayroll } from '../src/jobs/process-payroll.job';
import { recoverStalePayrolls } from '../src/jobs/payroll-scheduler.job';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('Starting payroll worker durability tests...');

  const timestamp = Date.now();
  const ownerEmail = `durability_owner_${timestamp}@example.com`;
  const registration = await axios.post(`${BASE_URL}/auth/register`, {
    email: ownerEmail,
    password: 'Owner-Test-123!',
    firstName: 'Durability',
    lastName: 'Owner',
    companyName: `Durability Test ${timestamp}`,
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
      firstName: 'Durable',
      lastName: 'Worker',
      email: `durable_worker_${timestamp}@example.com`,
      bankName: 'GTBank',
      bankCode: '058',
      accountNumber: '0123456789',
      salary: 100_000,
      paymentFrequency: 'MONTHLY',
    },
    ownerAuth
  );
  const employeeId = employee.data.data.id as string;

  async function createApprovedPayroll(note: string) {
    const draft = await axios.post(
      `${BASE_URL}/payrolls/drafts`,
      {
        scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
        employeeIds: [employeeId],
        note,
      },
      ownerAuth
    );
    const payrollId = draft.data.data.id as string;

    await axios.put(`${BASE_URL}/payrolls/${payrollId}/submit`, undefined, ownerAuth);
    await axios.put(`${BASE_URL}/payrolls/${payrollId}/approve`, undefined, ownerAuth);

    return payrollId;
  }

  const concurrentPayrollId = await createApprovedPayroll('Concurrent claim test');
  await prisma.payroll.update({
    where: { id: concurrentPayrollId },
    data: { scheduledDate: new Date(Date.now() - 60_000) },
  });

  await Promise.all([
    processPayroll({ payrollId: concurrentPayrollId, companyId }),
    processPayroll({ payrollId: concurrentPayrollId, companyId }),
    processPayroll({ payrollId: concurrentPayrollId, companyId }),
  ]);

  const concurrentPayroll = await prisma.payroll.findUnique({
    where: { id: concurrentPayrollId },
    include: {
      payrollEmployees: {
        include: { transaction: true },
      },
    },
  });
  assert(concurrentPayroll?.status === 'COMPLETED', 'Claimed payroll should complete');
  assert(
    concurrentPayroll.processingAttempt === 1,
    `Concurrent jobs should produce one claim; got ${concurrentPayroll.processingAttempt}`
  );
  assert(
    concurrentPayroll.payrollEmployees[0]?.transaction?.status === 'SUCCESS',
    'The claimed employee transfer should complete once'
  );

  const concurrentDebits = await prisma.transaction.count({
    where: {
      companyId,
      type: 'PAYROLL_DEBIT',
      payrollEmployee: { payrollId: concurrentPayrollId },
    },
  });
  assert(concurrentDebits === 1, `Concurrent jobs created ${concurrentDebits} debits`);

  const preDispatchPayrollId = await createApprovedPayroll('Pre-dispatch recovery test');
  const oldHeartbeat = new Date(Date.now() - 20 * 60_000);
  await prisma.$transaction(async (tx) => {
    await tx.payroll.update({
      where: { id: preDispatchPayrollId },
      data: {
        status: 'PROCESSING',
        scheduledDate: new Date(Date.now() - 60_000),
        processingStartedAt: oldHeartbeat,
        processingHeartbeatAt: oldHeartbeat,
        reservationReleasedAt: oldHeartbeat,
        processingAttempt: { increment: 1 },
      },
    });
    await tx.wallet.update({
      where: { companyId },
      data: { reservedBalance: { decrement: 100_000 } },
    });
  });

  const preDispatchRecovery = await recoverStalePayrolls();
  assert(preDispatchRecovery.requeued === 1, 'Stale pre-dispatch payroll should be requeued');

  await processPayroll({ payrollId: preDispatchPayrollId, companyId });
  const recoveredPayroll = await prisma.payroll.findUnique({
    where: { id: preDispatchPayrollId },
  });
  assert(recoveredPayroll?.status === 'COMPLETED', 'Recovered payroll should complete');
  assert(
    recoveredPayroll.processingAttempt === 2,
    'Recovered payroll should record a second processing attempt'
  );

  const postDispatchPayrollId = await createApprovedPayroll('Post-dispatch recovery test');
  await prisma.$transaction(async (tx) => {
    const payrollEmployee = await tx.payrollEmployee.findFirstOrThrow({
      where: { payrollId: postDispatchPayrollId },
    });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { companyId } });

    await tx.payroll.update({
      where: { id: postDispatchPayrollId },
      data: {
        status: 'PROCESSING',
        scheduledDate: new Date(Date.now() - 60_000),
        processingStartedAt: oldHeartbeat,
        processingHeartbeatAt: oldHeartbeat,
        reservationReleasedAt: oldHeartbeat,
        processingAttempt: { increment: 1 },
      },
    });
    await tx.wallet.update({
      where: { companyId },
      data: {
        balance: { decrement: payrollEmployee.amount },
        reservedBalance: { decrement: payrollEmployee.amount },
      },
    });
    await tx.transaction.create({
      data: {
        companyId,
        walletId: wallet.id,
        employeeId,
        payrollEmployeeId: payrollEmployee.id,
        type: 'PAYROLL_DEBIT',
        amount: payrollEmployee.amount,
        status: 'PENDING',
        description: 'Simulated transfer dispatched before worker crash',
        paystackReference: `PAY_stale_${timestamp}`,
      },
    });
  });

  const postDispatchRecovery = await recoverStalePayrolls();
  assert(
    postDispatchRecovery.reconciliationRequired === 1,
    'Stale post-dispatch payroll should require reconciliation'
  );

  const stoppedPayroll = await prisma.payroll.findUnique({
    where: { id: postDispatchPayrollId },
    include: {
      payrollEmployees: {
        include: { transaction: true },
      },
    },
  });
  assert(stoppedPayroll?.status === 'FAILED', 'Ambiguous dispatched payroll should be stopped');
  assert(
    stoppedPayroll.failureReason?.includes('reconciliation is required'),
    'Stopped payroll should explain the reconciliation requirement'
  );
  assert(
    stoppedPayroll.payrollEmployees[0]?.transaction?.status === 'PENDING',
    'Recovery must preserve the pending provider transaction for reconciliation'
  );

  await processPayroll({ payrollId: postDispatchPayrollId, companyId });
  const postDispatchDebits = await prisma.transaction.count({
    where: {
      companyId,
      type: 'PAYROLL_DEBIT',
      payrollEmployee: { payrollId: postDispatchPayrollId },
    },
  });
  assert(postDispatchDebits === 1, 'Stopped payroll must not create a duplicate debit');

  const wallet = await prisma.wallet.findUnique({ where: { companyId } });
  assert(wallet?.reservedBalance === 0, 'All tested payroll reservations should be released once');
  assert(
    wallet?.balance === 200_000,
    `Wallet should be debited exactly three times; got ${wallet?.balance}`
  );

  console.log('Payroll worker durability tests passed.');
}

main()
  .catch((error: unknown) => {
    const detail =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error(
      'Payroll worker durability test failed:',
      detail || (error instanceof Error ? error.message : error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
