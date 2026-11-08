import { describe, expect, it } from 'vitest';
import { generatePayrollTransferReference } from './formatters';

describe('payroll transfer references', () => {
  it('is deterministic and Paystack-safe', () => {
    const first = generatePayrollTransferReference('ABC_1234-5678');
    expect(first).toBe(generatePayrollTransferReference('ABC_1234-5678'));
    expect(first).toMatch(/^[a-z0-9_-]{16,50}$/);
  });
});
