import {describe, expect, test} from 'vitest';
import {type AddressRulesConfig, addressProblems, hasHouseNumber, parseAddressRulesConfig, statesForZip} from './rules';

const config: AddressRulesConfig = {countries: ['US', 'CA'], requireHouseNumber: true, allowPoBox: false, checkZipState: true};
const good = {address1: '350 5th Ave', zip: '10118', provinceCode: 'NY', countryCode: 'US'};

describe('hasHouseNumber', () => {
  test.each([['123 Main St', true], ['12B Baker St', true], ['Rural Route 2 Box 5', true], ['RR 1', true], ['Main Street', false], ['Apt 5 Main St', false]])(
    '%s -> %s',
    (line, expected) => expect(hasHouseNumber(line)).toBe(expected),
  );
});

describe('statesForZip', () => {
  test('maps 3-digit prefixes, ZIP+4 too', () => {
    expect(statesForZip('10118')).toEqual(['NY']);
    expect(statesForZip('94105-1234')).toEqual(['CA']);
    expect(statesForZip('02134')).toEqual(['MA']);
    expect(statesForZip('55101')).toEqual(['MN']);
    expect(statesForZip('73301')).toEqual(['TX']);
  });
  test('unknown or malformed -> []', () => {
    expect(statesForZip('00601')).toEqual([]);
    expect(statesForZip('M5H 2N2')).toEqual([]);
    expect(statesForZip('1011')).toEqual([]);
  });
});

describe('addressProblems', () => {
  test('a good address has none', () => expect(addressProblems(config, good)).toEqual([]));

  test('missing house number', () => {
    expect(addressProblems(config, {...good, address1: 'Fifth Ave'})).toEqual([{type: 'no_house_number'}]);
  });

  test('PO Box blocked unless allowed; no double message with the house-number rule', () => {
    expect(addressProblems(config, {...good, address1: 'PO Box 12'})).toEqual([{type: 'po_box'}]);
    expect(addressProblems(config, {...good, address1: '1 Main St', address2: 'P.O. Box 9'})).toEqual([{type: 'po_box'}]);
    expect(addressProblems({...config, allowPoBox: true}, {...good, address1: 'PO Box 12'})).toEqual([]);
  });

  test('ZIP in another state', () => {
    expect(addressProblems(config, {...good, provinceCode: 'CA'})).toEqual([
      {type: 'zip_state_mismatch', zip: '10118', provinceCode: 'CA', expected: ['NY']},
    ]);
  });

  test('both problems are reported together', () => {
    expect(addressProblems(config, {address1: 'Fifth Ave', zip: '10118', provinceCode: 'CA', countryCode: 'US'}).map((p) => p.type)).toEqual([
      'no_house_number',
      'zip_state_mismatch',
    ]);
  });

  test('never blocks what it cannot judge', () => {
    expect(addressProblems(config, {...good, address1: ''})).toEqual([]);
    expect(addressProblems(config, {...good, address1: null, zip: null})).toEqual([]);
    expect(addressProblems(config, {...good, zip: '00601', provinceCode: 'PR'})).toEqual([]);
    expect(addressProblems(config, {address1: 'Hauptstrasse', countryCode: 'DE'})).toEqual([]);
    expect(addressProblems(config, {address1: 'Fifth Ave'})).toEqual([]);
    expect(addressProblems(config, {address1: 'King St W', countryCode: 'CA', zip: 'M5H 2N2', provinceCode: 'ON'})).toEqual([{type: 'no_house_number'}]);
  });

  test('toggles', () => {
    const off = {...config, requireHouseNumber: false, checkZipState: false};
    expect(addressProblems(off, {...good, address1: 'Fifth Ave', provinceCode: 'CA'})).toEqual([]);
  });
});

describe('parseAddressRulesConfig', () => {
  test('defaults: US + CA, strict', () => {
    expect(parseAddressRulesConfig({})).toEqual({countries: ['US', 'CA'], requireHouseNumber: true, allowPoBox: false, checkZipState: true});
  });
  test('no config -> null (Function does nothing)', () => {
    expect(parseAddressRulesConfig(null)).toBeNull();
    expect(parseAddressRulesConfig('x')).toBeNull();
  });
  test('countries are upper-cased', () => expect(parseAddressRulesConfig({countries: ['us']})?.countries).toEqual(['US']));
});
