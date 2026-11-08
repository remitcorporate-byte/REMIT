import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashToken, sessionExpiry } from './tokens';
import { verifyHashedCode } from './otp';
import { parseCookieHeader } from '../middleware/auth';
import { passwordSchema } from '../controllers/auth.controller';

describe('session auth primitives', () => {
  it('hashes tokens without storing the raw value', () => {
    const raw = generateRefreshToken();
    expect(hashToken(raw)).toHaveLength(64);
    expect(hashToken(raw)).not.toBe(raw);
  });

  it('caps sliding refresh expiry at the 90 day family maximum', () => {
    const familyStart = new Date('2026-01-01T00:00:00Z');
    const rotatedAt = new Date('2026-03-01T00:00:00Z');
    expect(sessionExpiry(rotatedAt, familyStart).getTime()).toBe(rotatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(sessionExpiry(new Date('2026-03-15T00:00:00Z'), familyStart).getTime()).toBeLessThanOrEqual(familyStart.getTime() + 90 * 24 * 60 * 60 * 1000);
  });

  it('parses cookies without cookie-parser', () => {
    expect(parseCookieHeader('remit_rt=abc%2B123; theme=dark')).toEqual({ remit_rt: 'abc+123', theme: 'dark' });
  });

  it('enforces OTP expiry, attempts and timing-safe value comparison', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const codeHash = hashToken('123456');
    expect(verifyHashedCode({ provided: '123456', codeHash, expiresAt, attempts: 0 }).ok).toBe(true);
    expect(verifyHashedCode({ provided: '000000', codeHash, expiresAt, attempts: 0 }).reason).toBe('invalid');
    expect(verifyHashedCode({ provided: '123456', codeHash, expiresAt: new Date(Date.now() - 1), attempts: 0 }).reason).toBe('expired');
    expect(verifyHashedCode({ provided: '123456', codeHash, expiresAt, attempts: 5 }).reason).toBe('attempts');
  });

  it('enforces the password policy', () => {
    expect(passwordSchema.safeParse('short1A').success).toBe(false);
    expect(passwordSchema.safeParse('longpassword').success).toBe(false);
    expect(passwordSchema.safeParse('Longpassword1').success).toBe(true);
  });
});
