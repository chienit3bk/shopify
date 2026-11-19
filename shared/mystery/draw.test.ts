import {describe, expect, it} from 'vitest';
import {
  draw,
  feedEntry,
  formatOdds,
  maskName,
  recentFeed,
  timeAgo,
  validateOdds,
  type DrawEntry,
  type Prize,
} from './draw';

const BOX: Prize[] = [
  {id: 'common', title: 'Common pack', odds: 70},
  {id: 'rare', title: 'Rare holo', odds: 25},
  {id: 'ultra', title: 'Ultra rare', odds: 4.5},
  {id: 'chase', title: 'Chase card', odds: 0.5},
];

describe('validateOdds', () => {
  it('accepts odds that add up to 100', () => {
    expect(validateOdds(BOX)).toEqual([]);
  });

  it('accepts decimals that add up to 100 within float error', () => {
    expect(validateOdds([{id: 'a', title: 'A', odds: 33.33}, {id: 'b', title: 'B', odds: 33.33}, {id: 'c', title: 'C', odds: 33.34}])).toEqual([]);
  });

  it('rejects a list that does not add up to 100', () => {
    expect(validateOdds(BOX.slice(0, 3))).toEqual([{code: 'SUM', total: 99.5}]);
  });

  it('rejects zero, negative and missing odds', () => {
    const errors = validateOdds([
      {id: 'a', title: 'A', odds: 0},
      {id: 'b', title: 'B', odds: -5},
      {id: 'c', title: 'C', odds: Number.NaN},
      {id: 'd', title: 'D', odds: 100},
    ]);
    expect(errors.filter((e) => e.code === 'BAD_ODDS').map((e) => 'id' in e && e.id)).toEqual(['a', 'b', 'c']);
  });

  it('rejects duplicates and empty lists', () => {
    expect(validateOdds([])).toEqual([{code: 'EMPTY'}]);
    expect(validateOdds([{id: 'a', title: 'A', odds: 50}, {id: 'a', title: 'A', odds: 50}])).toContainEqual({code: 'DUPLICATE', id: 'a'});
  });
});

describe('draw', () => {
  it.each([
    [0, 'common'],
    [0.6999, 'common'],
    [0.7, 'rare'],
    [0.9499, 'rare'],
    [0.95, 'ultra'],
    [0.9949, 'ultra'],
    [0.995, 'chase'],
    [0.999999, 'chase'],
  ])('r=%f wins %s', (r, id) => {
    expect(draw(BOX, r).id).toBe(id);
  });

  it('matches the published odds over 100,000 draws', () => {
    const counts: Record<string, number> = {};
    const N = 100_000;
    // Deterministic, evenly spread r values (low-discrepancy), not Math.random: no flaky test.
    for (let i = 0; i < N; i++) {
      const r = (i * 0.6180339887498949) % 1;
      const p = draw(BOX, r);
      counts[p.id] = (counts[p.id] ?? 0) + 1;
    }
    for (const p of BOX) expect(Math.abs((counts[p.id] / N) * 100 - p.odds)).toBeLessThan(0.05);
  });

  it('refuses to draw from bad odds', () => {
    expect(() => draw(BOX.slice(0, 3), 0.5)).toThrow(/invalid odds/);
  });

  it('refuses r outside [0, 1)', () => {
    expect(() => draw(BOX, 1)).toThrow(/out of range/);
    expect(() => draw(BOX, -0.1)).toThrow(/out of range/);
    expect(() => draw(BOX, Number.NaN)).toThrow(/out of range/);
  });
});

describe('public feed', () => {
  it('masks the buyer to one letter', () => {
    expect(maskName('jordan')).toBe('J***');
    expect(maskName('  Émile ')).toBe('É***');
    expect(maskName('')).toBe('Someone');
    expect(maskName(null)).toBe('Someone');
  });

  it('keeps only the masked name, prize, odds and time', () => {
    expect(feedEntry('Ava', BOX[3], '2026-11-19T10:00:00Z')).toEqual({
      buyer: 'A***',
      prize: 'Chase card',
      odds: 0.5,
      drawnAt: '2026-11-19T10:00:00Z',
    });
  });

  it('formats odds without float noise', () => {
    expect(formatOdds(0.5)).toBe('0.5%');
    expect(formatOdds(4.5)).toBe('4.5%');
    expect(formatOdds(0.1 + 0.2)).toBe('0.3%');
  });

  it('shows the newest real draws only, within the window', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    const e = (h: number, prize: string): DrawEntry => ({buyer: 'A***', prize, odds: 1, drawnAt: new Date(now.getTime() - h * 3_600_000).toISOString()});
    const feed = recentFeed([e(5, 'old'), e(1, 'new'), e(100, 'expired'), e(-1, 'future'), {...e(1, 'bad'), drawnAt: 'nope'}], now, 10, 72);
    expect(feed.map((x) => x.prize)).toEqual(['new', 'old']);
    expect(recentFeed([e(1, 'a'), e(2, 'b'), e(3, 'c')], now, 2).map((x) => x.prize)).toEqual(['a', 'b']);
  });

  it('says how long ago', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(timeAgo('2026-11-19T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-19T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-19T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-17T12:00:00Z', now)).toBe('2 d ago');
  });
});
