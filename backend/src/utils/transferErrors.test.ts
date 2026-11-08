import { describe, expect, it } from 'vitest';
import { classifyTransferError } from './transferErrors';

describe('transfer error classification', () => {
  it('classifies a clear Paystack 4xx rejection as definitive', () => {
    expect(classifyTransferError({ response: { status: 400, data: { status: false, message: 'Invalid recipient' } } })).toBe('definitive');
  });

  it('keeps network, timeout, and server errors ambiguous', () => {
    expect(classifyTransferError(new Error('timeout'))).toBe('ambiguous');
    expect(classifyTransferError({ response: { status: 500, data: { message: 'oops' } } })).toBe('ambiguous');
    expect(classifyTransferError({ response: { status: 400, data: { message: 'Duplicate transaction reference' } } })).toBe('ambiguous');
  });
});
