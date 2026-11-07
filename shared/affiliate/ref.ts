/**
 * Affiliate tracking: `?ref=` on any storefront URL is remembered, copied onto the cart as the
 * attribute `affiliate_ref` (shown on the order under "Additional details"), and read back at
 * checkout_completed by the web pixel. The attribute is plain text from the URL, so it is cut
 * down to a safe token before it is stored or sent anywhere.
 */

export const REF_PARAM = 'ref';
export const REF_ATTRIBUTE = 'affiliate_ref';
export const REF_STORAGE_KEY = 'affiliate_ref';
/** Days a ref is remembered after the last link click. */
export const REF_DAYS = 30;

const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

/** A ref is letters, digits, "_" or "-", at most 40 characters. Anything else is dropped. */
export function cleanRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return REF_PATTERN.test(trimmed) ? trimmed : null;
}

export function refFromSearch(search: string): string | null {
  try {
    return cleanRef(new URLSearchParams(search).get(REF_PARAM));
  } catch {
    return null;
  }
}

export function refFromAttributes(attributes: {key: string; value: string}[] | undefined | null): string | null {
  const found = (attributes ?? []).find((a) => a.key === REF_ATTRIBUTE);
  return found ? cleanRef(found.value) : null;
}

export interface StoredRef {
  ref: string;
  /** Epoch ms when the link was last opened. */
  at: number;
}

export function parseStoredRef(raw: string | null | undefined, now: number): StoredRef | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const ref = cleanRef(data?.ref);
    if (!ref || typeof data.at !== 'number') return null;
    if (now - data.at > REF_DAYS * 86_400_000) return null;
    return {ref, at: data.at};
  } catch {
    return null;
  }
}

/**
 * The ref to keep after a page load: a new `?ref=` wins (last click), otherwise the stored one
 * while it is still inside the window.
 */
export function nextStoredRef(search: string, stored: string | null | undefined, now: number): StoredRef | null {
  const fresh = refFromSearch(search);
  if (fresh) return {ref: fresh, at: now};
  return parseStoredRef(stored, now);
}

/** Per-ref totals the pixel keeps, same shape idea as the gift funnel. */
export interface RefTotals {
  [ref: string]: {orders: number; revenue: number; currencyCode: string};
}

export function recordRefOrder(totals: RefTotals, ref: string, subtotal: number, currencyCode: string): RefTotals {
  const prev = totals[ref] ?? {orders: 0, revenue: 0, currencyCode};
  return {
    ...totals,
    [ref]: {orders: prev.orders + 1, revenue: Math.round((prev.revenue + subtotal) * 100) / 100, currencyCode},
  };
}

export function parseRefTotals(raw: string | null | undefined): RefTotals {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as RefTotals) : {};
  } catch {
    return {};
  }
}
