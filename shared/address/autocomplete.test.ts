import {describe, expect, test} from 'vitest';
import {type AddressProvider, DEMO_ADDRESSES, MAX_SUGGESTIONS, createStaticProvider, matchedSubstring, safeSuggest} from './autocomplete';

const provider = createStaticProvider();

describe('static provider', () => {
  test('suggests by street, highlights the match, limits to the buyer country', async () => {
    const rows = await safeSuggest(provider, {field: 'address1', value: '350', countryCode: 'US'});
    expect(rows.map((r) => r.id)).toEqual(['a1', 'a2', 'a3']);
    expect(rows[0].label).toBe('350 5th Ave, New York, NY 10118');
    expect(rows[0].matchedSubstrings).toEqual([{offset: 0, length: 3}]);
    expect(rows[0].formattedAddress).toBeUndefined();
  });

  test('suggests by ZIP prefix when the form has no street-first field', async () => {
    const rows = await safeSuggest(provider, {field: 'zip', value: '787', countryCode: 'US'});
    expect(rows.map((r) => r.id)).toEqual(['a6']);
  });

  test('too-short queries and other countries return nothing', async () => {
    expect(await safeSuggest(provider, {field: 'address1', value: '35'})).toEqual([]);
    expect(await safeSuggest(provider, {field: 'address1', value: 'Queen', countryCode: 'US'})).toEqual([]);
    expect((await safeSuggest(provider, {field: 'address1', value: 'Queen', countryCode: 'CA'})).length).toBe(1);
  });

  test('resolve returns the whole address without the internal id', () => {
    expect(provider.resolve('a2')).toEqual({address1: '350 Mission St', city: 'San Francisco', provinceCode: 'CA', zip: '94105', countryCode: 'US'});
    expect(provider.resolve('nope')).toBeUndefined();
  });
});

describe('safeSuggest', () => {
  test('a throwing provider means no suggestions, not a broken checkout', async () => {
    const broken: AddressProvider = {suggest: () => { throw new Error('quota'); }, resolve: () => undefined};
    expect(await safeSuggest(broken, {field: 'address1', value: 'abc'})).toEqual([]);
    const rejecting: AddressProvider = {suggest: () => Promise.reject(new Error('503')), resolve: () => undefined};
    expect(await safeSuggest(rejecting, {field: 'address1', value: 'abc'})).toEqual([]);
  });

  test('never more than the five rows checkout shows', async () => {
    const many: AddressProvider = {
      suggest: () => DEMO_ADDRESSES.concat(DEMO_ADDRESSES).map((a, i) => ({id: String(i), label: a.address1 ?? ''})),
      resolve: () => undefined,
    };
    expect((await safeSuggest(many, {field: 'address1', value: 'abc'})).length).toBe(MAX_SUGGESTIONS);
  });
});

test('matchedSubstring is case-insensitive and empty for no match', () => {
  expect(matchedSubstring('350 Mission St', 'MISSION')).toEqual([{offset: 4, length: 7}]);
  expect(matchedSubstring('350 Mission St', 'zzz')).toEqual([]);
});
