import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { freeShippingStatus, type FreeShippingConfig } from '../shipping/free-shipping';

const require = createRequire(import.meta.url);
const { nextTabIndex, cartErrorMessage, cartAddUrl } = require('../../extensions/storefront-blocks/assets/storefront-blocks.js');
const { findVariant, optionStates, parseColorMap, swatchColor, pastButton } = require('../../extensions/storefront-blocks/assets/product-pack.js');
const { formatMoney, freeShippingProgress, pickProducts, quickAddVariant, imageAtWidth } = require('../../extensions/storefront-blocks/assets/cart-pack.js');

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

const lipOil = [
  { id: 1, options: ['Clear', '8 ml'], available: true },
  { id: 2, options: ['Coral', '8 ml'], available: false },
  { id: 3, options: ['Coral', '15 ml'], available: true },
  { id: 4, options: ['Clear', '15 ml'], available: true },
];

describe('optionStates', () => {
  it('marks a value sold out for the current size only', () => {
    expect(optionStates(lipOil, ['Clear', '8 ml'], 0, ['Clear', 'Coral'])).toEqual([
      { value: 'Clear', exists: true, available: true },
      { value: 'Coral', exists: true, available: false },
    ]);
    expect(optionStates(lipOil, ['Clear', '15 ml'], 0, ['Coral'])[0].available).toBe(true);
  });
  it('marks a combination that was never created', () => {
    expect(optionStates(lipOil, ['Clear', '15 ml'], 0, ['Berry'])).toEqual([{ value: 'Berry', exists: false, available: false }]);
  });
});

describe('findVariant', () => {
  it('needs every option to match', () => {
    expect(findVariant(lipOil, ['Coral', '15 ml']).id).toBe(3);
    expect(findVariant(lipOil, ['Berry', '15 ml'])).toBeNull();
  });
});

describe('parseColorMap', () => {
  it('reads one color per line, any case', () => {
    expect(parseColorMap('Rose: #c9808a\n berry : #7B1E3A')).toEqual({ rose: '#c9808a', berry: '#7B1E3A' });
  });
  it('drops anything that is not a hex color', () => {
    expect(parseColorMap('Rose: red\nBad: #fff;background:url(x)\nnothing\n: #fff')).toEqual({});
    expect(parseColorMap(undefined)).toEqual({});
  });
});

describe('swatchColor', () => {
  it("prefers Shopify's own swatch, then the map", () => {
    expect(swatchColor('Rose', '#111111', { rose: '#222222' })).toBe('#111111');
    expect(swatchColor(' Rose', '', { rose: '#222222' })).toBe('#222222');
    expect(swatchColor('Rose', '', {})).toBeNull();
  });
});

describe('pastButton', () => {
  it('is false before the buyer reaches the button', () => {
    expect(pastButton({ bottom: 1200 })).toBe(false);
  });
  it('is true once the button has left the top of the screen', () => {
    expect(pastButton({ bottom: -4 })).toBe(true);
    expect(pastButton({ bottom: 0 })).toBe(true);
  });
});

describe('formatMoney', () => {
  it('follows the shop format', () => {
    expect(formatMoney(1900, '${{amount}}')).toBe('$19.00');
    expect(formatMoney(123456, '{{ amount_with_comma_separator }} €')).toBe('1.234,56 €');
    expect(formatMoney(123456, '{{amount_no_decimals}} kr')).toBe('1,235 kr');
  });
});

describe('freeShippingProgress', () => {
  const config: FreeShippingConfig = {
    version: 1,
    currencyCode: 'USD',
    amount: 120,
    amounts: { EUR: 110 },
    methods: ['Express'],
    excludedProductIds: ['gid://shopify/Product/9'],
    label: 'Free Express shipping',
  };
  const line = (productId: number, cents: number, gift = false) => ({
    product_id: productId,
    original_line_price: cents,
    properties: gift ? { _free_gift: 'rule' } : {},
  });
  const carts = [
    { currency: 'USD', items: [line(1, 8600)] },
    { currency: 'USD', items: [line(1, 12000)] },
    { currency: 'USD', items: [line(1, 11999), line(9, 5000)] },
    { currency: 'USD', items: [line(1, 4800), line(2, 0, true)] },
    { currency: 'EUR', items: [line(1, 9000)] },
    { currency: 'CAD', items: [line(1, 9000)] },
  ];

  it.each(carts)('matches the rule the Function runs: %j', (cart) => {
    const lines = cart.items.map((item) => ({
      productId: `gid://shopify/Product/${item.product_id}`,
      subtotal: item.original_line_price / 100,
      isGift: Boolean(item.properties._free_gift),
    }));
    expect(freeShippingProgress(config, cart, 1.35)).toEqual(
      freeShippingStatus(config, { currencyCode: cart.currency, rate: 1.35, lines }),
    );
  });
  it('hides the bar when the currency rate is unknown', () => {
    expect(freeShippingProgress(config, carts[5]).threshold).toBeNull();
  });
});

describe('pickProducts', () => {
  const product = (id: number, extra = {}) => ({ id, available: true, tags: [], ...extra });
  it('keeps recommendations first, then fills from the fallback', () => {
    const picked = pickProducts([[product(2)], [product(3), product(2), null]], { limit: 4 });
    expect(picked.map((p: { id: number }) => p.id)).toEqual([2, 3]);
  });
  it('skips the current product, sold-out products and the excluded tag', () => {
    const list = [product(1), product(2, { available: false }), product(3, { tags: ['No-Recommend'] }), product(4)];
    const picked = pickProducts([list], { skipIds: ['1'], excludeTag: 'no-recommend', limit: 4 });
    expect(picked.map((p: { id: number }) => p.id)).toEqual([4]);
  });
  it('stops at the limit', () => {
    expect(pickProducts([[product(1), product(2), product(3)]], { limit: 2 })).toHaveLength(2);
  });
});

describe('quickAddVariant', () => {
  it('only adds a product with one buyable variant', () => {
    expect(quickAddVariant({ variants: [{ id: 7, available: true }] })).toBe(7);
    expect(quickAddVariant({ variants: [{ id: 7, available: false }] })).toBeNull();
    expect(quickAddVariant({ variants: [{ id: 7, available: true }, { id: 8, available: true }] })).toBeNull();
  });
});

describe('imageAtWidth', () => {
  it('handles protocol-relative urls and existing queries', () => {
    expect(imageAtWidth('//cdn.shopify.com/a.jpg?v=1', 120)).toBe('https://cdn.shopify.com/a.jpg?v=1&width=120');
    expect(imageAtWidth('https://cdn.shopify.com/a.jpg', 120)).toBe('https://cdn.shopify.com/a.jpg?width=120');
    expect(imageAtWidth(null, 120)).toBe('');
  });
});
