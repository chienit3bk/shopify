import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {pickState, bundleSummary, cartItems} = require('../../extensions/storefront-blocks/assets/bundle-builder.js');

describe('pickState', () => {
  it('is complete at exactly the bundle size, and full from then on', () => {
    expect(pickState([1, 1, 0], 3)).toEqual({picked: 2, full: false, complete: false});
    expect(pickState([1, 1, 1], 3)).toEqual({picked: 3, full: true, complete: true});
  });
});

describe('bundleSummary', () => {
  it('shows what the bundle saves against the list price', () => {
    expect(bundleSummary([1, 1, 1], [2400, 4800, 5200], 6900)).toEqual({list: 12400, save: 5500});
  });
  it('never shows a negative saving', () => {
    expect(bundleSummary([3, 0, 0], [2000, 4800, 5200], 6900).save).toBe(0);
  });
});

describe('cartItems', () => {
  it('adds one line per picked item with the same group property', () => {
    expect(cartItems([2, 0, 1], ['11', '22', '33'], 'g1')).toEqual([
      {id: 11, quantity: 2, properties: {_builder: 'g1'}},
      {id: 33, quantity: 1, properties: {_builder: 'g1'}},
    ]);
  });
});
