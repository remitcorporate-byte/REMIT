import { PrismaClient } from '@prisma/client';

/**
 * Supabase's transaction pooler (port 6543) shares server connections between
 * clients, so Prisma must run in pgbouncer mode or it fails with
 * `prepared statement "sN" already exists` (Postgres 42P05). Add the flag
 * automatically when the URL targets that pooler and does not already set it.
 */
export function runtimeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const usesTransactionPooler = /@[^/?]*:6543\//.test(raw);
  if (!usesTransactionPooler || /[?&]pgbouncer=/.test(raw)) return raw;
  const separator = raw.includes('?') ? '&' : '?';
  const limit = /[?&]connection_limit=/.test(raw) ? '' : '&connection_limit=5';
  return `${raw}${separator}pgbouncer=true${limit}`;
}

/** One Prisma client per process, shared by API handlers and workers. */
export const prisma = new PrismaClient({
  datasourceUrl: runtimeDatabaseUrl(process.env.DATABASE_URL),
});
export default prisma;
