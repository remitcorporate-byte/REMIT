import IORedis from 'ioredis';

export type PayrollQueueMode = 'redis' | 'in-process';

export const payrollQueueMode: PayrollQueueMode =
  process.env.PAYROLL_QUEUE_MODE === 'in-process'
    ? 'in-process'
    : process.env.REDIS_URL || process.env.NODE_ENV === 'production'
      ? 'redis'
      : 'in-process';

export const payrollQueueName =
  process.env.PAYROLL_QUEUE_NAME || 'remit-payroll';

function redisUrl() {
  const value = process.env.REDIS_URL;
  if (!value) {
    throw new Error(
      'REDIS_URL is required when PAYROLL_QUEUE_MODE is redis'
    );
  }
  return value;
}

export function createProducerRedisConnection() {
  return new IORedis(redisUrl(), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 10_000),
    lazyConnect: true,
  });
}

export function createWorkerRedisConnection() {
  return new IORedis(redisUrl(), {
    maxRetriesPerRequest: null,
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 10_000),
  });
}

export function redisEndpoint() {
  if (!process.env.REDIS_URL) return null;
  try {
    const parsed = new URL(process.env.REDIS_URL);
    return `${parsed.hostname}:${parsed.port || '6379'}`;
  } catch {
    return 'configured';
  }
}
