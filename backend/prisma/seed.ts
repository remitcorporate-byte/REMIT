/**
 * Local demo data for REMIT.
 *
 *   pnpm db:seed           # seed an empty database
 *   pnpm db:seed --reset   # wipe ALL rows first (local databases only)
 *
 * Every demo user's password is DEMO_PASSWORD below.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PaymentFrequency, PrismaClient, Role } from '@prisma/client';
import { accountNumberLast4, encryptField } from '../src/utils/crypto';

const prisma = new PrismaClient();

export const DEMO_PASSWORD = 'RemitDemo2026';
const naira = (amount: number) => Math.round(amount * 100); // -> kobo

const dbUrl = process.env.DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(dbUrl)) {
  console.error('Refusing to seed: DATABASE_URL is not a local database.');
  process.exit(1);
}

const USERS: { key: string; firstName: string; lastName: string; email: string; role: Role }[] = [
  { key: 'owner', firstName: 'Adaeze', lastName: 'Okafor', email: 'owner@demo.remit.ng', role: 'OWNER' },
  { key: 'admin', firstName: 'Ibrahim', lastName: 'Bello', email: 'admin@demo.remit.ng', role: 'ADMIN' },
  { key: 'finance', firstName: 'Tunde', lastName: 'Adeyemi', email: 'finance@demo.remit.ng', role: 'FINANCE' },
  { key: 'viewer', firstName: 'Ngozi', lastName: 'Eze', email: 'viewer@demo.remit.ng', role: 'VIEWER' },
];

const BANKS = [
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Access Bank', code: '044' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'United Bank For Africa', code: '033' },
  { name: 'Kuda Bank', code: '50211' },
];

const EMPLOYEES: [string, string, string, string, number, PaymentFrequency?][] = [
  ['Chinedu', 'Nwosu', 'Engineering', 'Senior Backend Engineer', 950_000],
  ['Folake', 'Adebayo', 'Engineering', 'Frontend Engineer', 720_000],
  ['Emeka', 'Obi', 'Engineering', 'Mobile Engineer', 780_000],
  ['Aisha', 'Mohammed', 'Product', 'Product Manager', 880_000],
  ['Oluwaseun', 'Afolabi', 'Design', 'Product Designer', 650_000],
  ['Blessing', 'Udo', 'Operations', 'Operations Lead', 600_000],
  ['Kelechi', 'Ibe', 'Finance', 'Accountant', 520_000],
  ['Yetunde', 'Ogunleye', 'People', 'HR Generalist', 480_000],
  ['Musa', 'Abdullahi', 'Sales', 'Account Executive', 450_000],
  ['Chiamaka', 'Okeke', 'Support', 'Customer Success', 380_000],
  ['Segun', 'Oladipo', 'Operations', 'Logistics Officer', 90_000, 'WEEKLY'],
  ['Halima', 'Yusuf', 'Support', 'Support Associate', 160_000, 'BIWEEKLY'],
];

function monthsAgo(n: number, day = 25) {
  const d = new Date();
  d.setMonth(d.getMonth() - n, day);
  d.setHours(9, 0, 0, 0);
  return d;
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}
const ref = (prefix: string, i: number) => `${prefix}_seed_${Date.now().toString(36)}_${i}`;

async function reset() {
  // Children first. Local-only: guarded by the DATABASE_URL check above.
  await prisma.supportMessage.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.payrollEmployee.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.oneTimeCode.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.updateMany({ data: { companyId: null } });
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  if (process.argv.includes('--reset')) {
    console.log('Resetting local database...');
    await reset();
  } else if (await prisma.user.findUnique({ where: { email: USERS[0].email } })) {
    console.log('Demo data already present. Run `pnpm db:seed --reset` to recreate it.');
    return;
  }

  const password = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users: Record<string, { id: string }> = {};
  for (const u of USERS) {
    users[u.key] = await prisma.user.create({
      data: { firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, password },
    });
  }

  const company = await prisma.company.create({
    data: {
      name: 'Lagoon Logistics Ltd',
      email: 'hello@lagoonlogistics.ng',
      phone: '+234 803 555 0142',
      address: '14 Admiralty Way, Lekki Phase 1, Lagos',
      ownerId: users.owner.id,
    },
  });
  await prisma.user.updateMany({ where: { id: { in: Object.values(users).map((u) => u.id) } }, data: { companyId: company.id } });
  const wallet = await prisma.wallet.create({ data: { companyId: company.id } });

  const employees = [];
  for (const [i, [firstName, lastName, department, position, salary, frequency]] of EMPLOYEES.entries()) {
    const bank = BANKS[i % BANKS.length];
    const accountNumber = String(1000000000 + ((i + 1) * 73_519_211) % 8_999_999_999).slice(0, 10);
    employees.push(
      await prisma.employee.create({
        data: {
          companyId: company.id,
          firstName,
          lastName,
          email: `${firstName}.${lastName}@lagoonlogistics.ng`.toLowerCase(),
          phone: `+234 80${(i % 9) + 1} 555 ${String(1000 + i * 37).slice(-4)}`,
          bankName: bank.name,
          bankCode: bank.code,
          accountNumber: encryptField(accountNumber),
          accountNumberLast4: accountNumberLast4(accountNumber),
          accountName: `${firstName} ${lastName}`.toUpperCase(),
          salary: naira(salary),
          department,
          position,
          paymentFrequency: frequency ?? 'MONTHLY',
          nextPaymentDate: daysFromNow(frequency === 'WEEKLY' ? 4 : frequency === 'BIWEEKLY' ? 9 : 17),
          paystackRecipientCode: `RCP_seed_${i}`,
        },
      }),
    );
  }
  const monthly = employees.filter((e) => e.paymentFrequency === 'MONTHLY');

  let balance = 0;
  let txIndex = 0;

  // Deposits
  for (const [amount, when] of [[9_000_000, monthsAgo(3, 20)], [7_500_000, monthsAgo(2, 20)], [8_000_000, monthsAgo(1, 20)], [6_000_000, daysFromNow(-3)]] as const) {
    await prisma.transaction.create({
      data: {
        companyId: company.id, walletId: wallet.id, type: 'DEPOSIT', amount: naira(amount), status: 'SUCCESS',
        description: 'Wallet funding via Paystack', paystackReference: ref('DEP', txIndex++), createdAt: when,
      },
    });
    balance += naira(amount);
  }

  // Two completed monthly payrolls; the most recent has one failed transfer that was refunded.
  for (const [monthsBack, failIndex] of [[2, -1], [1, 3]] as const) {
    const date = monthsAgo(monthsBack);
    const total = monthly.reduce((s, e) => s + e.salary, 0);
    const payroll = await prisma.payroll.create({
      data: {
        companyId: company.id, createdById: users.finance.id, approvedById: users.owner.id,
        scheduledDate: date, submittedAt: date, approvedAt: date, processedDate: date,
        status: failIndex >= 0 ? 'FAILED' : 'COMPLETED', totalAmount: total, employeeCount: monthly.length,
        failureReason: failIndex >= 0 ? '1 employee transfers failed' : null,
        note: `${date.toLocaleString('en-NG', { month: 'long' })} salaries`, createdAt: date,
      },
    });
    for (const [i, e] of monthly.entries()) {
      const failed = i === failIndex;
      const pe = await prisma.payrollEmployee.create({
        data: { payrollId: payroll.id, employeeId: e.id, amount: e.salary, status: failed ? 'FAILED' : 'SUCCESS', createdAt: date },
      });
      await prisma.transaction.create({
        data: {
          companyId: company.id, walletId: wallet.id, employeeId: e.id, payrollEmployeeId: pe.id, type: 'PAYROLL_DEBIT',
          amount: e.salary, status: failed ? 'FAILED' : 'SUCCESS',
          description: `Payroll payment to ${e.firstName} ${e.lastName}`,
          paystackReference: `pay_${pe.id.replace(/-/g, '')}`.slice(0, 50), createdAt: date,
        },
      });
      if (failed) {
        await prisma.transaction.create({
          data: {
            companyId: company.id, walletId: wallet.id, employeeId: e.id, type: 'REFUND', amount: e.salary, status: 'SUCCESS',
            description: `Refund for rejected transfer to ${e.firstName} ${e.lastName}`, createdAt: date,
          },
        });
      } else {
        balance -= e.salary;
      }
    }
  }

  // Awaiting approval: created by Finance so Owner/Admin can approve it (no self-approval).
  const upcoming = daysFromNow(17);
  const pending = await prisma.payroll.create({
    data: {
      companyId: company.id, createdById: users.finance.id, scheduledDate: upcoming, submittedAt: new Date(),
      status: 'PENDING_APPROVAL', totalAmount: monthly.reduce((s, e) => s + e.salary, 0), employeeCount: monthly.length,
      note: `${upcoming.toLocaleString('en-NG', { month: 'long' })} salaries`,
    },
  });
  await prisma.payrollEmployee.createMany({ data: monthly.map((e) => ({ payrollId: pending.id, employeeId: e.id, amount: e.salary })) });

  // A draft for the weekly/biweekly staff.
  const casual = employees.filter((e) => e.paymentFrequency !== 'MONTHLY');
  const draft = await prisma.payroll.create({
    data: {
      companyId: company.id, createdById: users.finance.id, scheduledDate: daysFromNow(4), status: 'DRAFT',
      totalAmount: casual.reduce((s, e) => s + e.salary, 0), employeeCount: casual.length, note: 'Weekly & bi-weekly staff',
    },
  });
  await prisma.payrollEmployee.createMany({ data: casual.map((e) => ({ payrollId: draft.id, employeeId: e.id, amount: e.salary })) });

  await prisma.wallet.update({ where: { id: wallet.id }, data: { balance } });

  // Notifications for every team member.
  const notes = [
    { type: 'DEPOSIT_SUCCESS', title: 'Wallet funded', message: '₦6,000,000 was added to your wallet.', at: daysFromNow(-3), read: false },
    { type: 'PAYROLL_SCHEDULED', title: 'Payroll awaiting approval', message: `Tunde Adeyemi submitted ${pending.note} for approval.`, at: daysFromNow(-1), read: false },
    { type: 'PAYROLL_FAILED', title: 'Payroll finished with a failure', message: 'One salary transfer was rejected by the bank and refunded to your wallet.', at: monthsAgo(1), read: false },
    { type: 'EMPLOYEE_ADDED', title: 'New employee added', message: 'Halima Yusuf was added to Support.', at: monthsAgo(1, 10), read: true },
    { type: 'PAYROLL_COMPLETED', title: 'Payroll completed', message: `All ${monthly.length} employees were paid successfully.`, at: monthsAgo(2), read: true },
  ] as const;
  for (const u of Object.values(users)) {
    await prisma.notification.createMany({
      data: notes.map((n) => ({ companyId: company.id, userId: u.id, type: n.type, title: n.title, message: n.message, isRead: n.read, createdAt: n.at })),
    });
  }

  // One open support ticket about the failed transfer.
  const failedTx = await prisma.transaction.findFirst({ where: { companyId: company.id, type: 'PAYROLL_DEBIT', status: 'FAILED' } });
  const ticket = await prisma.supportTicket.create({
    data: {
      reference: 'SUP-1001', companyId: company.id, createdById: users.finance.id, transactionId: failedTx?.id,
      category: 'PAYMENT_FAILURE', priority: 'HIGH', status: 'WAITING_FOR_CUSTOMER',
      subject: 'Salary transfer rejected for one employee', lastMessageAt: daysFromNow(-2),
    },
  });
  await prisma.supportMessage.createMany({
    data: [
      { ticketId: ticket.id, authorUserId: users.finance.id, senderType: 'CUSTOMER', body: "Last month's transfer to Aisha Mohammed was rejected. Funds came back to the wallet. What happened?", createdAt: daysFromNow(-4) },
      { ticketId: ticket.id, senderType: 'SUPPORT', body: 'The receiving bank rejected the account number. Please re-verify the employee bank details and retry the payment.', createdAt: daysFromNow(-2) },
    ],
  });

  console.log(`\nSeeded "${company.name}": ${employees.length} employees, wallet ₦${(balance / 100).toLocaleString('en-NG')}`);
  console.log(`\nLog in with any of these (password: ${DEMO_PASSWORD})`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
