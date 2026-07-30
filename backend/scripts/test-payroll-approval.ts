import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('Starting payroll approval-control tests...');

  const timestamp = Date.now();
  const ownerEmail = `approval_owner_${timestamp}@example.com`;
  const financeEmail = `approval_finance_${timestamp}@example.com`;
  const financePassword = 'Finance-Test-123!';

  const registration = await axios.post(`${BASE_URL}/auth/register`, {
    email: ownerEmail,
    password: 'Owner-Test-123!',
    firstName: 'Approval',
    lastName: 'Owner',
    companyName: `Approval Test ${timestamp}`,
  });
  const ownerToken = registration.data.data.token;
  const ownerAuth = {
    headers: { Authorization: `Bearer ${ownerToken}` },
  };

  const deposit = await axios.post(
    `${BASE_URL}/wallet/deposit`,
    { amount: 500_000 },
    ownerAuth
  );
  await axios.get(
    `${BASE_URL}/wallet/verify/${deposit.data.data.reference}`,
    ownerAuth
  );

  const employee = await axios.post(
    `${BASE_URL}/employees`,
    {
      firstName: 'Controlled',
      lastName: 'Employee',
      email: `controlled_${timestamp}@example.com`,
      bankName: 'GTBank',
      bankCode: '058',
      accountNumber: '0123456789',
      salary: 100_000,
      paymentFrequency: 'MONTHLY',
    },
    ownerAuth
  );

  await axios.post(
    `${BASE_URL}/team/invite`,
    {
      email: financeEmail,
      firstName: 'Finance',
      lastName: 'Approver',
      role: 'FINANCE',
      password: financePassword,
    },
    ownerAuth
  );

  const directSchedule = await axios.post(
    `${BASE_URL}/payrolls/schedule`,
    {
      scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
      employeeIds: [employee.data.data.id],
      note: 'This path must not auto-approve',
    },
    {
      ...ownerAuth,
      validateStatus: () => true,
    }
  );
  assert(
    directSchedule.status === 410,
    `Direct schedule endpoint should return 410; received ${directSchedule.status}`
  );

  const draft = await axios.post(
    `${BASE_URL}/payrolls/drafts`,
    {
      scheduledDate: new Date(Date.now() + 86_400_000).toISOString(),
      employeeIds: [employee.data.data.id],
      note: 'Controlled approval test',
    },
    ownerAuth
  );
  const payrollId = draft.data.data.id;

  await axios.put(
    `${BASE_URL}/payrolls/${payrollId}/submit`,
    undefined,
    ownerAuth
  );

  const ownerApproval = await axios.put(
    `${BASE_URL}/payrolls/${payrollId}/approve`,
    undefined,
    {
      ...ownerAuth,
      validateStatus: () => true,
    }
  );
  assert(
    ownerApproval.status === 400,
    `Payroll creator should not self-approve when another approver exists; received ${ownerApproval.status}`
  );

  const financeLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: financeEmail,
    password: financePassword,
  });
  const financeUser = financeLogin.data.data.user;
  const financeAuth = {
    headers: {
      Authorization: `Bearer ${financeLogin.data.data.token}`,
    },
  };

  const approval = await axios.put(
    `${BASE_URL}/payrolls/${payrollId}/approve`,
    undefined,
    financeAuth
  );
  assert(
    approval.data.data.status === 'SCHEDULED',
    'Finance approval should schedule the payroll'
  );
  assert(
    approval.data.data.approvedBy?.id === financeUser.id,
    'Payroll should record the independent finance approver'
  );

  const reservedWallet = await axios.get(`${BASE_URL}/wallet`, ownerAuth);
  assert(
    reservedWallet.data.data.reservedBalance === 100_000,
    'Approved payroll should reserve its exact amount'
  );

  await axios.put(
    `${BASE_URL}/payrolls/${payrollId}/cancel`,
    undefined,
    financeAuth
  );
  const releasedWallet = await axios.get(`${BASE_URL}/wallet`, ownerAuth);
  assert(
    releasedWallet.data.data.reservedBalance === 0,
    'Cancelling the scheduled payroll should release its reservation'
  );

  console.log('Payroll approval-control tests passed.');
}

main().catch((error) => {
  console.error(
    'Payroll approval-control test failed:',
    error.response?.data || error.message
  );
  process.exit(1);
});
