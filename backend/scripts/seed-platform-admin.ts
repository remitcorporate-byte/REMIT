import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME?.trim() || 'Platform';
  const lastName = process.env.PLATFORM_ADMIN_LAST_NAME?.trim() || 'Admin';

  if (!email || !password) {
    throw new Error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are required');
  }
  if (password.length < 12) throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters');

  const user = await prisma.platformUser.upsert({
    where: { email },
    update: {
      password: await bcrypt.hash(password, 12),
      firstName,
      lastName,
      role: 'SUPPORT_ADMIN',
      isActive: true,
    },
    create: {
      email,
      password: await bcrypt.hash(password, 12),
      firstName,
      lastName,
      role: 'SUPPORT_ADMIN',
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  console.log(`Platform admin ready: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
