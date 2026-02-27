/**
 * Direct Paystack API diagnostic — tests each operation in isolation
 * to identify exactly which step fails in test mode.
 *
 * Run: pnpm exec ts-node scripts/diagnose-paystack.ts
 */
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;
const BASE = 'https://api.paystack.co';

const client = axios.create({
  baseURL: BASE,
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

async function step(label: string, fn: () => Promise<any>): Promise<any> {
  process.stdout.write(`\n--- ${label} ---\n`);
  try {
    const result = await fn();
    console.log('OK:', JSON.stringify(result.data ?? result, null, 2));
    return result;
  } catch (err: any) {
    const detail = err.response?.data ?? err.message;
    console.error('FAILED:', JSON.stringify(detail, null, 2));
    return null;
  }
}

async function main() {
  console.log(`Paystack key: ${SECRET_KEY.slice(0, 12)}...`);
  console.log(`Test mode: ${SECRET_KEY.startsWith('sk_test_')}\n`);

  // 1. Verify the key works at all
  await step('1. List Banks (connectivity check)', async () => {
    const { data } = await client.get('/bank?country=nigeria&perPage=5');
    return { count: data.data.length, sample: data.data.slice(0, 3).map((b: any) => `${b.name} (${b.code})`) };
  });

  // 2. Try resolving a test account
  const testBanks = [
    { code: '058', name: 'GTBank' },
    { code: '057', name: 'Zenith' },
    { code: '044', name: 'Access' },
    { code: '033', name: 'UBA' },
    { code: '011', name: 'First Bank' },
  ];

  for (const bank of testBanks) {
    await step(`2. Resolve account: ${bank.name} (${bank.code}) / 0000000000`, async () => {
      const { data } = await client.get(`/bank/resolve?account_number=0000000000&bank_code=${bank.code}`);
      return data;
    });
  }

  // 3. Try creating a transfer recipient with each test bank
  let recipientCode: string | null = null;

  for (const bank of testBanks) {
    const result = await step(`3. Create recipient: ${bank.name} (${bank.code}) / 0000000000`, async () => {
      const { data } = await client.post('/transferrecipient', {
        type: 'nuban',
        name: 'Test Employee',
        account_number: '0000000000',
        bank_code: bank.code,
        currency: 'NGN',
      });
      return data;
    });

    if (result && result.data?.recipient_code) {
      recipientCode = result.data.recipient_code;
      console.log(`  -> Got recipient_code: ${recipientCode}`);
      break; // one success is enough
    }
  }

  if (!recipientCode) {
    console.error('\nAll recipient creation attempts failed. Cannot test transfers.');
    console.error('Possible causes:');
    console.error('  - Paystack test mode may not support /transferrecipient at all for your account');
    console.error('  - Your test API key may have restrictions');
    process.exit(1);
  }

  // 4. Check Paystack balance
  await step('4. Check Paystack balance', async () => {
    const { data } = await client.get('/balance');
    return data;
  });

  // 5. Try initiating a small transfer
  const transferRef = `DIAG_${Date.now()}`;
  await step(`5. Initiate transfer (50 NGN) to ${recipientCode}`, async () => {
    const { data } = await client.post('/transfer', {
      source: 'balance',
      amount: 5000, // 50 NGN in kobo
      recipient: recipientCode,
      reason: 'REMIT diagnostic test',
      reference: transferRef,
    });
    return data;
  });

  // 6. Check if OTP is required (disable it if needed)
  await step('6. Finalize transfer / check OTP requirement', async () => {
    const { data } = await client.post('/transfer/finalize_transfer', {
      transfer_code: transferRef,
      otp: '928783', // Paystack test OTP
    });
    return data;
  });

  console.log('\n=== Diagnosis complete ===');
}

main().catch(console.error);
