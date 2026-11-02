import {describe, expect, test} from 'vitest';
import {checkVat, isEuCountry, normalizeVat} from './vat';

describe('checkVat', () => {
  test('normalises spaces, dots and dashes, any case', () => {
    expect(normalizeVat(' de 123.456-789 ')).toBe('DE123456789');
    expect(checkVat('de 123 456 789', 'DE')).toEqual({ok: true, value: 'DE123456789'});
  });

  test('country formats: Austria needs U, the Netherlands B01, Greece uses EL', () => {
    expect(checkVat('ATU12345678', 'AT').ok).toBe(true);
    expect(checkVat('AT12345678', 'AT')).toEqual({ok: false, reason: 'format', expectedPrefix: 'AT'});
    expect(checkVat('NL123456789B01', 'NL').ok).toBe(true);
    expect(checkVat('NL123456789', 'NL').ok).toBe(false);
    expect(checkVat('EL123456789', 'GR').ok).toBe(true);
    expect(checkVat('GR123456789', 'GR')).toEqual({ok: false, reason: 'wrong_country', expectedPrefix: 'EL'});
    expect(checkVat('FRXX123456789', 'FR').ok).toBe(true);
    expect(checkVat('FRIO123456789', 'FR').ok).toBe(false);
  });

  test('the number must belong to the delivery country', () => {
    expect(checkVat('DE123456789', 'FR')).toEqual({ok: false, reason: 'wrong_country', expectedPrefix: 'FR'});
  });

  test('empty, and countries outside the EU', () => {
    expect(checkVat('  ', 'DE')).toEqual({ok: false, reason: 'empty'});
    expect(checkVat('GB123456789', 'GB')).toEqual({ok: false, reason: 'not_eu'});
    expect(isEuCountry('ie')).toBe(true);
    expect(isEuCountry('US')).toBe(false);
  });
});
