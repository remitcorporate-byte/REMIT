import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';
const WEBHOOK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_local_only';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sendWebhook(
  payload: Record<string, unknown>,
  signatureOverride?: string
) {
  const rawBody = JSON.stringify(payload);
  const signature = signatureOverride || crypto
    .createHmac('sha512', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return axios.post(`${BASE_URL}/webhooks/paystack`, rawBody, {
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
    },
    transformRequest: [(value) => value],
    validateStatus: () => true,
  });
}

async function main() {
  console.log('Starting webhook idempotency tests...');

  const email = `webhook_${Date.now()}@example.com`;
  const registration = await axios.post(`${BASE_URL}/auth/register`, {
    email,
    password: 'password123',
    firstName: 'Webhook',
    lastName: 'Tester',
    companyName: `Webhook Test ${Date.now()}`,
  });
  const token = registration.data.data.token;
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const firstAmount = 250_000;
  const firstDeposit = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: firstAmount },
    auth
  );
  const firstReference = firstDeposit.data.data.reference;
  const firstEvent = {
    event: 'charge.success',
    data: {
      reference: firstReference,
      amount: firstAmount,
      currency: 'NGN',
    },
  };

  const concurrentResponses = await Promise.all(
    Array.from({ length: 5 }, () => sendWebhook(firstEvent))
  );
  assert(
    concurrentResponses.every((response) => response.status === 200),
    'Concurrent valid webhooks should all be acknowledged'
  );

  const walletAfterDuplicates = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    walletAfterDuplicates.data.data.balance === firstAmount,
    `Duplicate webhooks credited ${walletAfterDuplicates.data.data.balance}; expected ${firstAmount}`
  );

  const repeatedResponse = await sendWebhook(firstEvent);
  assert(repeatedResponse.status === 200, 'Repeated completed webhook should return 200');

  const walletAfterRepeat = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    walletAfterRepeat.data.data.balance === firstAmount,
    'Repeated completed webhook changed the wallet balance'
  );

  const secondAmount = 350_000;
  const secondDeposit = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: secondAmount },
    auth
  );
  const secondReference = secondDeposit.data.data.reference;

  const mismatchResponse = await sendWebhook({
    event: 'charge.success',
    data: {
      reference: secondReference,
      amount: secondAmount + 1,
      currency: 'NGN',
    },
  });
  assert(
    mismatchResponse.status === 500,
    `Amount mismatch should return 500 for retry/inspection; received ${mismatchResponse.status}`
  );

  const walletAfterMismatch = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    walletAfterMismatch.data.data.balance === firstAmount,
    'Amount-mismatched webhook changed the wallet balance'
  );

  const correctedResponse = await sendWebhook({
    event: 'charge.success',
    data: {
      reference: secondReference,
      amount: secondAmount,
      currency: 'NGN',
    },
  });
  assert(correctedResponse.status === 200, 'Corrected webhook should succeed');

  const finalWallet = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    finalWallet.data.data.balance === firstAmount + secondAmount,
    `Final wallet balance ${finalWallet.data.data.balance} is incorrect`
  );

  const thirdAmount = 125_000;
  const thirdDeposit = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: thirdAmount },
    auth
  );
  const thirdReference = thirdDeposit.data.data.reference;
  const concurrentVerifications = await Promise.all(
    Array.from({ length: 5 }, () =>
      axios.get(`${BASE_URL}/wallet/verify/${thirdReference}`, auth)
    )
  );
  assert(
    concurrentVerifications.every(
      (response) =>
        response.status === 200 &&
        Number.isSafeInteger(response.data.data.newBalance)
    ),
    'Concurrent verification responses should include a valid wallet balance'
  );

  const balanceAfterVerification = firstAmount + secondAmount + thirdAmount;
  const walletAfterVerification = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    walletAfterVerification.data.data.balance === balanceAfterVerification,
    'Concurrent verification credited the wallet more than once'
  );

  const invalidAmountResponse = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: '10000' },
    {
      ...auth,
      validateStatus: () => true,
    }
  );
  assert(
    invalidAmountResponse.status === 400,
    'String deposit amounts should be rejected'
  );

  const employee = await axios.post(
    `${BASE_URL}/employees`,
    {
      firstName: 'Ada',
      lastName: 'Webhook',
      email: `ada_${Date.now()}@example.com`,
      phone: '08000000000',
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
      scheduledDate: new Date(Date.now() - 1_000).toISOString(),
      employeeIds: [employee.data.data.id],
      note: 'Local webhook reversal test',
    },
    auth
  );
  const payrollId = draft.data.data.id;

  await axios.put(`${BASE_URL}/payrolls/${payrollId}/submit`, undefined, auth);
  await axios.put(`${BASE_URL}/payrolls/${payrollId}/approve`, undefined, auth);

  let payroll: any = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await axios.get(`${BASE_URL}/payrolls/${payrollId}`, auth);
    payroll = response.data.data;
    if (['COMPLETED', 'FAILED'].includes(payroll.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  assert(payroll?.status === 'COMPLETED', 'Mock payroll should complete');
  const payrollRow = payroll.payrollEmployees?.[0];
  assert(
    payrollRow?.transaction?.paystackReference &&
      payrollRow?.transaction?.paystackTransferId,
    'Completed payroll should contain provider transfer identifiers'
  );

  const balanceAfterPayroll = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    balanceAfterPayroll.data.data.balance ===
      balanceAfterVerification - payrollRow.amount,
    'Payroll did not debit the expected wallet amount'
  );

  const reversalEvent = {
    event: 'transfer.reversed',
    data: {
      reference: payrollRow.transaction.paystackReference,
      transfer_code: payrollRow.transaction.paystackTransferId,
    },
  };
  const reversalResponses = await Promise.all(
    Array.from({ length: 5 }, () => sendWebhook(reversalEvent))
  );
  assert(
    reversalResponses.every((response) => response.status === 200),
    'Concurrent transfer reversals should be acknowledged'
  );

  const walletAfterReversal = await axios.get(`${BASE_URL}/wallet`, auth);
  assert(
    walletAfterReversal.data.data.balance === balanceAfterVerification,
    'Concurrent transfer reversals refunded the wallet more than once'
  );

  const reversedPayroll = await axios.get(
    `${BASE_URL}/payrolls/${payrollId}`,
    auth
  );
  assert(
    reversedPayroll.data.data.status === 'FAILED' &&
      reversedPayroll.data.data.payrollEmployees?.[0]?.status === 'REVERSED',
    'Reversed transfer should mark the payroll and employee row as failed/reversed'
  );

  const transactions = await axios.get(
    `${BASE_URL}/transactions?limit=100`,
    auth
  );
  const refunds = transactions.data.data.filter(
    (transaction: { type: string }) => transaction.type === 'REFUND'
  );
  assert(refunds.length === 1, 'Duplicate reversals should create one refund');

  const invalidSignature = await sendWebhook(firstEvent, '00');
  assert(invalidSignature.status === 400, 'Invalid signature should return 400');

  console.log('Webhook idempotency tests passed.');
}

main().catch((error) => {
  console.error(
    'Webhook idempotency test failed:',
    error.response?.data || error.message
  );
  process.exit(1);
});
