import { PrismaClient } from '@prisma/client';
import { payrollQueue } from '../queues/payroll.queue';

const prisma = new PrismaClient();
let schedulerStarted = false;

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

export function startPayrollScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = Number(process.env.PAYROLL_SCHEDULER_INTERVAL_MS || 60000);

  setInterval(() => {
    processDuePayrolls()
      .then((count) => {
        if (count > 0) console.log(`[PayrollScheduler] Queued ${count} due payrolls`);
      })
      .catch((error) => console.error('[PayrollScheduler] Error:', error));
  }, intervalMs);

  processDuePayrolls().catch((error) => console.error('[PayrollScheduler] Startup error:', error));
  console.log(`[PayrollScheduler] In-process scheduler started (${intervalMs}ms interval)`);
}
