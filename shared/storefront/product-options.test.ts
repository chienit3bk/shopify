import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { visibleLabels, fieldErrors, cartItems } = require('../../extensions/storefront-blocks/assets/product-options.js');

const fields = [
  { label: 'Occasion', required: true, max: 0, whenLabel: '', whenValue: '' },
  { label: 'Other occasion', required: true, max: 30, whenLabel: 'Occasion', whenValue: 'Other' },
  { label: 'Add a personal label', required: false, max: 0, whenLabel: '', whenValue: '' },
  { label: 'Name on label', required: true, max: 20, whenLabel: 'Add a personal label', whenValue: 'Yes' },
];
const messages = { required: '[label] is required.', tooLong: '[label] can have up to [count] characters.' };

describe('visibleLabels', () => {
  it('hides an option until its parent has the value', () => {
    expect(visibleLabels(fields, { Occasion: 'Birthday' })).toEqual(['Occasion', 'Add a personal label']);
    expect(visibleLabels(fields, { Occasion: 'Other' })).toContain('Other occasion');
    expect(visibleLabels(fields, { 'Add a personal label': 'Yes' })).toContain('Name on label');
  });
  it('hides a child when its parent is hidden, whatever the parent holds', () => {
    const chain = [...fields, { label: 'Font', required: false, max: 0, whenLabel: 'Name on label', whenValue: 'Ana' }];
    expect(visibleLabels(chain, { 'Add a personal label': '', 'Name on label': 'Ana' })).not.toContain('Font');
  });
});

describe('fieldErrors', () => {
  it('blocks an empty required option', () => {
    expect(fieldErrors(fields, {}, messages)).toEqual({ Occasion: 'Occasion is required.' });
  });
  it('ignores a required option that is hidden', () => {
    expect(fieldErrors(fields, { Occasion: 'Birthday' }, messages)).toEqual({});
  });
  it('checks a required option once it is shown', () => {
    expect(fieldErrors(fields, { Occasion: 'Other' }, messages)).toEqual({ 'Other occasion': 'Other occasion is required.' });
  });
  it('treats spaces as empty', () => {
    const values = { Occasion: 'Birthday', 'Add a personal label': 'Yes', 'Name on label': '   ' };
    expect(fieldErrors(fields, values, messages)).toHaveProperty(['Name on label']);
  });
  it('enforces the character limit', () => {
    const values = { Occasion: 'Birthday', 'Add a personal label': 'Yes', 'Name on label': 'x'.repeat(21) };
    expect(fieldErrors(fields, values, messages)).toEqual({ 'Name on label': 'Name on label can have up to 20 characters.' });
  });
});

describe('cartItems', () => {
  const entries = [['id', '7'], ['quantity', '2'], ['properties[Occasion]', 'Birthday'], ['properties[Note]', ''], ['form_type', 'product']];
  it('keeps properties on the product line and drops empty ones', () => {
    expect(cartItems(entries, [])).toEqual([{ id: 7, quantity: 2, properties: { Occasion: 'Birthday' } }]);
  });
  it('adds each add-on as its own line with the same quantity', () => {
    expect(cartItems(entries, ['9'])[1]).toEqual({ id: 9, quantity: 2 });
  });
  it('defaults to one when the theme has no quantity field', () => {
    expect(cartItems([['id', '7']], [])[0].quantity).toBe(1);
  });
});
