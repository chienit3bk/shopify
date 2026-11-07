import {describe, expect, it} from 'vitest';
import {
  type ExperimentStats,
  assignmentFromCheckout,
  chooseVariant,
  emptyAbState,
  forcedVariant,
  parseAbState,
  parseAssignment,
  pValue,
  readVariant,
  recordAbEvent,
  verdict,
} from './test';

const stats = (a: [number, number, number], b: [number, number, number]): ExperimentStats => ({
  A: {views: a[0], carts: a[1], orders: a[2], revenue: {}},
  B: {views: b[0], carts: b[1], orders: b[2], revenue: {}},
});

describe('parseAssignment', () => {
  it('reads experiment:variant', () => expect(parseAssignment('pdp-trust:B')).toEqual({experiment: 'pdp-trust', variant: 'B'}));
  it.each(['pdp:C', 'pdp', ':A', 'PDP trust:A', 'a:b:A', '', null, 7])('drops %s', (raw) => expect(parseAssignment(raw)).toBeNull());
});

describe('chooseVariant', () => {
  it('splits on the random draw', () => {
    expect(chooseVariant('x', null, null, 0.49)).toBe('A');
    expect(chooseVariant('x', null, null, 0.5)).toBe('B');
  });
  it('keeps the stored variant of the same experiment, whatever the draw', () => {
    expect(chooseVariant('x', 'x:B', null, 0.1)).toBe('B');
  });
  it('draws again for a different experiment', () => {
    expect(chooseVariant('y', 'x:B', null, 0.1)).toBe('A');
  });
  it('lets ?ab= force a variant', () => {
    expect(forcedVariant('?ab=B')).toBe('B');
    expect(forcedVariant('?ab=Z')).toBeNull();
    expect(chooseVariant('x', 'x:A', 'B', 0.1)).toBe('B');
  });
  it('is close to 50/50 over many visitors', () => {
    let b = 0;
    for (let i = 0; i < 10_000; i++) if (chooseVariant('x', null, null, (i + 0.5) / 10_000) === 'B') b++;
    expect(b).toBe(5000);
  });
});

describe('recordAbEvent', () => {
  const a = {experiment: 'x', variant: 'A' as const};
  it('counts per variant and sums revenue per currency', () => {
    let s = emptyAbState();
    s = recordAbEvent(s, a, 'view');
    s = recordAbEvent(s, a, 'cart');
    s = recordAbEvent(s, a, 'order', {subtotal: 40.1, currencyCode: 'USD'});
    s = recordAbEvent(s, a, 'order', {subtotal: 10.2, currencyCode: 'USD'});
    s = recordAbEvent(s, a, 'order', {subtotal: 5, currencyCode: 'EUR'});
    s = recordAbEvent(s, {...a, variant: 'B'}, 'view');
    expect(s.experiments.x.A).toEqual({views: 1, carts: 1, orders: 3, revenue: {USD: 50.3, EUR: 5}});
    expect(s.experiments.x.B.views).toBe(1);
  });
  it('survives a storage round trip and ignores junk', () => {
    const s = recordAbEvent(emptyAbState(), a, 'view');
    expect(parseAbState(JSON.stringify(s))).toEqual(s);
    expect(parseAbState('oops')).toEqual(emptyAbState());
    expect(parseAbState({version: 2})).toEqual(emptyAbState());
  });
});

describe('assignmentFromCheckout', () => {
  it('prefers the order attribute over the cookie', () => {
    expect(assignmentFromCheckout([{key: 'ab_test', value: 'x:A'}], 'x:B')?.variant).toBe('A');
    expect(assignmentFromCheckout([], 'x:B')?.variant).toBe('B');
    expect(assignmentFromCheckout(undefined, undefined)).toBeNull();
  });
});

describe('readout', () => {
  it('computes rates and handles zero views', () => {
    expect(readVariant({views: 200, carts: 20, orders: 10, revenue: {}})).toMatchObject({conversion: 0.05, cartRate: 0.1});
    expect(readVariant({views: 0, carts: 0, orders: 0, revenue: {}}).conversion).toBe(0);
  });
  it('p-value matches a known two-proportion case', () => {
    // 100/1000 vs 130/1000: z = 2.1, two-sided p ≈ 0.036
    expect(pValue(100, 1000, 130, 1000)).toBeCloseTo(0.0357, 3);
    expect(pValue(10, 0, 5, 100)).toBeNull();
  });
  it('keeps collecting under 100 views a variant', () => {
    expect(verdict(stats([99, 9, 9], [500, 50, 90])).status).toBe('collecting');
  });
  it('calls a winner only when the difference is significant', () => {
    expect(verdict(stats([1000, 200, 100], [1000, 220, 130]))).toMatchObject({status: 'winner', winner: 'B'});
    expect(verdict(stats([1000, 200, 100], [1000, 200, 105]))).toMatchObject({status: 'no-difference', winner: null});
  });
});
