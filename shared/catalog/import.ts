/**
 * Pure logic for the catalog CSV import: parse, map columns, validate. No network here, so a dry run
 * and the unit tests see exactly what a real import would write.
 */

export interface CatalogMap {
  /** Every imported handle must start with this, so an import can never overwrite another product. */
  handlePrefix: string;
  /** Tag put on every imported product. */
  tag: string;
  regions: string[];
  concerns: string[];
  /** Field name -> CSV column heading. */
  columns: Record<ColumnField, string>;
}

export type ColumnField =
  | 'handle'
  | 'title'
  | 'price'
  | 'sku'
  | 'productType'
  | 'description'
  | 'region'
  | 'concerns'
  | 'ingredients'
  | 'image';

export interface Ingredient {
  name: string;
  amount: string;
  role: string;
}

export interface CatalogProduct {
  line: number;
  handle: string;
  title: string;
  price: string;
  sku: string;
  productType: string;
  description: string;
  region: string;
  concerns: string[];
  ingredients: Ingredient[];
  image: string;
  tags: string[];
}

export interface RowError {
  /** Line in the CSV file (the heading is line 1). 0 means the whole file. */
  line: number;
  field: string;
  message: string;
}

export interface ImportPlan {
  products: CatalogProduct[];
  errors: RowError[];
}

export interface CsvRow {
  line: number;
  cells: string[];
}

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PRICE = /^\d+(\.\d{1,2})?$/;

/** RFC 4180 parser: quoted cells may hold commas, newlines and doubled quotes. Line numbers follow the file. */
export function parseCsv(text: string): CsvRow[] {
  const source = text.replace(/^﻿/, '');
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== '')) rows.push({line: rowLine, cells});
    cells = [];
    cell = '';
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else if (char === '\n') {
      endRow();
      line++;
      rowLine = line;
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
}

/** `Niacinamide: 5%: Evens tone; Zinc: 1%: Balances oil` -> rows of the ingredient chart. */
export function parseIngredients(value: string): Ingredient[] | null {
  const parts = value.split(';').map((part) => part.trim()).filter(Boolean);
  const rows = parts.map((part) => part.split(':').map((piece) => piece.trim()));
  if (rows.length === 0 || rows.some((row) => row.length !== 3 || row.some((piece) => piece === ''))) return null;
  return rows.map(([name, amount, role]) => ({name, amount, role}));
}

/** One line per chart row, as stored in the metaobject list field and split again by the theme block. */
export function ingredientRow({name, amount, role}: Ingredient): string {
  return `${name} | ${amount} | ${role}`;
}

export function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Tags drive the collection filter: `concern-dryness`, `region-nordic`. */
export function productTags(tag: string, region: string, concerns: string[]): string[] {
  return [tag, `region-${slug(region)}`, ...concerns.map((concern) => `concern-${slug(concern)}`)];
}

export function buildPlan(text: string, map: CatalogMap): ImportPlan {
  const [header, ...rows] = parseCsv(text);
  if (!header) return {products: [], errors: [{line: 0, field: 'file', message: 'The file is empty'}]};

  const headings = header.cells.map((cell) => cell.trim());
  const fields = Object.entries(map.columns) as [ColumnField, string][];
  const missing = fields.filter(([, heading]) => !headings.includes(heading));
  if (missing.length > 0) {
    return {
      products: [],
      errors: missing.map(([field, heading]) => ({line: 0, field, message: `Column "${heading}" is missing`})),
    };
  }
  if (rows.length === 0) return {products: [], errors: [{line: 0, field: 'file', message: 'The file has no product rows'}]};

  const products: CatalogProduct[] = [];
  const errors: RowError[] = [];
  const seenHandles = new Map<string, number>();
  const seenSkus = new Map<string, number>();

  for (const {line, cells} of rows) {
    const rowErrors: RowError[] = [];
    const fail = (field: ColumnField, message: string) => rowErrors.push({line, field, message});
    const read = (field: ColumnField) => (cells[headings.indexOf(map.columns[field])] ?? '').trim();

    if (cells.length !== headings.length) {
      errors.push({line, field: 'row', message: `Expected ${headings.length} cells, found ${cells.length}`});
      continue;
    }

    const handle = read('handle');
    if (!HANDLE.test(handle)) fail('handle', `"${handle}" is not a valid handle`);
    else if (!handle.startsWith(map.handlePrefix)) fail('handle', `Handle must start with "${map.handlePrefix}"`);
    else if (seenHandles.has(handle)) fail('handle', `Duplicate of line ${seenHandles.get(handle)}`);
    else seenHandles.set(handle, line);

    const title = read('title');
    if (title === '') fail('title', 'Title is required');

    const price = read('price');
    if (!PRICE.test(price) || Number(price) <= 0) fail('price', `"${price}" is not a price above 0`);

    const sku = read('sku');
    if (sku === '') fail('sku', 'SKU is required');
    else if (seenSkus.has(sku)) fail('sku', `Duplicate of line ${seenSkus.get(sku)}`);
    else seenSkus.set(sku, line);

    const region = read('region');
    if (!map.regions.includes(region)) fail('region', `"${region}" is not one of: ${map.regions.join(', ')}`);

    const concerns = read('concerns').split(';').map((value) => value.trim()).filter(Boolean);
    if (concerns.length === 0) fail('concerns', 'At least one concern is required');
    for (const concern of concerns) {
      if (!map.concerns.includes(concern)) fail('concerns', `"${concern}" is not one of: ${map.concerns.join(', ')}`);
    }

    const ingredients = parseIngredients(read('ingredients'));
    if (!ingredients) fail('ingredients', 'Use "Name: Amount: What it does", separated by ";"');

    const image = read('image');
    if (!image.startsWith('https://')) fail('image', `"${image}" is not an https URL`);

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }
    products.push({
      line,
      handle,
      title,
      price,
      sku,
      productType: read('productType'),
      description: read('description'),
      region,
      concerns,
      ingredients: ingredients as Ingredient[],
      image,
      tags: productTags(map.tag, region, concerns),
    });
  }
  return {products, errors};
}
