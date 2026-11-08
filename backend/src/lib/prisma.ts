import { PrismaClient } from '@prisma/client';

/** One Prisma client per process, shared by API handlers and workers. */
export const prisma = new PrismaClient();
export default prisma;
