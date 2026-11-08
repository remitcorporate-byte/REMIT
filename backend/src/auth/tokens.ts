import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import config from '../config';

export type AccessClaims = { sub: string; sid: string; role: string };

export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function generateAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
    issuer: 'remit-api',
    audience: 'remit-api',
  });
}

export function verifyAccessToken(token: string): AccessClaims & jwt.JwtPayload {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
    issuer: 'remit-api',
    audience: 'remit-api',
  }) as AccessClaims & jwt.JwtPayload;
}

export function refreshTtlMs(): number {
  return config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
}

export function familyMaxMs(): number {
  return 90 * 24 * 60 * 60 * 1000;
}

export function sessionExpiry(createdAt = new Date(), familyCreatedAt = createdAt): Date {
  const sliding = new Date(createdAt.getTime() + refreshTtlMs());
  const absolute = new Date(familyCreatedAt.getTime() + familyMaxMs());
  return sliding < absolute ? sliding : absolute;
}

export async function createSession(input: {
  userId: string;
  familyId?: string;
  familyCreatedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
  deviceName?: string;
}) {
  const refreshToken = generateRefreshToken();
  const now = new Date();
  const familyCreatedAt = input.familyCreatedAt || now;
  const session = await prisma.authSession.create({
    data: {
      userId: input.userId,
      refreshTokenHash: hashToken(refreshToken),
      familyId: input.familyId || crypto.randomUUID(),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      deviceName: input.deviceName,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: sessionExpiry(now, familyCreatedAt),
    },
  });
  return { session, refreshToken };
}

export function safeEqualText(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

/** Seconds until the access token expires, derived from its own `exp` so it always matches JWT_ACCESS_TTL. */
export function accessTokenExpiresIn(token: string): number {
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  return decoded?.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : 0;
}
