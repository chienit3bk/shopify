/**
 * EU VAT numbers for business buyers: normalise what the buyer typed and check it has the shape
 * that country uses. A format check only: whether the number is registered needs the EU's VIES
 * service, which neither a Function (no network) nor this block calls.
 * Pure, shared by the checkout block and the cart-rules Function, unit-tested.
 */

/** Country code → VAT prefix (Greece uses EL) and the digits/letters after it. */
const FORMATS: Record<string, {prefix: string; pattern: RegExp}> = {
  AT: {prefix: 'AT', pattern: /^U\d{8}$/},
  BE: {prefix: 'BE', pattern: /^[01]\d{9}$/},
  BG: {prefix: 'BG', pattern: /^\d{9,10}$/},
  CY: {prefix: 'CY', pattern: /^\d{8}[A-Z]$/},
  CZ: {prefix: 'CZ', pattern: /^\d{8,10}$/},
  DE: {prefix: 'DE', pattern: /^\d{9}$/},
  DK: {prefix: 'DK', pattern: /^\d{8}$/},
  EE: {prefix: 'EE', pattern: /^\d{9}$/},
  ES: {prefix: 'ES', pattern: /^[A-Z0-9]\d{7}[A-Z0-9]$/},
  FI: {prefix: 'FI', pattern: /^\d{8}$/},
  FR: {prefix: 'FR', pattern: /^[A-HJ-NP-Z0-9]{2}\d{9}$/},
  GR: {prefix: 'EL', pattern: /^\d{9}$/},
  HR: {prefix: 'HR', pattern: /^\d{11}$/},
  HU: {prefix: 'HU', pattern: /^\d{8}$/},
  IE: {prefix: 'IE', pattern: /^(\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/},
  IT: {prefix: 'IT', pattern: /^\d{11}$/},
  LT: {prefix: 'LT', pattern: /^(\d{9}|\d{12})$/},
  LU: {prefix: 'LU', pattern: /^\d{8}$/},
  LV: {prefix: 'LV', pattern: /^\d{11}$/},
  MT: {prefix: 'MT', pattern: /^\d{8}$/},
  NL: {prefix: 'NL', pattern: /^\d{9}B\d{2}$/},
  PL: {prefix: 'PL', pattern: /^\d{10}$/},
  PT: {prefix: 'PT', pattern: /^\d{9}$/},
  RO: {prefix: 'RO', pattern: /^\d{2,10}$/},
  SE: {prefix: 'SE', pattern: /^\d{12}$/},
  SI: {prefix: 'SI', pattern: /^\d{8}$/},
  SK: {prefix: 'SK', pattern: /^\d{10}$/},
};

export const VAT_ATTRIBUTE = 'VAT number';

export function isEuCountry(countryCode: string | null | undefined): boolean {
  return Boolean(countryCode && FORMATS[countryCode.toUpperCase()]);
}

/** "de 123.456-789" → "DE123456789": upper case, no spaces, dots or dashes. */
export function normalizeVat(input: string): string {
  return input.toUpperCase().replace(/[\s.\-]/g, '');
}

export type VatCheck =
  | {ok: true; value: string}
  | {ok: false; reason: 'empty' | 'not_eu' | 'wrong_country' | 'format'; expectedPrefix?: string};

/**
 * Checks a VAT number against the delivery country: the prefix must be that country's
 * (EL for Greece) and the rest must match its format.
 */
export function checkVat(input: string, countryCode: string | null | undefined): VatCheck {
  const value = normalizeVat(input);
  if (!value) return {ok: false, reason: 'empty'};
  const format = countryCode ? FORMATS[countryCode.toUpperCase()] : undefined;
  if (!format) return {ok: false, reason: 'not_eu'};
  if (!value.startsWith(format.prefix)) return {ok: false, reason: 'wrong_country', expectedPrefix: format.prefix};
  if (!format.pattern.test(value.slice(format.prefix.length))) return {ok: false, reason: 'format', expectedPrefix: format.prefix};
  return {ok: true, value};
}
