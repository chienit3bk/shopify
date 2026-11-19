import {describe, expect, test} from 'vitest';
import {appliesTo, chargePerUnit, parseImportChargeConfig} from './import-charge';

const good = {version: 1, variantId: 'gid://shopify/ProductVariant/9', percent: 10, countries: ['US']};

describe('parseImportChargeConfig', () => {
  test('accepts an object or a JSON string', () => {
    expect(parseImportChargeConfig(good)).toEqual(good);
    expect(parseImportChargeConfig(JSON.stringify(good))).toEqual(good);
  });

  test('upper-cases country codes', () => {
    expect(parseImportChargeConfig({...good, countries: ['us']})?.countries).toEqual(['US']);
  });

  test('rejects a missing or broken config, so no charge is added', () => {
    expect(parseImportChargeConfig(null)).toBeNull();
    expect(parseImportChargeConfig('{oops')).toBeNull();
    expect(parseImportChargeConfig({...good, version: 2})).toBeNull();
    expect(parseImportChargeConfig({...good, variantId: 'gid://shopify/Product/9'})).toBeNull();
    expect(parseImportChargeConfig({...good, percent: 0})).toBeNull();
    expect(parseImportChargeConfig({...good, percent: 150})).toBeNull();
    expect(parseImportChargeConfig({...good, countries: []})).toBeNull();
  });
});

describe('appliesTo', () => {
  const config = parseImportChargeConfig(good)!;
  test('only the listed countries', () => {
    expect(appliesTo(config, 'US')).toBe(true);
    expect(appliesTo(config, 'GB')).toBe(false);
    expect(appliesTo(config, 'CA')).toBe(false);
    expect(appliesTo(config, null)).toBe(false);
  });
});

describe('chargePerUnit', () => {
  test('10% of the unit price, to the cent', () => {
    expect(chargePerUnit(48, 10)).toBe(4.8);
    expect(chargePerUnit(49.99, 10)).toBe(5);
    expect(chargePerUnit(24.95, 10)).toBe(2.5);
    expect(chargePerUnit(0.04, 10)).toBe(0);
    expect(chargePerUnit(0, 10)).toBe(0);
  });

  test('other rates', () => {
    expect(chargePerUnit(100, 12.5)).toBe(12.5);
    expect(chargePerUnit(19.99, 7)).toBe(1.4);
  });
});
