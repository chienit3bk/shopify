/**
 * Personalization rules for one product: product metafield `custom.personalization` (JSON).
 * The same rules drive the product page block (extensions/storefront-blocks/assets/personalization.js,
 * kept in step by a parity test) and the `personalization-validation` Function, which is the one
 * that decides: it also sees lines added by permalink, the AJAX API or an express button.
 *
 * {"fields": [
 *   {"key": "Name", "label": "Name to engrave", "required": true, "maxLength": 12, "format": "letters"},
 *   {"key": "Number", "label": "Number (0-99)", "format": "number", "min": 0, "max": 99}
 * ]}
 */

/** text = anything; letters = letters, spaces, . ' - (any alphabet); number = digits only. */
export type FieldFormat = 'text' | 'letters' | 'number';

export interface PersonalizationField {
  /** Line item property key, so the cart, checkout and order show it as "Name: Mia". */
  key: string;
  /** What the buyer reads on the product page. Defaults to the key. */
  label: string;
  required: boolean;
  maxLength?: number;
  format: FieldFormat;
  /** number only */
  min?: number;
  max?: number;
}

export type PersonalizationProblem =
  | {type: 'missing'; field: PersonalizationField}
  | {type: 'too_long'; field: PersonalizationField; length: number; maxLength: number}
  | {type: 'wrong_format'; field: PersonalizationField}
  | {type: 'out_of_range'; field: PersonalizationField; min?: number; max?: number};

/**
 * Line item property keys the Function can read. A Function input has no "all attributes" field,
 * only `attribute(key:)`, so each key is a fixed alias in
 * extensions/personalization-validation/src/cart_validations_generate_run.graphql (a test keeps
 * both lists equal). A field with another key still works on the product page, but the Function
 * can't see it and never blocks on it.
 */
export const FUNCTION_KEYS = ['Name', 'Number', 'Initials'] as const;

const FORMATS: FieldFormat[] = ['text', 'letters', 'number'];
const LETTERS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const DIGITS = /^\d+$/;

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function int(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/** Returns null when the product has no usable rules (no metafield, bad JSON, no fields). */
export function parsePersonalization(raw: unknown): PersonalizationField[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as Record<string, unknown>).fields;
  if (!Array.isArray(list)) return null;
  const fields: PersonalizationField[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    if (!key || fields.some((other) => other.key === key)) continue;
    const format = FORMATS.includes(f.format as FieldFormat) ? (f.format as FieldFormat) : 'text';
    fields.push({
      key,
      label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : key,
      required: f.required === true,
      maxLength: positiveInt(f.maxLength),
      format,
      min: format === 'number' ? int(f.min) : undefined,
      max: format === 'number' ? int(f.max) : undefined,
    });
  }
  return fields.length ? fields : null;
}

/** Characters as the buyer counts them (an accented letter or emoji is one). */
export function charCount(value: string): number {
  return Array.from(value).length;
}

/** First problem with one value, or null. Spaces around the value don't count. */
export function fieldProblem(field: PersonalizationField, raw: string | null | undefined): PersonalizationProblem | null {
  const value = (raw ?? '').trim();
  if (!value) return field.required ? {type: 'missing', field} : null;
  const length = charCount(value);
  if (field.maxLength && length > field.maxLength) return {type: 'too_long', field, length, maxLength: field.maxLength};
  if (field.format === 'letters' && !LETTERS.test(value)) return {type: 'wrong_format', field};
  if (field.format === 'number') {
    if (!DIGITS.test(value)) return {type: 'wrong_format', field};
    const n = Number(value);
    if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
      return {type: 'out_of_range', field, min: field.min, max: field.max};
    }
  }
  return null;
}

/** Every problem on one cart line, in field order. `values` maps property key -> value. */
export function personalizationProblems(
  fields: PersonalizationField[],
  values: Record<string, string | null | undefined>,
): PersonalizationProblem[] {
  const problems: PersonalizationProblem[] = [];
  for (const field of fields) {
    const problem = fieldProblem(field, values[field.key]);
    if (problem) problems.push(problem);
  }
  return problems;
}

/** The fields the Function can judge (see FUNCTION_KEYS). */
export function checkableFields(fields: PersonalizationField[]): PersonalizationField[] {
  return fields.filter((field) => (FUNCTION_KEYS as readonly string[]).includes(field.key));
}

/** Checkout message. The buyer can't edit a property in checkout, so it says where to fix it. */
export function problemMessage(problem: PersonalizationProblem, productTitle: string): string {
  const {label} = problem.field;
  const fix = `Remove ${productTitle} from your cart and add it again from its product page.`;
  switch (problem.type) {
    case 'missing':
      return `${productTitle} needs "${label}". ${fix}`;
    case 'too_long':
      return `"${label}" on ${productTitle} can have up to ${problem.maxLength} characters (it has ${problem.length}). ${fix}`;
    case 'wrong_format':
      return problem.field.format === 'number'
        ? `"${label}" on ${productTitle} must be a number. ${fix}`
        : `"${label}" on ${productTitle} can only use letters, spaces, apostrophes and hyphens. ${fix}`;
    case 'out_of_range':
      return `"${label}" on ${productTitle} must be ${rangeText(problem.min, problem.max)}. ${fix}`;
  }
}

function rangeText(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `from ${min} to ${max}`;
  if (min !== undefined) return `${min} or more`;
  return `${max} or less`;
}
