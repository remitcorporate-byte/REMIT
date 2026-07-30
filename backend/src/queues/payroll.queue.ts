import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  createProducerRedisConnection,
  payrollQueueMode,
  payrollQueueName,
} from '../config/redis';
import { processPayroll } from '../jobs/process-payroll.job';

export type PayrollJobData = {
  payrollId: string;
  companyId: string;
};

type AddOptions = {
  jobId?: string;
};

type QueueHealth = {
  mode: typeof payrollQueueMode;
  connected: boolean;
  waiting?: number;
  active?: number;
  failed?: number;
};

const activeJobs = new Set<string>();
let redisConnection: IORedis | null = null;
let redisQueue: Queue<PayrollJobData> | null = null;

function getRedisQueue() {
  if (!redisQueue) {
    redisConnection = createProducerRedisConnection();
    redisConnection.on('error', (error) => {
      console.error('[PayrollQueue] Redis connection error:', error.message);
    });
    redisQueue = new Queue<PayrollJobData>(payrollQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: Number(process.env.PAYROLL_JOB_ATTEMPTS || 5),
        backoff: {
          type: 'exponential',
          delay: Number(process.env.PAYROLL_JOB_BACKOFF_MS || 5_000),
        },
        removeOnComplete: {
          age: Number(process.env.PAYROLL_COMPLETED_JOB_MAX_AGE_SECONDS || 86_400),
          count: Number(process.env.PAYROLL_COMPLETED_JOB_MAX_COUNT || 1_000),
        },
        removeOnFail: {
          age: Number(process.env.PAYROLL_FAILED_JOB_MAX_AGE_SECONDS || 604_800),
          count: Number(process.env.PAYROLL_FAILED_JOB_MAX_COUNT || 5_000),
        },
      },
    });
  }
  return redisQueue;
}

class PayrollQueue {
  readonly mode = payrollQueueMode;

  async add(jobName: string, data: PayrollJobData, options?: AddOptions) {
    if (this.mode === 'redis') {
      const job = await getRedisQueue().add(jobName, data, {
        jobId: options?.jobId,
      });
      return { id: job.id };
    }

    const jobId =
      options?.jobId || `${jobName}-${data.payrollId}-${Date.now()}`;
    if (activeJobs.has(jobId)) {
      console.log(`[PayrollQueue] Job ${jobId} already queued`);
      return { id: jobId };
    }

    activeJobs.add(jobId);
    setTimeout(async () => {
      try {
        if (jobName !== 'process-payroll') {
          throw new Error(`Unknown payroll job name: ${jobName}`);
        }
        await processPayroll(data);
      } catch (error) {
        console.error(`[PayrollQueue] In-process job ${jobId} failed:`, error);
      } finally {
        activeJobs.delete(jobId);
      }
    }, 100);

    return { id: jobId };
  }

  async health(): Promise<QueueHealth> {
    if (this.mode === 'in-process') {
      return {
        mode: this.mode,
        connected: true,
        waiting: activeJobs.size,
        active: activeJobs.size,
        failed: 0,
      };
    }

    try {
      const queue = getRedisQueue();
      await queue.waitUntilReady();
      const counts = await queue.getJobCounts('waiting', 'active', 'failed');
      return {
        mode: this.mode,
        connected: true,
        waiting: counts.waiting,
        active: counts.active,
        failed: counts.failed,
      };
    } catch (error) {
      console.error(
        '[PayrollQueue] Health check failed:',
        error instanceof Error ? error.message : error
      );
      return { mode: this.mode, connected: false };
    }
  }

  async close() {
    await redisQueue?.close();
    redisQueue = null;
    redisConnection?.disconnect();
    redisConnection = null;
  }
}

export const payrollQueue = new PayrollQueue();
