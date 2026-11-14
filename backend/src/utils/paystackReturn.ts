import { Request } from 'express';

const validReference = /^[A-Za-z0-9_-]{1,100}$/;

export function paystackReturnLocation(reference: unknown): string | null {
  return typeof reference === 'string' && validReference.test(reference)
    ? `remit://wallet?reference=${encodeURIComponent(reference)}`
    : null;
}

export function depositCallbackUrl(req: Request, reference: string, frontendUrl: string, apiPublicUrl?: string): string | undefined {
  if (req.get('X-Client') === 'mobile') {
    const base = (apiPublicUrl?.trim() || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    // Paystack appends the reference to this URL after checkout.
    return `${base}/api/v1/wallet/paystack-return`;
  }
  return frontendUrl ? `${frontendUrl}/?view=wallet&depositReference=${reference}` : undefined;
}
