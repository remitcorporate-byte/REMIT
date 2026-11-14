import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { depositCallbackUrl, paystackReturnLocation } from './paystackReturn';
import { paystackReturn } from '../controllers/wallet.controller';

function request(client: string | undefined, protocol = 'https', host = 'api.apexleger.com') {
  return { protocol, get: (name: string) => name === 'X-Client' ? client : name === 'host' ? host : undefined } as Request;
}

describe('Paystack deposit callback', () => {
  it('selects the API return endpoint for mobile and preserves the web callback', () => {
    expect(depositCallbackUrl(request('mobile'), 'DEP_123', 'https://web.example', 'https://api.example/'))
      .toBe('https://api.example/api/v1/wallet/paystack-return');
    expect(depositCallbackUrl(request('web'), 'DEP_123', 'https://web.example', 'https://api.example'))
      .toBe('https://web.example/?view=wallet&depositReference=DEP_123');
    expect(depositCallbackUrl(request(undefined), 'DEP_123', '', 'https://api.example')).toBeUndefined();
  });

  it('falls back to the proxy-aware request origin when API_PUBLIC_URL is absent', () => {
    expect(depositCallbackUrl(request('mobile'), 'DEP_123', '', ''))
      .toBe('https://api.apexleger.com/api/v1/wallet/paystack-return');
    expect(depositCallbackUrl(request('mobile', 'http', '127.0.0.1:5000'), 'DEP_123', ''))
      .toBe('http://127.0.0.1:5000/api/v1/wallet/paystack-return');
  });
});

describe('Paystack return endpoint', () => {
  it('redirects a valid reference to exactly the wallet deep link', () => {
    const redirect = vi.fn();
    paystackReturn({ query: { reference: 'DEP_abc-123' } } as unknown as Request, { redirect } as unknown as Response);
    expect(redirect).toHaveBeenCalledExactlyOnceWith(302, 'remit://wallet?reference=DEP_abc-123');
  });

  it.each([undefined, '', '../evil', 'abc?next=https://evil.test', 'a'.repeat(101), ['ABC', 'DEF'], 'https://evil.test'])
  ('rejects invalid or malicious reference %s', (reference) => {
    const json = vi.fn();
    const redirect = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    paystackReturn({ query: { reference } } as unknown as Request, { status, redirect } as unknown as Response);
    expect(status).toHaveBeenCalledWith(400);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('has a fixed redirect target for every accepted reference', () => {
    expect(paystackReturnLocation('ABC_123-xyz')).toBe('remit://wallet?reference=ABC_123-xyz');
    expect(paystackReturnLocation('ABC%2Fxyz')).toBeNull();
  });
});
