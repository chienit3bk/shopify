import {describe, expect, it} from 'vitest';
import {MAX_POLLS, byRarity, oddsLabel, oneIn, parseReveal, revealStatus} from './reveal';

const written = JSON.stringify({
  drawnAt: '2026-11-19T10:00:00Z',
  draws: [
    {prize: 'Tidal Sprite – Holo Rare', prizeHandle: 'tidal', tier: 'Base', odds: 80, roll: 0.42},
    {prize: 'Ember Drake ex', prizeHandle: 'ember', tier: 'Chase', odds: 4.5, roll: 0.03},
  ],
});

describe('parseReveal', () => {
  it('reads what the Flow script writes', () => {
    expect(parseReveal(written)).toEqual([
      {prize: 'Tidal Sprite – Holo Rare', prizeHandle: 'tidal', tier: 'Base', odds: 80},
      {prize: 'Ember Drake ex', prizeHandle: 'ember', tier: 'Chase', odds: 4.5},
    ]);
  });
  it('treats missing, broken or empty values as not drawn yet', () => {
    for (const v of [null, undefined, '', 'nope', '{}', '{"draws":[]}', '{"draws":[{"prize":"","odds":5}]}', '{"draws":[{"prize":"x","odds":0}]}']) {
      expect(parseReveal(v)).toBeNull();
    }
  });
});

describe('revealStatus', () => {
  it('waits, then says the draw is late after the last poll', () => {
    expect(revealStatus(null, 0)).toBe('pending');
    expect(revealStatus(null, MAX_POLLS - 1)).toBe('pending');
    expect(revealStatus(null, MAX_POLLS)).toBe('late');
    expect(revealStatus(parseReveal(written), MAX_POLLS + 5)).toBe('done');
  });
});

describe('labels', () => {
  it('shows odds as a percent and as 1 in N', () => {
    expect(oneIn(0.5)).toBe('1 in 200');
    expect(oneIn(4.5)).toBe('1 in 22');
    expect(oneIn(80)).toBe('1 in 1');
    expect(oddsLabel(15)).toBe('15% · 1 in 7');
  });
  it('puts the rarest pull first', () => {
    expect(byRarity(parseReveal(written)!).map((d) => d.tier)).toEqual(['Chase', 'Base']);
  });
});
