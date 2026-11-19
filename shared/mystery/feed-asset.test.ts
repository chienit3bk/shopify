import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {formatOdds, recentFeed, timeAgo, type DrawEntry} from './draw';

const require = createRequire(import.meta.url);
const feed = require('../../extensions/storefront-blocks/assets/mystery-feed.js');

const now = new Date('2026-11-19T12:00:00Z');
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
const entry = (prize: string, minutesAgo: number): DrawEntry => ({buyer: 'J***', prize, odds: 4.5, drawnAt: at(minutesAgo)});

describe('mystery-feed.js keeps the rules of shared/mystery/draw.ts', () => {
  it('formats odds and time the same way', () => {
    for (const odds of [0.5, 4.5, 15, 80, 0.05, 33.333]) expect(feed.formatOdds(odds)).toBe(formatOdds(odds));
    for (const minutes of [-5, 0, 0.5, 1, 59, 60, 61, 60 * 23, 60 * 24, 60 * 24 * 5]) {
      expect(feed.timeAgo(at(minutes), now)).toBe(timeAgo(at(minutes), now));
    }
  });

  it('keeps the same recent entries in the same order', () => {
    const entries = [
      entry('old', 60 * 80),
      entry('a', 30),
      entry('future', -10),
      entry('b', 5),
      {...entry('broken', 1), drawnAt: 'nope'},
      entry('c', 60 * 71),
    ];
    for (const [limit, hours] of [[10, 72], [2, 72], [10, 1]]) {
      expect(feed.recentFeed(entries, now, limit, hours)).toEqual(recentFeed(entries, now, limit, hours));
    }
    expect(feed.recentFeed(entries, now).map((e: DrawEntry) => e.prize)).toEqual(['b', 'a', 'c']);
  });
});

describe('rows from Liquid', () => {
  it('turns epoch seconds into ISO times and drops broken rows', () => {
    const rows = [
      {buyer: 'J***', prize: 'Ember Drake ex', handle: 'ember', odds: 4.5, drawnAt: '1795089600'},
      {buyer: null, prize: 'Tidal Sprite', handle: null, odds: '80.0', drawnAt: '1795089000'},
      {buyer: 'K***', prize: '', odds: 1, drawnAt: '1795089600'},
      {buyer: 'K***', prize: 'No time', odds: 1, drawnAt: ''},
    ];
    expect(feed.fromLiquid(rows)).toEqual([
      {buyer: 'J***', prize: 'Ember Drake ex', handle: 'ember', odds: 4.5, drawnAt: '2026-11-19T12:00:00.000Z'},
      {buyer: 'Someone', prize: 'Tidal Sprite', handle: '', odds: 80, drawnAt: '2026-11-19T11:50:00.000Z'},
    ]);
    expect(feed.fromLiquid(null)).toEqual([]);
  });
});
