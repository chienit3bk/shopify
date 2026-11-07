import {describe, expect, it} from 'vitest';
import {cleanRef, nextStoredRef, parseRefTotals, parseStoredRef, recordRefOrder, refFromAttributes, refFromSearch} from './ref';

const DAY = 86_400_000;

describe('cleanRef', () => {
  it('keeps letters, digits, - and _', () => {
    expect(cleanRef('mia_2026-A')).toBe('mia_2026-A');
    expect(cleanRef('  anna ')).toBe('anna');
  });
  it('drops anything that is not a plain token', () => {
    expect(cleanRef('<script>')).toBeNull();
    expect(cleanRef('a b')).toBeNull();
    expect(cleanRef('x'.repeat(41))).toBeNull();
    expect(cleanRef('')).toBeNull();
    expect(cleanRef(undefined)).toBeNull();
    expect(cleanRef('-lead')).toBeNull();
  });
});

describe('refFromSearch', () => {
  it('reads ref from any page', () => {
    expect(refFromSearch('?utm=1&ref=mia')).toBe('mia');
    expect(refFromSearch('?REF=mia')).toBeNull();
    expect(refFromSearch('')).toBeNull();
    expect(refFromSearch('?ref=%3Cb%3E')).toBeNull();
  });
});

describe('nextStoredRef', () => {
  const now = Date.UTC(2026, 10, 7);
  const stored = JSON.stringify({ref: 'old', at: now - 5 * DAY});
  it('a new link replaces the stored ref (last click wins)', () => {
    expect(nextStoredRef('?ref=new', stored, now)).toEqual({ref: 'new', at: now});
  });
  it('keeps the stored ref without a link', () => {
    expect(nextStoredRef('', stored, now)).toEqual({ref: 'old', at: now - 5 * DAY});
  });
  it('forgets a ref after 30 days', () => {
    expect(nextStoredRef('', JSON.stringify({ref: 'old', at: now - 31 * DAY}), now)).toBeNull();
  });
  it('ignores a corrupt store', () => {
    expect(parseStoredRef('{oops', now)).toBeNull();
    expect(parseStoredRef(JSON.stringify({ref: '<x>', at: now}), now)).toBeNull();
  });
});

describe('refFromAttributes', () => {
  it('reads the cart attribute the order carries', () => {
    expect(refFromAttributes([{key: 'Consent', value: 'x'}, {key: 'affiliate_ref', value: 'mia'}])).toBe('mia');
    expect(refFromAttributes([])).toBeNull();
    expect(refFromAttributes(undefined)).toBeNull();
    expect(refFromAttributes([{key: 'affiliate_ref', value: '<b>'}])).toBeNull();
  });
});

describe('recordRefOrder', () => {
  it('adds orders and revenue per ref', () => {
    let totals = recordRefOrder({}, 'mia', 69.99, 'USD');
    totals = recordRefOrder(totals, 'mia', 30.01, 'USD');
    totals = recordRefOrder(totals, 'anna', 10, 'USD');
    expect(totals.mia).toEqual({orders: 2, revenue: 100, currencyCode: 'USD'});
    expect(totals.anna.orders).toBe(1);
  });
  it('survives a bad stored value', () => {
    expect(parseRefTotals('[1]')).toEqual({});
    expect(parseRefTotals('nope')).toEqual({});
    expect(parseRefTotals(null)).toEqual({});
  });
});
