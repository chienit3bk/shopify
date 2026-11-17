import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {
  FUNCTION_KEYS,
  type PersonalizationField,
  charCount,
  checkableFields,
  fieldProblem,
  parsePersonalization,
  personalizationProblems,
  problemMessage,
} from './rules';

const require = createRequire(import.meta.url);
const block = require('../../extensions/storefront-blocks/assets/personalization.js');

// The demo product's metafield (scripts/personalization-gua-sha.json).
const demo = JSON.parse(readFileSync(new URL('../../scripts/personalization-gua-sha.json', import.meta.url), 'utf8'));
const fields = parsePersonalization(demo)!;
const [name, number] = fields;

describe('parsePersonalization', () => {
  it('reads the demo rules', () => {
    expect(fields).toEqual([
      {key: 'Name', label: 'Name to engrave', required: true, maxLength: 12, format: 'letters', min: undefined, max: undefined},
      {key: 'Number', label: 'Number (0-99)', required: false, maxLength: undefined, format: 'number', min: 0, max: 99},
    ]);
  });
  it('returns null when the product has no usable rules', () => {
    for (const raw of [null, undefined, 'oops', 42, {}, {fields: 'Name'}, {fields: []}, {fields: [{label: 'No key'}]}]) {
      expect(parsePersonalization(raw)).toBeNull();
    }
  });
  it('falls back to safe defaults for odd values', () => {
    expect(parsePersonalization({fields: [{key: ' Name ', format: 'emoji', maxLength: -3, required: 'yes', min: 1}]})).toEqual([
      {key: 'Name', label: 'Name', required: false, maxLength: undefined, format: 'text', min: undefined, max: undefined},
    ]);
  });
  it('keeps the first of two fields with the same key', () => {
    expect(parsePersonalization({fields: [{key: 'Name', label: 'A'}, {key: 'Name', label: 'B'}]})?.map((f) => f.label)).toEqual(['A']);
  });
});

describe('fieldProblem', () => {
  it('needs a required value, and spaces are not a value', () => {
    expect(fieldProblem(name, undefined)?.type).toBe('missing');
    expect(fieldProblem(name, null)?.type).toBe('missing');
    expect(fieldProblem(name, '   ')?.type).toBe('missing');
  });
  it('lets an optional field stay empty', () => {
    expect(fieldProblem(number, '')).toBeNull();
    expect(fieldProblem(number, undefined)).toBeNull();
  });
  it('allows exactly the limit and refuses one more', () => {
    expect(fieldProblem(name, 'Alexandriana')).toBeNull();
    expect(fieldProblem(name, 'Alexandrianas')).toMatchObject({type: 'too_long', length: 13, maxLength: 12});
  });
  it('counts characters the way the buyer does', () => {
    expect(charCount('Zoë')).toBe(3);
    expect(charCount('😀')).toBe(1);
    expect(fieldProblem(name, ' Mia ')).toBeNull();
  });
  it('accepts names in any alphabet with spaces, apostrophes, hyphens and dots', () => {
    for (const ok of ['Mia', "Zoë O'Neil", 'Anne-Marie', 'J. Lo', 'Nguyễn', 'Алина', '美玲']) expect(fieldProblem(name, ok)).toBeNull();
  });
  it('refuses digits, symbols and a leading space-like character in a letters field', () => {
    for (const bad of ['Mia2', 'Mia!', '-Mia', '😀']) expect(fieldProblem(name, bad)?.type).toBe('wrong_format');
  });
  it('takes 0 to 99 in the number field, leading zero included', () => {
    for (const ok of ['0', '7', '07', '99']) expect(fieldProblem(number, ok)).toBeNull();
    expect(fieldProblem(number, '100')).toMatchObject({type: 'out_of_range', min: 0, max: 99});
    for (const bad of ['-1', '7a', '7.5', 'seven']) expect(fieldProblem(number, bad)?.type).toBe('wrong_format');
  });
  it('passes anything in a text field up to its limit', () => {
    const text: PersonalizationField = {key: 'Initials', label: 'Initials', required: true, maxLength: 3, format: 'text'};
    expect(fieldProblem(text, 'A&B')).toBeNull();
    expect(fieldProblem(text, 'ABCD')?.type).toBe('too_long');
  });
});

