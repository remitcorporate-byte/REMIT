import axios, { AxiosInstance } from 'axios';
import config from '../config';

// Known Paystack test-mode bank details for recipient creation fallback.
// In test mode, Paystack rejects real bank codes it can't resolve.
// Order matters — 001 is Paystack's official test bank, 057 (Zenith) confirmed working.
const TEST_BANK_FALLBACKS = [
  { bankCode: '001', accountNumber: '0000000000' }, // Paystack test bank
  { bankCode: '057', accountNumber: '0000000000' }, // Zenith Bank (confirmed working)
  { bankCode: '058', accountNumber: '0000000000' }, // GTBank
  { bankCode: '044', accountNumber: '0000000000' }, // Access Bank
  { bankCode: '033', accountNumber: '0000000000' }, // UBA
];

class PaystackService {
  private client: AxiosInstance;
  private useMock: boolean;

  constructor() {
    this.useMock = process.env.USE_PAYSTACK_MOCK === 'true';
    this.client = axios.create({
      baseURL: config.paystack.baseUrl,
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /** True when using a sk_test_ key */
  get isTestMode(): boolean {
    return config.paystack.secretKey.startsWith('sk_test_');
  }

  // Initialize a payment transaction
  async initializeTransaction(params: {
    email: string;
    amount: number; // in kobo
    reference?: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (this.useMock) {
      console.log(`[PaystackMock] Initializing transaction for ${params.email}: ${params.amount}`);
      return {
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: 'https://checkout.paystack.com/mock-url',
          access_code: 'mock-access-code',
          reference: params.reference || `ref_${Date.now()}`,
        }
      };
    }
    const { data } = await this.client.post('/transaction/initialize', {
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    });
    return data;
  }

  // Verify a transaction
  async verifyTransaction(reference: string) {
    if (this.useMock) {
      console.log(`[PaystackMock] Verifying transaction: ${reference}`);
      return {
        status: true,
        message: 'Verification successful',
        data: {
          status: 'success',
          amount: 500000,
          reference,
          customer: { email: 'test@remit.com' }
        }
      };
    }
    const { data } = await this.client.get(`/transaction/verify/${reference}`);
    return data;
  }

  // Create a transfer recipient
  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }) {
    if (this.useMock) {
      console.log(`[PaystackMock] Creating recipient: ${params.name}`);
      return {
        status: true,
        message: 'Recipient created',
        data: { recipient_code: `RCP_mock_${Date.now()}` }
      };
    }

    const payload = {
      type: 'nuban',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: 'NGN',
    };

    try {
      const { data } = await this.client.post('/transferrecipient', payload);
      return data;
    } catch (error: any) {
      // In test mode, Paystack often rejects real bank details it can't resolve.
      // Fall back to known test-mode bank details so transfers still reach the
      // Paystack Dashboard and the full flow can be verified end-to-end.
      if (!this.isTestMode) throw error;

      const originalMsg = error.response?.data?.message || error.message;
      console.warn(
        `[Paystack Test] Recipient creation failed (${originalMsg}). ` +
        `Retrying with test bank fallbacks for "${params.name}"...`
      );

      for (const fallback of TEST_BANK_FALLBACKS) {
        try {
          const { data } = await this.client.post('/transferrecipient', {
            type: 'nuban',
            name: params.name,
            account_number: fallback.accountNumber,
            bank_code: fallback.bankCode,
            currency: 'NGN',
          });
          console.warn(
            `[Paystack Test] Recipient created with fallback bank ${fallback.bankCode}. ` +
            `In live mode, the employee's real bank details (${params.bankCode}/${params.accountNumber}) will be used.`
          );
          return data;
        } catch {
          // Try next fallback
        }
      }

      // All fallbacks failed — re-throw the original error
      console.error(
        `[Paystack Test] All test bank fallbacks also failed. ` +
        `This may indicate an issue with your Paystack test key or account.`
      );
      throw error;
    }
  }

  // Initiate a transfer
  async initiateTransfer(params: {
    amount: number; // in kobo
    recipientCode: string;
    reason?: string;
    reference?: string;
  }) {
    if (this.useMock) {
      console.log(`[PaystackMock] Initiating transfer to ${params.recipientCode}: ${params.amount}`);
      return {
        status: true,
        message: 'Transfer queued',
        data: { transfer_code: `TRF_mock_${Date.now()}` }
      };
    }
    const { data } = await this.client.post('/transfer', {
      source: 'balance',
      amount: params.amount,
      recipient: params.recipientCode,
      reason: params.reason,
      reference: params.reference,
    });
    return data;
  }

  // Initiate bulk transfer
  async initiateBulkTransfer(transfers: Array<{
    amount: number;
    recipient: string;
    reason?: string;
    reference?: string;
  }>) {
    if (this.useMock) {
      console.log(`[PaystackMock] Initiating bulk transfer for ${transfers.length} recipients`);
      return {
        status: true,
        message: 'Bulk transfer queued',
        data: transfers.map(t => ({ transfer_code: `TRF_mock_${Date.now()}` }))
      };
    }
    const { data } = await this.client.post('/transfer/bulk', {
      source: 'balance',
      transfers,
    });
    return data;
  }

  // Verify bank account
  async verifyBankAccount(accountNumber: string, bankCode: string) {
    if (this.useMock) {
      console.log(`[PaystackMock] Verifying account: ${accountNumber} (${bankCode})`);
      return {
        status: true,
        message: 'Account verified',
        data: { account_name: 'Mock Verified Account' }
      };
    }

    try {
      const { data } = await this.client.get(
        `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
      );
      return data;
    } catch (error: any) {
      // In test mode, /bank/resolve is very selective about which accounts it
      // accepts. Return a synthetic response so employee creation isn't blocked.
      if (this.isTestMode) {
        console.warn(
          `[Paystack Test] Bank resolve failed for ${bankCode}/${accountNumber}. ` +
          `Returning placeholder name — real verification happens in live mode.`
        );
        return {
          status: true,
          message: 'Test mode — resolution skipped',
          data: { account_name: 'Test Mode Account' },
        };
      }
      throw error;
    }
  }

  // List banks
  async listBanks() {
    if (this.useMock) {
      return {
        status: true,
        data: [{ name: 'Access Bank', code: '044' }, { name: 'GTBank', code: '058' }]
      };
    }
    const { data } = await this.client.get('/bank?country=nigeria');
    return data;
  }
}

export const paystackService = new PaystackService();
