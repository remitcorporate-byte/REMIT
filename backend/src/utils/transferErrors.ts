export type TransferErrorClassification = 'definitive' | 'ambiguous';

function responseOf(error: unknown): { status?: number; data?: unknown } | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return undefined;
  return response as { status?: number; data?: unknown };
}

/** Refund only when Paystack clearly rejected the request. */
export function classifyTransferError(error: unknown): TransferErrorClassification {
  const response = responseOf(error);
  const status = response?.status;
  if (!status || status < 400 || status >= 500) return 'ambiguous';

  const data = response?.data;
  if (data && typeof data === 'object') {
    const payload = data as { status?: unknown; message?: unknown; error?: unknown };
    const detail = `${payload.message || ''} ${payload.error || ''}`.toLowerCase();
    // A duplicate/reference response can mean the first request was accepted;
    // never refund that case without reconciliation.
    if (/duplicate|already\s+(exists|processed|queued)|reference.*(exists|used)/.test(detail)) {
      return 'ambiguous';
    }
    if (payload.status === false || typeof payload.message === 'string' || typeof payload.error === 'string') {
      return 'definitive';
    }
  }
  return 'ambiguous';
}

export function isDefinitiveTransferError(error: unknown): boolean {
  return classifyTransferError(error) === 'definitive';
}
