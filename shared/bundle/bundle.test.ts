import {describe, expect, test} from 'vitest';
import {type BundleComponent, parseBundleConfig, priceComponents} from './bundle';

const v = (n: number) => `gid://shopify/ProductVariant/${n}`;
const routine: BundleComponent[] = [
  {variantId: v(1), quantity: 1, weight: 24},
  {variantId: v(2), quantity: 1, weight: 48},
  {variantId: v(3), quantity: 1, weight: 52},
];
const total = (priced: ReturnType<typeof priceComponents>) =>
  Math.round(priced.reduce((sum, p) => sum + p.unitPrice * p.quantity * 100, 0)) / 100;

describe('priceComponents', () => {
  test('splits the bundle price by list price and adds up exactly', () => {
    const priced = priceComponents(99, routine);
    expect(priced.map((p) => p.unitPrice)).toEqual([19.17, 38.32, 41.51]);
    expect(total(priced)).toBe(99);
  });

  test('works in any currency: only the ratios matter', () => {
    expect(total(priceComponents(91.35, routine))).toBe(91.35);
    expect(total(priceComponents(0.05, routine))).toBe(0.05);
  });

  test('multi-unit components still add up when one component has quantity 1', () => {
    const priced = priceComponents(50, [
      {variantId: v(1), quantity: 3, weight: 9},
      {variantId: v(2), quantity: 1, weight: 28},
    ]);
    expect(total(priced)).toBe(50);
  });

  test('nothing to split → no components', () => {
    expect(priceComponents(99, [])).toEqual([]);
    expect(priceComponents(99, [{variantId: v(1), quantity: 1, weight: 0}])).toEqual([]);
  });
});

describe('parseBundleConfig', () => {
  test('accepts the demo shape, rejects one-item bundles and bad ids', () => {
    expect(parseBundleConfig(JSON.stringify({version: 1, components: routine}))?.components).toEqual(routine);
    expect(parseBundleConfig({version: 1, components: routine.slice(0, 1)})).toBeNull();
    expect(parseBundleConfig({version: 1, components: [...routine, {variantId: 'x', quantity: 1, weight: 1}]})).toBeNull();
    expect(parseBundleConfig({version: 1, components: [...routine, {variantId: v(4), quantity: 0, weight: 1}]})).toBeNull();
    expect(parseBundleConfig('nope')).toBeNull();
  });
});
