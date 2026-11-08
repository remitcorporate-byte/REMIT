import { prisma } from '../src/lib/prisma';
import { accountNumberLast4, encryptField, isEncryptedField } from '../src/utils/crypto';

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, accountNumber: true, accountNumberLast4: true },
  });

  let updated = 0;
  for (const employee of employees) {
    if (isEncryptedField(employee.accountNumber)) {
      const last4 = accountNumberLast4(employee.accountNumber);
      if (employee.accountNumberLast4 !== last4) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { accountNumberLast4: last4 },
        });
      }
      continue;
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        accountNumber: encryptField(employee.accountNumber),
        accountNumberLast4: employee.accountNumber.slice(-4),
      },
    });
    updated++;
  }

  console.log(`Encrypted ${updated} employee account number(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
