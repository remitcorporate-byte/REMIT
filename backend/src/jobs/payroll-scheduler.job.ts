import { prisma } from '../lib/prisma';
import { payrollQueue } from '../queues/payroll.queue';
import { reconcilePendingTransfers } from './transfer-reconciliation.job';

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;

export async function recoverStalePayrolls() {
  const timeoutMs = Number(process.env.PAYROLL_PROCESSING_TIMEOUT_MS || 15 * 60 * 1000);
  const cutoff = new Date(Date.now() - timeoutMs);
  const stalePayrolls = await prisma.payroll.findMany({
    where: {
      status: 'PROCESSING',
      OR: [
        { processingHeartbeatAt: { lt: cutoff } },
        {
          processingHeartbeatAt: null,
          processingStartedAt: { lt: cutoff },
        },
      ],
    },
    select: {
      id: true,
      payrollEmployees: {
        where: { status: 'PENDING' },
        select: {
          id: true,
          transaction: {
            select: { id: true, status: true, paystackReference: true },
          },
        },
      },
    },
  });

  let requeued = 0;
  let reconciliationRequired = 0;

  for (const payroll of stalePayrolls) {
    const hasProviderTransaction = payroll.payrollEmployees.some(
      (row) => row.transaction !== null
    );

    if (!hasProviderTransaction) {
      const recovered = await prisma.payroll.updateMany({
        where: {
          id: payroll.id,
          status: 'PROCESSING',
          OR: [
            { processingHeartbeatAt: { lt: cutoff } },
            {
              processingHeartbeatAt: null,
              processingStartedAt: { lt: cutoff },
            },
          ],
        },
        data: {
          status: 'SCHEDULED',
          processingStartedAt: null,
          processingHeartbeatAt: null,
          failureReason: 'Recovered stale payroll before provider dispatch',
        },
      });
      requeued += recovered.count;
      continue;
    }

    const stopped = await prisma.payroll.updateMany({
      where: {
        id: payroll.id,
        status: 'PROCESSING',
        OR: [
          { processingHeartbeatAt: { lt: cutoff } },
          {
            processingHeartbeatAt: null,
            processingStartedAt: { lt: cutoff },
          },
        ],
      },
      data: {
        status: 'FAILED',
        processedDate: new Date(),
        processingHeartbeatAt: null,
        failureReason:
          'Processing heartbeat expired after provider dispatch; transfer reconciliation is required before retry',
      },
    });
    reconciliationRequired += stopped.count;
  }

  return {
    scanned: stalePayrolls.length,
    requeued,
    reconciliationRequired,
  };
}

export async function processDuePayrolls() {
  const duePayrolls = await prisma.payroll.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledDate: { lte: new Date() },
    },
    select: { id: true, companyId: true },
  });

  for (const payroll of duePayrolls) {
    await payrollQueue.add(
      'process-payroll',
      { payrollId: payroll.id, companyId: payroll.companyId },
      { jobId: payroll.id }
    );
  }

  return duePayrolls.length;
}

export async function runPayrollSchedulerCycle() {
  const reconciliation = await reconcilePendingTransfers();
  const recovery = await recoverStalePayrolls();
  const queued = await processDuePayrolls();
  return { ...recovery, queued, reconciliation };
}

export function startPayrollScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = Number(process.env.PAYROLL_SCHEDULER_INTERVAL_MS || 60000);

  schedulerTimer = setInterval(() => {
    runPayrollSchedulerCycle()
      .then((result) => {
        if (result.queued > 0) {
          console.log(`[PayrollScheduler] Queued ${result.queued} due payrolls`);
        }
        if (result.requeued > 0 || result.reconciliationRequired > 0) {
          console.warn(
            `[PayrollScheduler] Recovered ${result.requeued} stale payrolls; ` +
            `${result.reconciliationRequired} require reconciliation`
          );
        }
        if (
          result.reconciliation.succeeded > 0 ||
          result.reconciliation.failed > 0 ||
          result.reconciliation.reversed > 0 ||
          result.reconciliation.errors > 0
        ) {
          console.log(
            '[PayrollScheduler] Transfer reconciliation: ' +
            `${result.reconciliation.succeeded} succeeded, ` +
            `${result.reconciliation.failed} failed, ` +
            `${result.reconciliation.reversed} reversed, ` +
            `${result.reconciliation.pending} pending, ` +
            `${result.reconciliation.errors} errors`
          );
        }
      })
      .catch((error) => console.error('[PayrollScheduler] Error:', error));
  }, intervalMs);

  runPayrollSchedulerCycle().catch((error) => console.error('[PayrollScheduler] Startup error:', error));
  console.log(
    `[PayrollScheduler] Database-claimed ${payrollQueue.mode} scheduler started ` +
    `(${intervalMs}ms interval)`
  );
}

export function stopPayrollScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  schedulerStarted = false;
}
