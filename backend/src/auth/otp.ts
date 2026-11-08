import { hashToken, safeEqualText } from './tokens';

export type OtpCheck = { ok: boolean; reason?: 'expired' | 'attempts' | 'invalid' };

export function verifyHashedCode(input: { provided: string; codeHash: string; expiresAt: Date; attempts: number; maxAttempts?: number }): OtpCheck {
  if (input.expiresAt <= new Date()) return { ok: false, reason: 'expired' };
  if (input.attempts >= (input.maxAttempts ?? 5)) return { ok: false, reason: 'attempts' };
  return safeEqualText(hashToken(input.provided), input.codeHash) ? { ok: true } : { ok: false, reason: 'invalid' };
}
