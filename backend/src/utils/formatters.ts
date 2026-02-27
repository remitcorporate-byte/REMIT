// Convert kobo to naira
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

// Convert naira to kobo
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

// Format amount in naira
export function formatNaira(kobo: number): string {
  const naira = koboToNaira(kobo);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(naira);
}

// Generate a unique reference
export function generateReference(prefix: string = 'REMIT'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
}

// Paginate helper
export function getPaginationParams(page?: number, limit?: number) {
  const p = Math.max(1, page || 1);
  const l = Math.min(100, Math.max(1, limit || 10));
  return {
    skip: (p - 1) * l,
    take: l,
    page: p,
    limit: l,
  };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}
