import axios from 'axios';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import { getPermissions, Permission } from '../src/auth/permissions';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';
const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('Starting role-permission tests...');
  const timestamp = Date.now();
  const password = 'Role-Test-123!';
  const ownerEmail = `role_owner_${timestamp}@example.com`;

  const registration = await axios.post(`${BASE_URL}/auth/register`, {
    email: ownerEmail,
    password,
    firstName: 'Role',
    lastName: 'Owner',
    companyName: `Role Matrix ${timestamp}`,
  });
  const ownerToken = registration.data.data.token as string;
  const ownerAuth = auth(ownerToken);
  const companyId = registration.data.data.user.companyId as string;

  const invitedRoles: Array<Exclude<Role, 'OWNER' | 'EMPLOYEE'>> = [
    'ADMIN',
    'FINANCE',
    'VIEWER',
  ];
  const credentials = new Map<Role, { email: string; token: string }>();
  credentials.set('OWNER', { email: ownerEmail, token: ownerToken });

  for (const role of invitedRoles) {
    const email = `role_${role.toLowerCase()}_${timestamp}@example.com`;
    await axios.post(
      `${BASE_URL}/team/invite`,
      {
        email,
        password,
        firstName: role,
        lastName: 'Tester',
        role,
      },
      ownerAuth
    );
    const login = await axios.post(`${BASE_URL}/auth/login`, { email, password });
    credentials.set(role, { email, token: login.data.data.token });
  }

  const employeeEmail = `role_employee_${timestamp}@example.com`;
  await prisma.user.create({
    data: {
      email: employeeEmail,
      password: await bcrypt.hash(password, 12),
      firstName: 'Employee',
      lastName: 'Tester',
      role: 'EMPLOYEE',
      companyId,
    },
  });
  const employeeLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: employeeEmail,
    password,
  });
  credentials.set('EMPLOYEE', {
    email: employeeEmail,
    token: employeeLogin.data.data.token,
  });

  for (const role of ['OWNER', 'ADMIN', 'FINANCE', 'VIEWER', 'EMPLOYEE'] as Role[]) {
    const credential = credentials.get(role);
    assert(credential, `Missing test credential for ${role}`);
    const me = await axios.get(`${BASE_URL}/auth/me`, auth(credential.token));
    const actual = [...(me.data.data.permissions as Permission[])].sort();
    const expected = [...getPermissions(role)].sort();
    assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      `${role} received the wrong effective permissions`
    );
  }

  const admin = credentials.get('ADMIN')!;
  const finance = credentials.get('FINANCE')!;
  const viewer = credentials.get('VIEWER')!;
  const employee = credentials.get('EMPLOYEE')!;

  await expectStatus('admin employee list', 'get', '/employees?limit=10', admin.token, 200);
  await expectStatus('admin wallet', 'get', '/wallet', admin.token, 200);
  await expectStatus('admin team management denied', 'post', '/team/invite', admin.token, 403, {});

  await expectStatus('finance employee list', 'get', '/employees?limit=10', finance.token, 200);
  await expectStatus('finance employee write denied', 'post', '/employees', finance.token, 403, {});
  await expectStatus('finance wallet', 'get', '/wallet', finance.token, 200);
  await expectStatus('finance company write denied', 'put', '/company', finance.token, 403, {});
  await expectStatus('finance audit denied', 'get', '/company/audit-log', finance.token, 403);

  await expectStatus('viewer employee list', 'get', '/employees?limit=10', viewer.token, 200);
  await expectStatus('viewer employee write denied', 'post', '/employees', viewer.token, 403, {});
  await expectStatus('viewer payroll list', 'get', '/payrolls?limit=10', viewer.token, 200);
  await expectStatus('viewer wallet denied', 'get', '/wallet', viewer.token, 403);
  await expectStatus('viewer company write denied', 'put', '/company', viewer.token, 403, {});

  await expectStatus('employee alerts', 'get', '/notifications?limit=10', employee.token, 200);
  await expectStatus('employee dashboard denied', 'get', '/company/dashboard', employee.token, 403);
  await expectStatus('employee team denied', 'get', '/team', employee.token, 403);
  await expectStatus('employee payroll denied', 'get', '/payrolls?limit=10', employee.token, 403);

  console.log('Role-permission tests passed.');
}

function auth(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function expectStatus(
  label: string,
  method: 'get' | 'post' | 'put',
  path: string,
  token: string,
  expectedStatus: number,
  data?: unknown
) {
  const response = await axios.request({
    method,
    url: `${BASE_URL}${path}`,
    headers: auth(token).headers,
    data,
    validateStatus: () => true,
  });
  assert(
    response.status === expectedStatus,
    `${label} expected HTTP ${expectedStatus}; received ${response.status}`
  );
}

main()
  .catch((error: unknown) => {
    const detail =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error(
      'Role-permission test failed:',
      detail || (error instanceof Error ? error.message : error)
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
