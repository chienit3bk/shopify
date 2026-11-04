import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { nextTabIndex, cartErrorMessage, cartAddUrl } = require('../../extensions/storefront-blocks/assets/storefront-blocks.js');

describe('nextTabIndex', () => {
  it('wraps with the arrow keys', () => {
    expect(nextTabIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(nextTabIndex(0, 'ArrowLeft', 3)).toBe(2);
  });
  it('jumps with Home and End', () => {
    expect(nextTabIndex(1, 'Home', 3)).toBe(0);
    expect(nextTabIndex(1, 'End', 3)).toBe(2);
  });
  it('ignores other keys', () => {
    expect(nextTabIndex(1, 'a', 3)).toBe(1);
  });
});

describe('cartErrorMessage', () => {
  it('prefers the description from /cart/add.js', () => {
    expect(cartErrorMessage({ description: 'Sold out', message: 'Cart Error' }, 'Fallback')).toBe('Sold out');
  });
  it('falls back when the body has no message', () => {
    expect(cartErrorMessage({}, 'Fallback')).toBe('Fallback');
    expect(cartErrorMessage(null, 'Fallback')).toBe('Fallback');
  });
});

describe('cartAddUrl', () => {
  it('keeps the market route root', () => {
    expect(cartAddUrl('/en-de/')).toBe('/en-de/cart/add.js');
    expect(cartAddUrl(undefined)).toBe('/cart/add.js');
  });
});
