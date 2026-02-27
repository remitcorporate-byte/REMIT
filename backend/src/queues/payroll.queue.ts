import { Queue, Worker, QueueEvents } from 'bullmq';
import { processPayroll } from '../jobs/process-payroll.job';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const useMock = process.env.USE_REDIS_MOCK === 'true';

// Mock Implementation for local development without Redis
class QueueMock {
  private processor: ((data: any) => Promise<void>) | null = null;
  constructor(public name: string) { }

  setProcessor(handler: (data: any) => Promise<void>) {
    this.processor = handler;
  }

  async add(jobName: string, data: any) {
    console.log(`[QueueMock:${this.name}] Adding job ${jobName}:`, data);
    if (this.processor) {
      // Execute immediately in mock mode
      setTimeout(() => {
        this.processor!({ name: jobName, data }).catch(err =>
          console.error(`[QueueMock:${this.name}] Job failed:`, err)
        );
      }, 100);
    }
    return { id: `mock-${Date.now()}` };
  }
}

class WorkerMock {
  constructor(public name: string, handler: (job: any) => Promise<void>, options: any) {
    console.log(`[WorkerMock:${this.name}] Started in-memory worker`);
    if (payrollQueue instanceof QueueMock) {
      payrollQueue.setProcessor(handler);
    }
  }
  on(event: string, callback: (...args: any[]) => void) {
    // No-op for mock
  }
}

class QueueEventsMock {
  constructor(public name: string) { }
}

export const payrollQueue = useMock
  ? (new QueueMock('payroll') as unknown as Queue)
  : new Queue('payroll', { connection });

const workerHandler = async (job: any) => {
  console.log(`[PayrollWorker] Processing job ${job.id}: ${job.name}`);

  switch (job.name) {
    case 'process-payroll':
      await processPayroll(job.data);
      break;
    default:
      console.warn(`[PayrollWorker] Unknown job name: ${job.name}`);
  }
};

export const payrollWorker = useMock
  ? (new WorkerMock('payroll', workerHandler, {}) as unknown as Worker)
  : new Worker(
    'payroll',
    workerHandler,
    {
      connection,
      concurrency: 1,
    }
  );

export const payrollQueueEvents = useMock
  ? (new QueueEventsMock('payroll') as unknown as QueueEvents)
  : new QueueEvents('payroll', { connection });
