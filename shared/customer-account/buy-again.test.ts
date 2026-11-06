import {describe, expect, it} from 'vitest';
import {cartUrl, pickBuyAgain, type OrderLine} from './buy-again';

const line = (id: number | null, over: Partial<OrderLine> = {}): OrderLine => ({
  title: `Item ${id}`,
  quantity: 1,
  variantId: id === null ? null : `gid://shopify/ProductVariant/${id}`,
  totalPrice: {amount: '20.0'},
  ...over,
});
const order = (...nodes: OrderLine[]) => ({lineItems: {nodes}});

describe('pickBuyAgain', () => {
  it('keeps the newest order first', () => {
    const items = pickBuyAgain([order(line(1)), order(line(2))]);
    expect(items.map((i) => i.title)).toEqual(['Item 1', 'Item 2']);
  });

  it('shows a repeated variant once, with its newest quantity', () => {
    const items = pickBuyAgain([order(line(1, {quantity: 3})), order(line(1, {quantity: 9}))]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it('skips deleted variants', () => {
    expect(pickBuyAgain([order(line(null))])).toEqual([]);
  });

  it('skips free lines such as gifts', () => {
    expect(pickBuyAgain([order(line(1, {totalPrice: {amount: '0.0'}}))])).toEqual([]);
  });

  it('skips lines with no quantity left', () => {
    expect(pickBuyAgain([order(line(1, {quantity: 0}))])).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(pickBuyAgain([order(line(1), line(2), line(3))], 2)).toHaveLength(2);
  });

  it('hides the placeholder variant title but keeps real ones', () => {
    const [plain, sized] = pickBuyAgain([
      order(line(1, {variantTitle: 'Default Title'}), line(2, {variantTitle: '50 ml'})),
    ]);
    expect(plain.variantTitle).toBeNull();
    expect(sized.variantTitle).toBe('50 ml');
  });

  it('falls back to the title for image alt text', () => {
    const [item] = pickBuyAgain([order(line(1, {image: {url: 'https://x/y.jpg'}}))]);
    expect(item.imageAlt).toBe('Item 1');
    expect(item.imageUrl).toBe('https://x/y.jpg');
  });

  it('returns nothing for a customer with no orders', () => {
    expect(pickBuyAgain([])).toEqual([]);
  });
});

describe('cartUrl', () => {
  it('builds a permalink from the variant gid', () => {
    const [item] = pickBuyAgain([order(line(42, {quantity: 2}))]);
    expect(cartUrl('https://shop.example/', item)).toBe('https://shop.example/cart/42:2');
  });
});
