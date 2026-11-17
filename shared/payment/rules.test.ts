import {describe, expect, it} from 'vitest';
import {codBlocked, parsePaymentRules, paymentOperations, toPresentment, type PaymentContext, type PaymentRulesConfig} from './rules';
import demoConfig from '../../scripts/payment-rules-config.json';

const config = parsePaymentRules(demoConfig)!;

const methods = [
  {id: 'card', name: 'Credit card'},
  {id: 'paypal', name: 'PayPal'},
  {id: 'bank', name: 'Bank transfer'},
  {id: 'cod', name: 'Cash on Delivery (COD)'},
];

const ctx = (over: Partial<PaymentContext> = {}): PaymentContext => ({
  subtotal: 120,
  currencyRate: 1,
  countryCode: 'US',
  provinceCode: 'NY',
  ...over,
});

describe('demo config', () => {
  it('parses every section', () => {
    expect(config.bankTransferOnly?.minSubtotal).toBe(500);
    expect(config.cashOnDelivery?.maxSubtotal).toBe(300);
    expect(config.cashOnDelivery?.blockedRegions).toEqual([{countryCode: 'US', provinceCodes: ['AK', 'HI']}]);
    expect(config.orderByCountry).toHaveLength(2);
  });
});

describe('bank transfer only', () => {
  it('hides everything but bank transfer at the threshold and moves it first', () => {
    expect(paymentOperations(config, methods, ctx({subtotal: 500}))).toEqual([
      {type: 'hide', id: 'card'},
      {type: 'hide', id: 'paypal'},
      {type: 'hide', id: 'cod'},
      {type: 'move', id: 'bank', index: 0},
    ]);
  });

  it('does nothing to card or PayPal just under the threshold', () => {
    const ops = paymentOperations(config, methods, ctx({subtotal: 499.99}));
    expect(ops.filter((op) => op.type === 'hide')).toEqual([{type: 'hide', id: 'cod'}]);
  });

  it('never hides every method when bank transfer is not offered', () => {
    const noBank = methods.filter((m) => m.id !== 'bank');
    const ops = paymentOperations(config, noBank, ctx({subtotal: 900}));
    expect(ops.some((op) => op.type === 'hide' && op.id === 'card')).toBe(false);
  });

  it('matches names case- and space-insensitively and falls back to the second name', () => {
    const deposit = [{id: 'card', name: 'Credit card'}, {id: 'dep', name: '  bank deposit '}];
    expect(paymentOperations(config, deposit, ctx({subtotal: 600}))).toEqual([
      {type: 'hide', id: 'card'},
      {type: 'move', id: 'dep', index: 0},
    ]);
  });

  it('leaves the keep list visible', () => {
    const withKeep: PaymentRulesConfig = {version: 1, bankTransferOnly: {methods: ['Bank transfer'], minSubtotal: 500, keep: ['PayPal']}};
    expect(paymentOperations(withKeep, methods, ctx({subtotal: 700}))).toEqual([
      {type: 'hide', id: 'card'},
      {type: 'hide', id: 'cod'},
      {type: 'move', id: 'bank', index: 0},
    ]);
  });

  it('converts the shop-currency threshold to the checkout currency', () => {
    // $500 at 1.35 CAD/USD = CA$675.
    expect(paymentOperations(config, methods, ctx({subtotal: 674, currencyRate: 1.35, countryCode: 'CA', provinceCode: 'ON'})).some((op) => op.id === 'card')).toBe(false);
    expect(paymentOperations(config, methods, ctx({subtotal: 675, currencyRate: 1.35, countryCode: 'CA', provinceCode: 'ON'}))).toContainEqual({type: 'hide', id: 'card'});
  });
});

describe('cash on delivery', () => {
  it('is offered up to and including the cap', () => {
    expect(codBlocked(config, ctx({subtotal: 300}))).toBe(false);
    expect(codBlocked(config, ctx({subtotal: 300.01}))).toBe(true);
  });

  it('is hidden for Alaska and Hawaii, not for New York', () => {
    expect(codBlocked(config, ctx({provinceCode: 'AK'}))).toBe(true);
    expect(codBlocked(config, ctx({provinceCode: 'hi'}))).toBe(true);
    expect(codBlocked(config, ctx({provinceCode: 'NY'}))).toBe(false);
  });

  it('matches the province within its country only', () => {
    expect(codBlocked(config, ctx({countryCode: 'CA', provinceCode: 'AK'}))).toBe(false);
  });

  it('is not blocked by region before an address is entered', () => {
    expect(codBlocked(config, ctx({provinceCode: null}))).toBe(false);
  });

  it('a hidden COD is not moved by the country order', () => {
    expect(paymentOperations(config, methods, ctx({subtotal: 350, countryCode: 'CA', provinceCode: 'ON'}))).toEqual([{type: 'hide', id: 'cod'}]);
  });
});

describe('order by country', () => {
  it('moves the listed methods to the top for the matching country', () => {
    expect(paymentOperations(config, methods, ctx())).toEqual([{type: 'move', id: 'bank', index: 0}]);
    expect(paymentOperations(config, methods, ctx({countryCode: 'CA', provinceCode: 'ON'}))).toEqual([{type: 'move', id: 'cod', index: 0}]);
  });

  it('skips names that are missing and keeps indexes compact', () => {
    const cfg: PaymentRulesConfig = {version: 1, orderByCountry: [{countries: ['DE'], order: ['Klarna', 'PayPal', 'Credit card']}]};
    expect(paymentOperations(cfg, methods, ctx({countryCode: 'DE', provinceCode: null}))).toEqual([
      {type: 'move', id: 'paypal', index: 0},
      {type: 'move', id: 'card', index: 1},
    ]);
  });

  it('does nothing for a country with no rule', () => {
    expect(paymentOperations(config, methods, ctx({countryCode: 'GB', provinceCode: null}))).toEqual([]);
  });
});

describe('parsePaymentRules', () => {
  it('rejects missing, broken or wrong-version config', () => {
    expect(parsePaymentRules(null)).toBeNull();
    expect(parsePaymentRules('{not json')).toBeNull();
    expect(parsePaymentRules({version: 2})).toBeNull();
  });

  it('accepts a JSON string', () => {
    expect(parsePaymentRules(JSON.stringify(demoConfig))).toEqual(config);
  });

  it('drops a bad section and keeps the rest', () => {
    const parsed = parsePaymentRules({
      version: 1,
      bankTransferOnly: {methods: ['Bank transfer'], minSubtotal: '500'},
      cashOnDelivery: {methods: ['COD'], maxSubtotal: 300, blockedRegions: [{countryCode: 'US'}]},
    });
    expect(parsed).toEqual({version: 1, cashOnDelivery: {methods: ['COD'], maxSubtotal: 300}});
  });

  it('rejects negative amounts', () => {
    expect(parsePaymentRules({version: 1, cashOnDelivery: {methods: ['COD'], maxSubtotal: -1}})).toEqual({version: 1});
  });
});

describe('toPresentment', () => {
  it('rounds to cents and treats a bad rate as 1', () => {
    expect(toPresentment(500, 1.3333)).toBe(666.65);
    expect(toPresentment(500, 0)).toBe(500);
  });
});
