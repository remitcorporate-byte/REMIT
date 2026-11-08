import { beforeEach, describe, expect, it } from 'vitest';
import { decryptField, encryptField } from './crypto';

describe('field encryption', () => {
  beforeEach(() => {
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('round-trips AES-256-GCM values', () => {
    const encrypted = encryptField('0123456789');
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptField(encrypted)).toBe('0123456789');
  });

  it('passes legacy plaintext through', () => {
    expect(decryptField('0123456789')).toBe('0123456789');
  });
});
