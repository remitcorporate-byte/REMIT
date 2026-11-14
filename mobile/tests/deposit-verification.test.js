import { describe, expect, it } from 'bun:test';
import { pollDeposit } from '../src/lib/deposit-verification.ts';

describe('deposit verification polling', () => {
  it('confirms after a pending response without waiting for the full timeout', async () => {
    let calls = 0;
    let waits = 0;
    const outcome = await pollDeposit('DEP_123', async () => {
      calls++;
      if (calls < 3) throw new Error('Payment is not complete (pending)');
      return {};
    }, async (ms) => { expect(ms).toBe(2000); waits++; });
    expect(outcome).toBe('confirmed');
    expect(calls).toBe(3);
    expect(waits).toBe(2);
  });

  it('reports processing after about twenty seconds of pending results', async () => {
    let calls = 0;
    let waits = 0;
    const outcome = await pollDeposit('DEP_123', async () => {
      calls++;
      throw new Error('Payment is not complete (pending)');
    }, async () => { waits++; });
    expect(outcome).toBe('processing');
    expect(calls).toBe(11);
    expect(waits).toBe(10);
  });

  it('stops on a terminal payment failure', async () => {
    expect(await pollDeposit('DEP_123', async () => { throw new Error('Payment is not complete (failed)'); }, async () => { throw new Error('must not wait'); }))
      .toBe('failed');
  });
});
