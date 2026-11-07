/** The part of the address-autocomplete target types this code needs (kept local so it unit-tests without the SDK). */
export interface FormattedAddress {
  address1?: string;
  address2?: string;
  city?: string;
  provinceCode?: string;
  zip?: string;
  countryCode?: string;
}

export interface Suggestion {
  id: string;
  label: string;
  matchedSubstrings?: Array<{offset: number; length: number}>;
  formattedAddress?: FormattedAddress;
}

export interface SuggestQuery {
  field: 'address1' | 'zip';
  value: string;
  countryCode?: string;
}

/**
 * The adapter. `suggest` runs on every pause in typing; `resolve` runs once, when the buyer picks
 * a row (the optional format-suggestion target). Swap the static provider for one that calls
 * Google Places, Loqate or HERE and nothing else changes.
 */
export interface AddressProvider {
  suggest(query: SuggestQuery, signal?: AbortSignal): Promise<Suggestion[]> | Suggestion[];
  resolve(id: string, signal?: AbortSignal): Promise<FormattedAddress | undefined> | FormattedAddress | undefined;
}

/** Checkout shows at most five rows. */
export const MAX_SUGGESTIONS = 5;
/** Don't query a provider on one or two characters. */
export const MIN_QUERY_LENGTH = 3;

export function matchedSubstring(label: string, value: string): Array<{offset: number; length: number}> {
  const offset = label.toLowerCase().indexOf(value.trim().toLowerCase());
  return offset >= 0 && value.trim() ? [{offset, length: value.trim().length}] : [];
}

/** A fixed list of made-up Solvane test addresses: the demo needs no API key and works offline. */
export const DEMO_ADDRESSES: Array<FormattedAddress & {id: string}> = [
  {id: 'a1', address1: '350 5th Ave', city: 'New York', provinceCode: 'NY', zip: '10118', countryCode: 'US'},
  {id: 'a2', address1: '350 Mission St', city: 'San Francisco', provinceCode: 'CA', zip: '94105', countryCode: 'US'},
  {id: 'a3', address1: '350 N Orleans St', city: 'Chicago', provinceCode: 'IL', zip: '60654', countryCode: 'US'},
  {id: 'a4', address1: '1600 Pennsylvania Ave NW', city: 'Washington', provinceCode: 'DC', zip: '20500', countryCode: 'US'},
  {id: 'a5', address1: '742 Evergreen Terrace', city: 'Springfield', provinceCode: 'OR', zip: '97477', countryCode: 'US'},
  {id: 'a6', address1: '221 Congress Ave', city: 'Austin', provinceCode: 'TX', zip: '78701', countryCode: 'US'},
  {id: 'a7', address1: '100 Queen St W', city: 'Toronto', provinceCode: 'ON', zip: 'M5H 2N2', countryCode: 'CA'},
];

function line(a: FormattedAddress): string {
  return `${a.address1}, ${a.city}, ${a.provinceCode} ${a.zip}`;
}

export function createStaticProvider(directory = DEMO_ADDRESSES): AddressProvider {
  return {
    suggest({field, value, countryCode}) {
      const q = value.trim().toLowerCase();
      if (q.length < MIN_QUERY_LENGTH) return [];
      return directory
        .filter((a) => !countryCode || a.countryCode === countryCode)
        .filter((a) => (field === 'zip' ? (a.zip ?? '').toLowerCase().startsWith(q) : (a.address1 ?? '').toLowerCase().includes(q)))
        .slice(0, MAX_SUGGESTIONS)
        // Only id + label: the full address arrives through resolve(), like a real two-step provider.
        .map((a) => ({id: a.id, label: line(a), matchedSubstrings: matchedSubstring(line(a), value)}));
    },
    resolve(id) {
      const hit = directory.find((a) => a.id === id);
      if (!hit) return undefined;
      const {id: _id, ...address} = hit;
      return address;
    },
  };
}

/**
 * What to put in the form. Always the flat lines; a provider that fails or finds nothing returns
 * an empty list so the buyer just types the address (autocomplete must never block checkout).
 */
export async function safeSuggest(provider: AddressProvider, query: SuggestQuery, signal?: AbortSignal): Promise<Suggestion[]> {
  try {
    const rows = await provider.suggest(query, signal);
    return rows.slice(0, MAX_SUGGESTIONS);
  } catch {
    return [];
  }
}
