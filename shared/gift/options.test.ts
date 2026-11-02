import {describe, expect, test} from 'vitest';
import {type GiftOptionsConfig, cleanMessage, hasWrap, parseGiftOptionsConfig, toggleWrap} from './options';

const config: GiftOptionsConfig = {version: 1, wrapVariantId: 'wrap', wrapAttributeKey: '_gift_wrap', messageMaxLength: 20};
const line = (id: string, merchandiseId: string, quantity = 1) => ({id, quantity, merchandiseId, attributes: []});

describe('gift wrap', () => {
  test('on adds one wrap line, never a second one', () => {
    expect(toggleWrap(config, [line('1', 'serum')], true)).toEqual([
      {type: 'addCartLine', merchandiseId: 'wrap', quantity: 1, attributes: [{key: '_gift_wrap', value: 'true'}]},
    ]);
    expect(toggleWrap(config, [line('1', 'serum'), line('2', 'wrap')], true)).toEqual([]);
  });

  test('off removes every wrap line', () => {
    expect(toggleWrap(config, [line('2', 'wrap', 2), line('3', 'wrap')], false)).toEqual([
      {type: 'removeCartLine', id: '2', quantity: 2},
      {type: 'removeCartLine', id: '3', quantity: 1},
    ]);
    expect(hasWrap(config, [line('1', 'serum')])).toBe(false);
  });
});

describe('cleanMessage', () => {
  test('trims, drops control characters, keeps at most one blank line, fits the card', () => {
    expect(cleanMessage('  Happy\u0007 birthday!\r\n\r\n\r\n\r\nLove, A  ', 200)).toBe('Happy birthday!\n\nLove, A');
    expect(cleanMessage('Happy birthday, Anna!! xoxo', 20)).toBe('Happy birthday, Anna');
    expect(cleanMessage('   ', 20)).toBe('');
  });
});

test('parseGiftOptionsConfig', () => {
  expect(parseGiftOptionsConfig(JSON.stringify(config))).toEqual(config);
  expect(parseGiftOptionsConfig({...config, messageMaxLength: 0})).toBeNull();
  expect(parseGiftOptionsConfig('x')).toBeNull();
});
