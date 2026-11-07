import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {cleanRef as cleanRefTs, nextStoredRef as nextTs, REF_ATTRIBUTE} from '../affiliate/ref';

const require = createRequire(import.meta.url);
const js = require('../../extensions/storefront-blocks/assets/affiliate-ref.js');

describe('affiliate-ref.js keeps the rules of shared/affiliate/ref.ts', () => {
  const values = ['mia', 'mia_2026-A', '<b>', 'a b', '', 'x'.repeat(41), '-x', ' anna '];
  it('cleans refs the same way', () => {
    for (const value of values) expect(js.cleanRef(value)).toBe(cleanRefTs(value));
  });
  it('picks the stored ref the same way', () => {
    const now = Date.UTC(2026, 10, 7);
    const stored = JSON.stringify({ref: 'old', at: now - 86_400_000});
    const expired = JSON.stringify({ref: 'old', at: now - 31 * 86_400_000});
    for (const [search, raw] of [['?ref=new', stored], ['', stored], ['', expired], ['?ref=%3Cb%3E', stored], ['', 'oops']] as const) {
      expect(js.nextStoredRef(search, raw, now)).toEqual(nextTs(search, raw, now));
    }
  });
  it('uses the attribute name the pixel reads', () => {
    expect(js.ATTRIBUTE).toBe(REF_ATTRIBUTE);
  });
});
