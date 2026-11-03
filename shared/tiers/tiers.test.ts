import {describe, expect, test} from 'vitest';
import {type TiersConfig, isOnSale, parseTiersConfig, spendExclusion, spendProgress, volumeProgress} from './tiers';

const config: TiersConfig = {
  version: 1,
  currencyCode: 'USD',
  volume: {
    productIds: ['mask'],
    tiers: [
      {minQuantity: 4, percent: 10},
      {minQuantity: 2, percent: 5},
      {minQuantity: 6, percent: 15},
    ],
    label: 'Stock up & save',
  },
  spend: {
    tiers: [
      {amount: 100, amounts: {EUR: 90}, percent: 5},
      {amount: 150, amounts: {EUR: 140}, percent: 10},
    ],
    label: 'Spend more, save more',
    excludedProductIds: [],
    excludeOnSale: false,
    excludeGiftCards: false,
  },
};

describe('volumeProgress', () => {
  test('current and next tier at each quantity (tiers given out of order)', () => {
    const at = (q: number) => {
      const p = volumeProgress(config.volume!.tiers, q);
      return [p.current?.percent ?? 0, p.next?.minQuantity ?? null];
    };
    expect([1, 2, 3, 4, 5, 6, 9].map(at)).toEqual([
      [0, 2],
      [5, 4],
      [5, 4],
      [10, 6],
      [10, 6],
      [15, null],
      [15, null],
    ]);
  });
});

describe('spendProgress', () => {
  test('below, between and above the tiers', () => {
    expect(spendProgress(config, 80, 'USD')).toMatchObject({current: null, next: {percent: 5, remaining: 20}});
    expect(spendProgress(config, 120, 'USD')).toMatchObject({current: {percent: 5}, next: {percent: 10, remaining: 30}});
    expect(spendProgress(config, 150, 'USD')).toMatchObject({current: {percent: 10}, next: null});
  });

  test('market amounts win; unknown currency without a rate has no tiers', () => {
    expect(spendProgress(config, 95, 'EUR')).toMatchObject({current: {percent: 5}, next: {remaining: 45}});
    expect(spendProgress(config, 500, 'CAD')).toEqual({current: null, next: null});
    expect(spendProgress(config, 140, 'CAD', 1.4)).toMatchObject({current: {percent: 5, threshold: 140}});
  });
});

describe('spendExclusion', () => {
  const spend = {...config.spend!, excludedProductIds: ['oil'], excludeOnSale: true, excludeGiftCards: true};
  test('gift, gift card, sale and listed products are left out; everything else counts', () => {
    expect(spendExclusion(spend, {productId: 'serum', isGift: false})).toBeNull();
    expect(spendExclusion(spend, {productId: 'bag', isGift: true})).toBe('gift');
    expect(spendExclusion(spend, {productId: 'card', isGift: false, isGiftCard: true})).toBe('gift_card');
    expect(spendExclusion(spend, {productId: 'konjac', isGift: false, onSale: true})).toBe('sale');
    expect(spendExclusion(spend, {productId: 'oil', isGift: false})).toBe('excluded');
  });

  test('flags off: sale items and gift cards count like anything else', () => {
    expect(spendExclusion(config.spend!, {productId: 'konjac', isGift: false, onSale: true, isGiftCard: true})).toBeNull();
  });

  test('on sale means compare-at above price', () => {
    expect(isOnSale(18, 24)).toBe(true);
    expect(isOnSale(18, 18)).toBe(false);
    expect(isOnSale(18, null)).toBe(false);
  });
});

describe('parseTiersConfig', () => {
  test('accepts the demo config, rejects bad percents and empty tiers', () => {
    expect(parseTiersConfig(JSON.stringify(config))).toEqual(config);
    expect(parseTiersConfig({...config, volume: {...config.volume, tiers: [{minQuantity: 2, percent: 120}]}})).toBeNull();
    expect(parseTiersConfig({...config, spend: {...config.spend, tiers: []}})).toBeNull();
    expect(parseTiersConfig({...config, volume: null, spend: null})).toEqual({...config, volume: null, spend: null});
  });
});
