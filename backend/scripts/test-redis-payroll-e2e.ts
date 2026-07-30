import axios from 'axios';
import { Queue } from 'bullmq';
import {
  createProducerRedisConnection,
  payrollQueueName,
} from '../src/config/redis';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5002/api/v1';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const timestamp = Date.now();
  const registration = await axios.post(`${BASE_URL}/auth/register`, {
    email: `redis_payroll_${timestamp}@example.com`,
    password: 'Redis-Test-123!',
    firstName: 'Redis',
    lastName: 'Worker',
    companyName: `Redis Payroll ${timestamp}`,
  });
  const auth = {
    headers: {
      Authorization: `Bearer ${registration.data.data.token}`,
    },
  };

  const deposit = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: 500_000 },
    auth
  );
  await axios.get(
    `${BASE_URL}/wallet/verify/${deposit.data.data.reference}`,
    auth
  );

  const employee = await axios.post(
    `${BASE_URL}/employees`,
    {
      firstName: 'Queued',
      lastName: 'Employee',
      email: `redis_employee_${timestamp}@example.com`,
      bankName: 'GTBank',
      bankCode: '058',
      accountNumber: '0123456789',
      salary: 100_000,
      paymentFrequency: 'MONTHLY',
    },
    auth
  );

  const draft = await axios.post(
    `${BASE_URL}/payrolls/drafts`,
    {
      scheduledDate: new Date(Date.now() - 60_000).toISOString(),
      employeeIds: [employee.data.data.id],
      note: 'Redis worker end-to-end test',
    },
    auth
  );
  const payrollId = draft.data.data.id as string;
  await axios.put(`${BASE_URL}/payrolls/${payrollId}/submit`, undefined, auth);
  await axios.put(`${BASE_URL}/payrolls/${payrollId}/approve`, undefined, auth);

  let payrollStatus = '';
  for (let attempt = 1; attempt <= 60; attempt++) {
    const payroll = await axios.get(`${BASE_URL}/payrolls/${payrollId}`, auth);
    payrollStatus = payroll.data.data.status;
    if (payrollStatus === 'COMPLETED') break;
    if (payrollStatus === 'FAILED') {
      throw new Error(
        `Redis payroll failed: ${payroll.data.data.failureReason || 'unknown reason'}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(
    payrollStatus === 'COMPLETED',
    `Redis payroll did not complete; final status was ${payrollStatus}`
  );

  const wallet = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    wallet.data.data.balance === 400_000,
    `Expected one 100000 debit; wallet was ${wallet.data.data.balance}`
  );
  assert(
    wallet.data.data.reservedBalance === 0,
    'Redis payroll reservation should be released'
  );

  const transactions = await axios.get(
    `${BASE_URL}/transactions?limit=100`,
    auth
  );
  const payrollDebits = transactions.data.data.filter(
    (transaction: { type: string; status: string }) =>
      transaction.type === 'PAYROLL_DEBIT' && transaction.status === 'SUCCESS'
  );
  assert(
    payrollDebits.length === 1,
    `Expected one successful payroll debit; found ${payrollDebits.length}`
  );

  console.log('Redis payroll end-to-end test passed.');
}

async function cleanupQueue() {
  if (!process.env.REDIS_URL) return;
  const connection = createProducerRedisConnection();
  const queue = new Queue(payrollQueueName, { connection });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

main()
  .catch((error) => {
    console.error(
      'Redis payroll end-to-end test failed:',
      error.response?.data || error.message
    );
    process.exitCode = 1;
  })
  .finally(cleanupQueue);