describe('personalizationProblems', () => {
  it('lists every problem in field order', () => {
    expect(personalizationProblems(fields, {Number: '150'}).map((p) => p.type)).toEqual(['missing', 'out_of_range']);
  });
  it('passes a line filled in through the form', () => {
    expect(personalizationProblems(fields, {Name: 'Mia', Number: '7'})).toEqual([]);
  });
});

describe('checkableFields', () => {
  it('drops keys the Function cannot read, so it never blocks on them', () => {
    const withMonogram = parsePersonalization({fields: [{key: 'Monogram', required: true}, {key: 'Name', required: true}]})!;
    expect(checkableFields(withMonogram).map((f) => f.key)).toEqual(['Name']);
  });
  it('matches the attribute(key:) aliases in the Function input query', () => {
    const query = readFileSync(
      new URL('../../extensions/personalization-validation/src/cart_validations_generate_run.graphql', import.meta.url),
      'utf8',
    );
    const keys = [...query.matchAll(/attribute\(key: "([^"]+)"\)/g)].map((m) => m[1]);
    expect(keys).toEqual([...FUNCTION_KEYS]);
  });
  it('covers every key the demo product uses', () => {
    expect(checkableFields(fields)).toEqual(fields);
  });
});

describe('problemMessage', () => {
  it('names the product and the field and says how to fix it', () => {
    const [problem] = personalizationProblems(fields, {});
    expect(problemMessage(problem, 'Engraved Gua Sha')).toBe(
      'Engraved Gua Sha needs "Name to engrave". Remove Engraved Gua Sha from your cart and add it again from its product page.',
    );
  });
});

describe('product page block (personalization.js) agrees with the Function rules', () => {
  const rawConfigs = [
    demo,
    {fields: [{key: 'Initials', required: true, maxLength: 3}]},
    {fields: [{key: 'Number', format: 'number', min: 10}]},
    {fields: [{key: 'Number', format: 'number', max: 5, maxLength: 1}]},
    {fields: [{key: ' Name ', format: 'emoji', maxLength: -3, required: 'yes'}]},
  ];
  const values = [undefined, '', '  ', 'Mia', 'Mia2', "Zoë O'Neil", 'Alexandrianas', '07', '9', '10', '100', '-1', '7a', 'A&B', 'ABCD', '😀', '美玲'];

  it('parses the same fields', () => {
    for (const raw of rawConfigs) expect(block.parseFields(raw)).toEqual(parsePersonalization(raw) ?? []);
  });
  it('finds the same problem for every value', () => {
    for (const raw of rawConfigs) {
      for (const field of parsePersonalization(raw)!) {
        for (const value of values) {
          expect([field.key, value, block.fieldProblem(field, value)?.type ?? null]).toEqual([
            field.key,
            value,
            fieldProblem(field, value)?.type ?? null,
          ]);
        }
      }
    }
  });
  it('fills in the theme messages', () => {
    const messages = {
      required: '[label] is required.',
      tooLong: '[label] can have up to [count] characters.',
      letters: '[label] can only use letters.',
      number: '[label] must be a number.',
      range: '[label] must be from [min] to [max].',
    };
    expect(block.problemText(name, block.fieldProblem(name, 'Alexandrianas'), messages)).toBe('Name to engrave can have up to 12 characters.');
    expect(block.problemText(number, block.fieldProblem(number, '100'), messages)).toBe('Number (0-99) must be from 0 to 99.');
    expect(block.problemText(number, block.fieldProblem(number, 'x'), messages)).toBe('Number (0-99) must be a number.');
  });
});
