import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {draw, type Prize} from './draw';
import {mulberry32, rollFor, seedText, sha256, type BoxRef} from './roll';

// Test-only salt (64 hex chars, like `openssl rand -hex 32`). The store's real salt lives only
// in the shop metafield custom.mystery_salt.
const SALT = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const ref = (over: Partial<BoxRef> = {}): BoxRef => ({
  orderId: 'gid://shopify/Order/7001',
  createdAt: '2026-11-19T10:00:00Z',
  lineId: 'gid://shopify/LineItem/9001',
  box: 0,
  ...over,
});

const hex = (words: number[]) => words.map((w) => w.toString(16).padStart(8, '0')).join('');

describe('sha256', () => {
  it('matches node:crypto, including multi-block and non-ASCII input', () => {
    const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(200), 'Pokémon ✨ 𝔾', seedText(SALT, ref())];
    for (const text of inputs) {
      expect(hex(sha256(text))).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });
});

describe('mulberry32', () => {
  it('is a fixed, known sequence for a seed', () => {
    const next = mulberry32(1);
    expect([next(), next(), next()].map((r) => r.toFixed(10))).toEqual(['0.6270739406', '0.0027357212', '0.5274470400']);
  });
});

describe('rollFor', () => {
  it('is deterministic: the same box always gets the same roll', () => {
    expect(rollFor(SALT, ref())).toBe(rollFor(SALT, ref()));
  });

  it('gives every order, line, box and timestamp its own roll', () => {
    const base = rollFor(SALT, ref());
    const others = [
      ref({orderId: 'gid://shopify/Order/7002'}),
      ref({createdAt: '2026-11-19T10:00:01Z'}),
      ref({lineId: 'gid://shopify/LineItem/9002'}),
      ref({box: 1}),
    ].map((r) => rollFor(SALT, r));
    for (const r of others) expect(r).not.toBe(base);
    expect(new Set(others).size).toBe(others.length);
  });

  it('depends on the secret salt', () => {
    expect(rollFor(SALT.replace(/^a/, 'b'), ref())).not.toBe(rollFor(SALT, ref()));
  });

  it('refuses a missing or short salt rather than drawing predictably', () => {
    expect(() => rollFor('', ref())).toThrow(/salt/);
    expect(() => rollFor('abc', ref())).toThrow(/salt/);
  });

  it('stays in [0, 1) and is roughly uniform over 100k boxes', () => {
    const N = 100_000;
    const bins = new Array(10).fill(0);
    let min = 1;
    let max = 0;
    for (let i = 0; i < N; i++) {
      const r = rollFor(SALT, ref({orderId: `gid://shopify/Order/${i}`}));
      min = Math.min(min, r);
      max = Math.max(max, r);
      bins[Math.floor(r * 10)]++;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    // Chi-square with 9 degrees of freedom: 27.88 is the 0.1 % critical value.
    const expected = N / 10;
    const chi = bins.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(27.88);
  });

  it('lands on each tier at its published odds', () => {
    const prizes: Prize[] = [
      {id: 'grail', title: 'Grail', odds: 0.5},
      {id: 'chase', title: 'Chase', odds: 4.5},
      {id: 'hit', title: 'Hit', odds: 15},
      {id: 'base', title: 'Base', odds: 80},
    ];
    const N = 100_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const p = draw(prizes, rollFor(SALT, ref({lineId: `gid://shopify/LineItem/${i}`})));
      counts[p.id] = (counts[p.id] ?? 0) + 1;
    }
    for (const p of prizes) {
      const share = (counts[p.id] ?? 0) / N;
      const sd = Math.sqrt((p.odds / 100) * (1 - p.odds / 100) / N);
      expect(Math.abs(share - p.odds / 100)).toBeLessThan(5 * sd);
    }
  });
});
