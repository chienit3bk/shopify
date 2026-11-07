import {describe, expect, it} from 'vitest';
import {type BuilderConfig, type BuilderLine, parseBuilderConfig, planBuilderMerges} from './builder';

const config: BuilderConfig = {
  version: 1,
  parentVariantId: 'gid://shopify/ProductVariant/1',
  title: 'Build your own Ritual Set',
  size: 3,
  price: 69,
  productIds: ['gid://shopify/Product/10', 'gid://shopify/Product/20', 'gid://shopify/Product/30'],
};

const line = (id: string, productId: number, unitPrice: number, quantity = 1, group: string | null = 'g1'): BuilderLine => ({
  id: `gid://shopify/CartLine/${id}`,
  quantity,
  unitPrice,
  productId: `gid://shopify/Product/${productId}`,
  group,
});

describe('planBuilderMerges', () => {
  it('merges a complete group at the percent that lands on the bundle price', () => {
    const [merge] = planBuilderMerges([line('1', 10, 24), line('2', 20, 48), line('3', 30, 52)], config);
    // list 124 → 69 means 44.3548% off
    expect(merge.percentageDecrease).toBeCloseTo(44.3548, 4);
    expect(124 * (1 - merge.percentageDecrease / 100)).toBeCloseTo(69, 2);
    expect(merge.lines).toHaveLength(3);
  });

  it('counts a repeated pick as units of one line', () => {
    const [merge] = planBuilderMerges([line('1', 10, 24, 2), line('2', 20, 48)], config);
    expect(merge.lines).toEqual([
      {cartLineId: 'gid://shopify/CartLine/1', quantity: 2},
      {cartLineId: 'gid://shopify/CartLine/2', quantity: 1},
    ]);
    expect(96 * (1 - merge.percentageDecrease / 100)).toBeCloseTo(69, 2);
  });

  it('leaves an incomplete bundle at list price', () => {
    expect(planBuilderMerges([line('1', 10, 24), line('2', 20, 48)], config)).toEqual([]);
  });

  it('leaves an oversized group alone, so extra units cannot ride on the price', () => {
    expect(planBuilderMerges([line('1', 10, 24, 4)], config)).toEqual([]);
  });

  it('ignores a group that holds a product outside the list', () => {
    expect(planBuilderMerges([line('1', 10, 24), line('2', 20, 48), line('3', 99, 52)], config)).toEqual([]);
  });

  it('ignores lines that are not tagged', () => {
    expect(planBuilderMerges([line('1', 10, 24, 3, null)], config)).toEqual([]);
  });

  it('merges two groups separately', () => {
    const merges = planBuilderMerges(
      [line('1', 10, 24, 1, 'a'), line('2', 20, 48, 1, 'a'), line('3', 30, 52, 1, 'a'), line('4', 10, 24, 3, 'b')],
      config,
    );
    expect(merges).toHaveLength(2);
    expect(merges[1].percentageDecrease).toBeCloseTo((1 - 69 / 72) * 100, 3);
  });

  it('does not merge when the parts cost no more than the bundle', () => {
    expect(planBuilderMerges([line('1', 10, 20, 3)], config)).toEqual([]);
  });

  it('converts the bundle price to the cart currency', () => {
    const [merge] = planBuilderMerges([line('1', 10, 22), line('2', 20, 44), line('3', 30, 48)], config, 0.92);
    expect(114 * (1 - merge.percentageDecrease / 100)).toBeCloseTo(69 * 0.92, 2);
  });
});

describe('parseBuilderConfig', () => {
  const raw = {...config};
  it('accepts a valid config, as an object or a string', () => {
    expect(parseBuilderConfig(raw)?.size).toBe(3);
    expect(parseBuilderConfig(JSON.stringify({...raw, price: '69.00'}))?.price).toBe(69);
  });
  it('rejects bad shapes', () => {
    expect(parseBuilderConfig(null)).toBeNull();
    expect(parseBuilderConfig('{')).toBeNull();
    expect(parseBuilderConfig({...raw, size: 1})).toBeNull();
    expect(parseBuilderConfig({...raw, price: 0})).toBeNull();
    expect(parseBuilderConfig({...raw, productIds: []})).toBeNull();
    expect(parseBuilderConfig({...raw, parentVariantId: 'x'})).toBeNull();
  });
});
