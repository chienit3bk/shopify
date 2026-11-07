import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {pickProducts, totalCents, cartItems, sized} = require('../../extensions/storefront-blocks/assets/fbt.js');

const product = (id: number, available = true, price = 1000) => ({
  id,
  title: `P${id}`,
  url: `/products/p${id}`,
  featured_image: `//cdn/x${id}.jpg`,
  variants: [{id: id * 10, title: 'Default Title', available: false, price: 1}, {id: id * 10 + 1, title: 'Default Title', available, price}],
});

describe('pickProducts', () => {
  it('skips the current product, duplicates and sold-out products, and caps the count', () => {
    const picked = pickProducts([product(1), product(2), product(2), product(3, false), product(4), product(5)], 1, 2);
    expect(picked.map((p: {id: number}) => p.id)).toEqual([2, 4]);
  });
  it('takes the first available variant', () => {
    expect(pickProducts([product(2)], 1, 1)[0]).toMatchObject({variantId: 21, cents: 1000, variantTitle: ''});
  });
  it('copes with nothing', () => {
    expect(pickProducts(null, 1, 2)).toEqual([]);
    expect(pickProducts([null, {id: 9}], 1, 2)).toEqual([]);
  });
});

describe('set total and cart body', () => {
  const items = [{cents: 2800, variantId: '11'}, {cents: 4600, variantId: '22'}, {cents: 3200, variantId: '33'}];
  it('adds up only the ticked items', () => {
    expect(totalCents(items, [true, true, true])).toBe(10600);
    expect(totalCents(items, [true, false, true])).toBe(6000);
    expect(totalCents(items, [false, false, false])).toBe(0);
  });
  it('adds one line per ticked item', () => {
    expect(cartItems(items, [true, false, true])).toEqual([{id: 11, quantity: 1}, {id: 33, quantity: 1}]);
  });
});

describe('sized', () => {
  it('adds a width to the image url', () => {
    expect(sized('//cdn/a.jpg?v=1', 128)).toBe('//cdn/a.jpg?v=1&width=128');
    expect(sized('//cdn/a.jpg', 128)).toBe('//cdn/a.jpg?width=128');
    expect(sized(null, 128)).toBe('');
  });
});
