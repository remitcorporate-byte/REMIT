import { Worker } from 'bullmq';
import {
  createWorkerRedisConnection,
  payrollQueueMode,
  payrollQueueName,
  redisEndpoint,
} from '../config/redis';
import { processPayroll } from '../jobs/process-payroll.job';
import type { PayrollJobData } from '../queues/payroll.queue';

async function startPayrollWorker() {
  if (payrollQueueMode !== 'redis') {
    throw new Error(
      'The standalone payroll worker requires PAYROLL_QUEUE_MODE=redis and REDIS_URL'
    );
  }

  const connection = createWorkerRedisConnection();
  connection.on('error', (error) => {
    console.error('[PayrollWorker] Redis connection error:', error.message);
  });

  const worker = new Worker<PayrollJobData>(
    payrollQueueName,
    async (job) => {
      if (job.name !== 'process-payroll') {
        throw new Error(`Unknown payroll job name: ${job.name}`);
      }
      await processPayroll(job.data);
    },
    {
      connection,
      concurrency: Number(process.env.PAYROLL_WORKER_CONCURRENCY || 3),
    }
  );

  worker.on('completed', (job) => {
    console.log(`[PayrollWorker] Job ${job.id} completed`);
  });
  worker.on('failed', (job, error) => {
    console.error(
      `[PayrollWorker] Job ${job?.id || 'unknown'} failed ` +
      `(attempt ${job?.attemptsMade || 0}): ${error.message}`
    );
  });
  worker.on('error', (error) => {
    console.error('[PayrollWorker] Worker error:', error);
  });

  await worker.waitUntilReady();
  console.log(
    `[PayrollWorker] Listening on ${payrollQueueName} via ${redisEndpoint()}`
  );

  let closing = false;
  const close = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[PayrollWorker] ${signal} received, closing gracefully`);
    await worker.close();
    connection.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));
}

startPayrollWorker().catch((error) => {
  console.error('[PayrollWorker] Startup failed:', error);
  process.exit(1);
});
