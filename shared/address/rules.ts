import {isPoBox} from '../delivery/date';

/** App-owned shop metafield `address_rules_config` (scripts/address-rules-config.json). */
export interface AddressRulesConfig {
  /** Countries the rules run for. Others pass untouched (number-after-street countries, etc.). */
  countries: string[];
  requireHouseNumber: boolean;
  allowPoBox: boolean;
  /** US only: the ZIP must belong to the chosen state. */
  checkZipState: boolean;
}

export type AddressProblem =
  | {type: 'no_house_number'}
  | {type: 'po_box'}
  | {type: 'zip_state_mismatch'; zip: string; provinceCode: string; expected: string[]};

export interface AddressInput {
  address1?: string | null;
  address2?: string | null;
  zip?: string | null;
  provinceCode?: string | null;
  countryCode?: string | null;
}

export function parseAddressRulesConfig(raw: unknown): AddressRulesConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const countries = Array.isArray(c.countries) ? c.countries.filter((x): x is string => typeof x === 'string') : ['US', 'CA'];
  return {
    countries: countries.map((x) => x.toUpperCase()),
    requireHouseNumber: c.requireHouseNumber !== false,
    allowPoBox: c.allowPoBox === true,
    checkZipState: c.checkZipState !== false,
  };
}

/**
 * First three ZIP digits -> state, as [from, to, state]. A coarse prefix table (USPS publishes
 * the SCF ranges) good enough to catch "10001 in CA". Single prefixes that break a range come
 * first in EXCEPTIONS. A prefix in no range (territories, military) is never blocked.
 */
const RANGES: Array<[number, number, string]> = [
  [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'], [50, 59, 'VT'], [60, 69, 'CT'],
  [70, 89, 'NJ'], [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 205, 'DC'],
  [206, 219, 'MD'], [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'],
  [300, 319, 'GA'], [320, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'],
  [398, 399, 'GA'], [400, 427, 'KY'], [430, 458, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'],
  [500, 528, 'IA'], [530, 549, 'WI'], [550, 567, 'MN'], [570, 577, 'SD'], [580, 588, 'ND'],
  [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'], [680, 693, 'NE'],
  [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'],
  [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'],
  [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'], [980, 994, 'WA'],
  [995, 999, 'AK'],
];
const EXCEPTIONS: Record<number, string> = {5: 'NY', 63: 'NY', 55: 'MA', 202: 'DC', 201: 'VA', 733: 'TX', 755: 'AR', 885: 'TX'};

/** State(s) a US ZIP can belong to, [] when the prefix is unknown. */
export function statesForZip(zip: string): string[] {
  const digits = zip.trim().match(/^(\d{3})\d{2}(?:-\d{4})?$/);
  if (!digits) return [];
  const prefix = Number(digits[1]);
  if (EXCEPTIONS[prefix]) return [EXCEPTIONS[prefix]];
  const hit = RANGES.find(([from, to]) => prefix >= from && prefix <= to);
  return hit ? [hit[2]] : [];
}

const RURAL = /^\s*(rr|hc|rural\s+route|highway\s+contract)\b/i;

/** "123 Main St", "12B Baker St", "Rural Route 2"; not "Main Street" or "Apt 5". */
export function hasHouseNumber(address1: string): boolean {
  return /^\s*\d/.test(address1) || RURAL.test(address1);
}

/**
 * Problems with a delivery address, in the order the buyer should fix them. Never blocks on
 * what it can't judge: an empty field (Shopify's own required-field check covers it), a country
 * the merchant didn't list, a ZIP prefix it doesn't know.
 */
export function addressProblems(config: AddressRulesConfig, address: AddressInput): AddressProblem[] {
  const country = address.countryCode?.toUpperCase();
  if (!country || !config.countries.includes(country)) return [];
  const problems: AddressProblem[] = [];
  const line1 = address.address1?.trim() ?? '';

  if (line1) {
    if (isPoBox(address.address1, address.address2)) {
      if (!config.allowPoBox) problems.push({type: 'po_box'});
    } else if (config.requireHouseNumber && !hasHouseNumber(line1)) {
      problems.push({type: 'no_house_number'});
    }
  }

  const zip = address.zip?.trim() ?? '';
  const province = address.provinceCode?.toUpperCase();
  if (config.checkZipState && country === 'US' && zip && province) {
    const expected = statesForZip(zip);
    if (expected.length > 0 && !expected.includes(province)) {
      problems.push({type: 'zip_state_mismatch', zip, provinceCode: province, expected});
    }
  }
  return problems;
}
