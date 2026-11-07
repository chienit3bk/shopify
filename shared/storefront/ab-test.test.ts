import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {AB_ATTRIBUTE, AB_COOKIE, AB_EVENT, MIN_VIEWS, chooseVariant, cleanExperiment, forcedVariant, parseAssignment, pValue, verdict} from '../ab/test';

const require = createRequire(import.meta.url);
const split = require('../../extensions/storefront-blocks/assets/ab-test.js');
const results = require('../../extensions/storefront-blocks/assets/ab-results.js');

describe('ab-test.js keeps the rules of shared/ab/test.ts', () => {
  it('uses the names the pixel reads', () => {
    expect([split.COOKIE, split.ATTRIBUTE, split.EVENT]).toEqual([AB_COOKIE, AB_ATTRIBUTE, AB_EVENT]);
  });
  it('cleans ids and parses assignments the same way', () => {
    for (const v of ['pdp-trust', ' PDP ', 'a b', '', 'x'.repeat(33), '-x']) expect(split.cleanExperiment(v)).toBe(cleanExperiment(v));
    for (const v of ['x:A', 'x:C', 'x', 'x:A:B', null]) expect(split.parseAssignment(v)).toEqual(parseAssignment(v));
  });
  it('chooses the same variant', () => {
    for (const stored of [null, 'x:A', 'x:B', 'y:B', 'junk']) {
      for (const forced of [null, 'A', 'B'] as const) {
        for (const random of [0, 0.49, 0.5, 0.99]) expect(split.chooseVariant('x', stored, forced, random)).toBe(chooseVariant('x', stored, forced, random));
      }
    }
    for (const search of ['?ab=A', '?ab=B', '?ab=c', '']) expect(split.forcedVariant(search)).toBe(forcedVariant(search));
  });
});

describe('ab-results.js keeps the readout of shared/ab/test.ts', () => {
  const stats = (a: number[], b: number[]) => ({A: {views: a[0], carts: a[1], orders: a[2], revenue: {}}, B: {views: b[0], carts: b[1], orders: b[2], revenue: {}}});
  it('computes the same p-value and verdict', () => {
    expect(results.MIN_VIEWS).toBe(MIN_VIEWS);
    expect(results.pValue(100, 1000, 130, 1000)).toBeCloseTo(pValue(100, 1000, 130, 1000) as number, 10);
    for (const s of [stats([99, 5, 5], [500, 50, 90]), stats([1000, 200, 100], [1000, 220, 130]), stats([1000, 200, 100], [1000, 200, 105]), stats([200, 1, 0], [200, 1, 0])]) {
      expect(results.verdict(s)).toEqual(verdict(s));
    }
  });
});
