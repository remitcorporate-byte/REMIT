import { Queue, Worker } from 'bullmq';
import {
  createProducerRedisConnection,
  createWorkerRedisConnection,
  redisEndpoint,
} from '../src/config/redis';

async function main() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required');
  }

  const queueName = `remit-connectivity-${Date.now()}`;
  const producerConnection = createProducerRedisConnection();
  const workerConnection = createWorkerRedisConnection();
  const queue = new Queue<{ probe: string }>(queueName, {
    connection: producerConnection,
  });
  const worker = new Worker<{ probe: string }, string>(
    queueName,
    async (job) => {
      if (job.name !== 'connectivity-check' || job.data.probe !== 'ping') {
        throw new Error('Unexpected connectivity test payload');
      }
      return 'pong';
    },
    { connection: workerConnection }
  );

  try {
    await Promise.all([queue.waitUntilReady(), worker.waitUntilReady()]);

    const completed = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Redis worker did not complete the test job in time')),
        20_000
      );
      worker.once('completed', (_job, result) => {
        clearTimeout(timeout);
        resolve(result);
      });
      worker.once('failed', (_job, error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    await queue.add(
      'connectivity-check',
      { probe: 'ping' },
      { removeOnComplete: true, removeOnFail: true }
    );
    const result = await completed;
    if (result !== 'pong') throw new Error(`Unexpected worker result: ${result}`);

    console.log(`Redis BullMQ connectivity passed for ${redisEndpoint()}`);
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    producerConnection.disconnect();
    workerConnection.disconnect();
  }
}

main().catch((error) => {
  console.error(
    'Redis BullMQ connectivity failed:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
