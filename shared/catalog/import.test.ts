import {describe, expect, it} from 'vitest';
import {buildPlan, ingredientRow, parseCsv, parseIngredients, productTags, slug, type CatalogMap} from './import';

const map: CatalogMap = {
  handlePrefix: 'demo-import-',
  tag: 'catalog-demo',
  regions: ['Nordic', 'Alpine'],
  concerns: ['Dryness', 'Redness'],
  columns: {
    handle: 'Handle',
    title: 'Product name',
    price: 'Price (USD)',
    sku: 'SKU',
    productType: 'Type',
    description: 'Description',
    region: 'Origin region',
    concerns: 'Skin concerns',
    ingredients: 'Key ingredients',
    image: 'Photo URL',
  },
};

const HEADER = 'Handle,Product name,Price (USD),SKU,Type,Description,Origin region,Skin concerns,Key ingredients,Photo URL';
const GOOD = 'demo-import-one,Demo One,24.50,DEMO-1,Serum,"Soft, light",Nordic,Dryness; Redness,Oat: 2%: Calms,https://cdn.example.com/a.jpg';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');
const swap = (from: string, to: string) => GOOD.replace(from, to);

describe('parseCsv', () => {
  it('keeps commas, doubled quotes and newlines inside quoted cells', () => {
    expect(parseCsv('a,b\n"1,2","say ""hi""\nthere"\n').map((row) => row.cells)).toEqual([
      ['a', 'b'],
      ['1,2', 'say "hi"\nthere'],
    ]);
  });

  it('handles a BOM and CRLF, skips blank lines and keeps file line numbers', () => {
    const rows = parseCsv('﻿a,b\r\n\r\n1,2\r\n');
    expect(rows[0].cells).toEqual(['a', 'b']);
    expect(rows[1]).toEqual({line: 3, cells: ['1', '2']});
  });

  it('counts newlines inside a quoted cell', () => {
    expect(parseCsv('a\n"x\ny"\nz\n').map((row) => row.line)).toEqual([1, 2, 4]);
  });
});

describe('parseIngredients', () => {
  it('reads rows and rejects a row without three parts', () => {
    expect(parseIngredients('Oat: 2%: Calms; Zinc: 1%: Balances')).toEqual([
      {name: 'Oat', amount: '2%', role: 'Calms'},
      {name: 'Zinc', amount: '1%', role: 'Balances'},
    ]);
    expect(parseIngredients('Oat: 2%')).toBeNull();
    expect(parseIngredients('')).toBeNull();
  });

  it('writes one chart row per ingredient', () => {
    expect(ingredientRow({name: 'Oat', amount: '2%', role: 'Calms'})).toBe('Oat | 2% | Calms');
  });
});

describe('tags', () => {
  it('builds filter tags', () => {
    expect(slug(' Sun & Heat ')).toBe('sun-heat');
    expect(productTags('catalog-demo', 'Nordic', ['Dryness'])).toEqual(['catalog-demo', 'region-nordic', 'concern-dryness']);
  });
});

describe('buildPlan', () => {
  it('maps a good row', () => {
    const {products, errors} = buildPlan(csv(GOOD), map);
    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject({
      line: 2,
      handle: 'demo-import-one',
      price: '24.50',
      description: 'Soft, light',
      concerns: ['Dryness', 'Redness'],
      tags: ['catalog-demo', 'region-nordic', 'concern-dryness', 'concern-redness'],
    });
  });

  it('finds columns by heading, in any order', () => {
    const cells = GOOD.replace('"Soft, light"', 'Soft').split(',');
    const heads = HEADER.split(',');
    const text = [[...heads].reverse().join(','), [...cells].reverse().join(',')].join('\n');
    expect(buildPlan(text, map).products[0].sku).toBe('DEMO-1');
  });

  it('reports every missing column and writes nothing', () => {
    const {products, errors} = buildPlan('Handle,Product name\nx,y', map);
    expect(products).toEqual([]);
    expect(errors.map((error) => error.field)).toContain('price');
    expect(errors.every((error) => error.line === 0)).toBe(true);
  });

  it('rejects an empty file and a file with only a heading', () => {
    expect(buildPlan('', map).errors[0].message).toBe('The file is empty');
    expect(buildPlan(HEADER, map).errors[0].message).toBe('The file has no product rows');
  });

  it('refuses a handle outside the import prefix', () => {
    const {errors} = buildPlan(csv(swap('demo-import-one', 'vitamin-c-brightening-serum')), map);
    expect(errors).toEqual([{line: 2, field: 'handle', message: 'Handle must start with "demo-import-"'}]);
  });

  it.each([
    ['price', '24.50', 'free'],
    ['price', '24.50', '0'],
    ['price', '24.50', '24.505'],
    ['region', 'Nordic', 'Atlantis'],
    ['concerns', 'Dryness; Redness', 'Dryness; Wrinkles'],
    ['concerns', 'Dryness; Redness', ''],
    ['ingredients', 'Oat: 2%: Calms', 'Oat'],
    ['image', 'https://cdn.example.com/a.jpg', 'http://cdn.example.com/a.jpg'],
    ['title', 'Demo One', ''],
    ['sku', 'DEMO-1', ''],
    ['handle', 'demo-import-one', 'Demo Import One'],
  ])('reports a bad %s (%s -> %s)', (field, from, to) => {
    const {products, errors} = buildPlan(csv(swap(from, to)), map);
    expect(products).toEqual([]);
    expect(errors.map((error) => error.field)).toEqual([field]);
    expect(errors[0].line).toBe(2);
  });

  it('reports all problems of a row, and keeps good rows apart from bad ones', () => {
    const bad = swap('24.50', 'free').replace('Nordic', 'Atlantis').replace('demo-import-one', 'demo-import-two').replace('DEMO-1', 'DEMO-2');
    const {products, errors} = buildPlan(csv(GOOD, bad), map);
    expect(products.map((product) => product.handle)).toEqual(['demo-import-one']);
    expect(errors.map((error) => [error.line, error.field])).toEqual([[3, 'price'], [3, 'region']]);
  });

  it('reports duplicate handles and SKUs against the first line', () => {
    const {errors} = buildPlan(csv(GOOD, GOOD), map);
    expect(errors).toEqual([
      {line: 3, field: 'handle', message: 'Duplicate of line 2'},
      {line: 3, field: 'sku', message: 'Duplicate of line 2'},
    ]);
  });

  it('reports a row with the wrong number of cells', () => {
    expect(buildPlan(csv('demo-import-one,Demo One'), map).errors[0]).toEqual({
      line: 2,
      field: 'row',
      message: 'Expected 10 cells, found 2',
    });
  });
});
