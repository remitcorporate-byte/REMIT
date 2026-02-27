import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { payrollQueue } from '../queues/payroll.queue';
import { startOfDay, endOfDay } from '../utils/dateHelpers';

const prisma = new PrismaClient();

// Run every day at midnight
export function startPayrollScheduler() {
  cron.schedule('0 0 * * *', async () => {
    console.log('[PayrollScheduler] Running daily payroll check...');

    try {
      const today = new Date();

      // Find all scheduled payrolls due today or overdue
      const duePayrolls = await prisma.payroll.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledDate: {
            gte: startOfDay(today),
            lte: endOfDay(today),
          },
        },
      });

      console.log(
        `[PayrollScheduler] Found ${duePayrolls.length} payrolls to process`
      );

      for (const payroll of duePayrolls) {
        await payrollQueue.add('process-payroll', {
          payrollId: payroll.id,
          companyId: payroll.companyId,
        });
        console.log(
          `[PayrollScheduler] Queued payroll ${payroll.id} for processing`
        );
      }
    } catch (error) {
      console.error('[PayrollScheduler] Error:', error);
    }
  });

  console.log('[PayrollScheduler] Daily payroll scheduler started (runs at midnight)');
}
