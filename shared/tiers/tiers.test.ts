import {describe, expect, test} from 'vitest';
import {codesToReject, type TiersConfig, isOnSale, parseTiersConfig, spendExclusion, spendProgress, volumeProgress, volumeRuleFor} from './tiers';

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

describe('volumeRuleFor', () => {
  const many: TiersConfig = {
    ...config,
    volumeRules: [
      {productIds: ['patches'], tiers: [{minQuantity: 3, percent: 10}], label: 'Patch pack'},
      {productIds: ['mask', 'lip'], tiers: [{minQuantity: 2, percent: 50}], label: 'Never used: mask is in volume'},
    ],
  };
  test('first matching rule wins; products without a rule get none', () => {
    expect(volumeRuleFor(many, 'mask')?.label).toBe('Stock up & save');
    expect(volumeRuleFor(many, 'patches')?.label).toBe('Patch pack');
    expect(volumeRuleFor(many, 'lip')?.label).toBe('Never used: mask is in volume');
    expect(volumeRuleFor(many, 'serum')).toBeNull();
  });

  test('40 rules parse, and one broken rule is dropped without the others', () => {
    const rules = Array.from({length: 40}, (_, i) => ({productIds: [`p${i}`], tiers: [{minQuantity: 2, percent: 5}], label: `Rule ${i}`}));
    const parsed = parseTiersConfig({...config, volumeRules: [...rules, {productIds: ['x'], tiers: [], label: 'broken'}]});
    expect(parsed?.volumeRules).toHaveLength(40);
    expect(volumeRuleFor(parsed!, 'p39')?.label).toBe('Rule 39');
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

describe('codesToReject', () => {
  const rule = {message: 'Codes can\'t be used on sale items.', allowedCodes: ['STAFF20']};

  test('rejects entered codes when the cart has a sale item', () => {
    expect(codesToReject(rule, [{code: 'WELCOME10', rejectable: true}], true)).toEqual(['WELCOME10']);
  });
  test('keeps codes when nothing is on sale', () => {
    expect(codesToReject(rule, [{code: 'WELCOME10', rejectable: true}], false)).toEqual([]);
  });
  test('never returns a code that is not rejectable', () => {
    expect(codesToReject(rule, [{code: 'WELCOME10', rejectable: false}], true)).toEqual([]);
  });
  test('keeps allowed codes, in any case', () => {
    expect(codesToReject(rule, [{code: 'staff20', rejectable: true}], true)).toEqual([]);
  });
  test('does nothing without a rule', () => {
    expect(codesToReject(undefined, [{code: 'WELCOME10', rejectable: true}], true)).toEqual([]);
  });
});

describe('parseTiersConfig rejectCodes', () => {
  const base = {version: 1, currencyCode: 'USD', volume: null, spend: null};

  test('keeps a valid rule', () => {
    expect(parseTiersConfig({...base, rejectCodes: {message: 'No codes'}})?.rejectCodes).toEqual({message: 'No codes', allowedCodes: []});
  });
  test('drops a rule without a message and keeps the rest of the config', () => {
    const config = parseTiersConfig({...base, rejectCodes: {}});
    expect(config).not.toBeNull();
    expect(config?.rejectCodes).toBeUndefined();
  });
});
