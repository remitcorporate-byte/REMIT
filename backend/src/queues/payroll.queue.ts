import { processPayroll } from '../jobs/process-payroll.job';

type PayrollJobData = {
  payrollId: string;
  companyId: string;
};

const activeJobs = new Set<string>();

class InProcessPayrollQueue {
  async add(jobName: string, data: PayrollJobData, options?: { jobId?: string }) {
    const jobId = options?.jobId || `${jobName}-${data.payrollId}-${Date.now()}`;

    if (activeJobs.has(jobId)) {
      console.log(`[PayrollQueue] Job ${jobId} already queued`);
      return { id: jobId };
    }

    activeJobs.add(jobId);
    setTimeout(async () => {
      try {
        if (jobName !== 'process-payroll') {
          console.warn(`[PayrollQueue] Unknown job name: ${jobName}`);
          return;
        }
        await processPayroll(data);
      } catch (error) {
        console.error(`[PayrollQueue] Job ${jobId} failed:`, error);
      } finally {
        activeJobs.delete(jobId);
      }
    }, 100);

    return { id: jobId };
  }
}

export const payrollQueue = new InProcessPayrollQueue();
export const payrollWorker = null;
export const payrollQueueEvents = null;
