export type DepositOutcome = 'confirmed' | 'processing' | 'failed';

export async function pollDeposit(reference: string, verify: (reference: string) => Promise<unknown>, wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))): Promise<DepositOutcome> {
  for (let attempt = 0; attempt <= 10; attempt++) {
    try {
      await verify(reference);
      return 'confirmed';
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (/payment is not complete \((abandoned|failed|reversed)\)/.test(message)) return 'failed';
      if (attempt === 10) return 'processing';
      await wait(2000);
    }
  }
  return 'processing';
}
