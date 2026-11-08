import { describe, expect, it } from 'vitest';
import { getNextPaymentDate } from './dateHelpers';

describe('getNextPaymentDate', () => {
  const date = new Date('2026-01-15T12:00:00.000Z');

  it.each([
    ['WEEKLY', '2026-01-22T12:00:00.000Z'],
    ['BIWEEKLY', '2026-01-29T12:00:00.000Z'],
    ['MONTHLY', '2026-02-15T12:00:00.000Z'],
  ] as const)('%s advances correctly', (frequency, expected) => {
    expect(getNextPaymentDate(date, frequency).toISOString()).toBe(expected);
  });
});
