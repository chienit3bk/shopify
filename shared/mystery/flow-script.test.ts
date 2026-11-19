import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import main from '../../scripts/flow/mystery-draw.js';
import {draw, maskName, validateOdds, type Prize} from './draw';

const config = JSON.parse(
  readFileSync(new URL('../../scripts/mystery-box-prizes.json', import.meta.url), 'utf8'),
) as {prizes: (Prize & {tier: string; handle: string})[]};
const PRIZES = config.prizes;

interface Line {
  quantity: number;
  product: {id: string; mysteryPrizes: {value: string} | null} | null;
}

function order(lines: Line[], firstName: string | null = 'Jordan') {
  return {
    order: {
      processedAt: '2026-11-19T10:00:00Z',
      createdAt: '2026-11-19T09:59:58Z',
      customer: firstName === null ? null : {firstName},
      billingAddress: {firstName: 'Billing'},
      shippingAddress: null,
      lineItems: lines,
    },
  };
}

const box = (quantity: number, prizes: unknown = PRIZES): Line => ({
  quantity,
  product: {id: 'gid://shopify/Product/1', mysteryPrizes: {value: JSON.stringify(prizes)}},
});
const plain: Line = {quantity: 2, product: {id: 'gid://shopify/Product/2', mysteryPrizes: null}};

function withRandoms(values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[i++ % values.length]);
}

afterEach(() => vi.restoreAllMocks());

describe('the published prize list', () => {
  it('is drawable: odds add up to 100', () => {
    expect(validateOdds(PRIZES)).toEqual([]);
  });
});

describe('Flow script keeps the rules of shared/mystery/draw.ts', () => {
  it('picks the same prize as draw() for every roll', () => {
    const rolls = [0, 0.0049, 0.005, 0.0499, 0.05, 0.1999, 0.2, 0.5, 0.999999];
    for (let k = 0; k < 200; k++) rolls.push(k / 200);
    for (const r of rolls) {
      withRandoms([r]);
      const out = main(order([box(1)]));
      expect(out.draws[0].prize).toBe(draw(PRIZES, r).title);
      vi.restoreAllMocks();
    }
  });

  it('refuses to draw when the odds do not add up to 100, like validateOdds', () => {
    const bad = PRIZES.map((p, i) => (i === 0 ? {...p, odds: p.odds + 1} : p));
    expect(validateOdds(bad).length).toBeGreaterThan(0);
    const out = main(order([box(1, bad)]));
    expect(out.count).toBe(0);
    expect(out.error).toContain('SUM');
  });

  it('refuses zero or negative odds and an empty list', () => {
    const zero = PRIZES.map((p, i) => (i === 0 ? {...p, odds: 0} : p));
    expect(main(order([box(1, zero)])).error).toContain('BAD_ODDS');
    expect(main(order([box(1, [])])).error).toContain('EMPTY');
    expect(main(order([box(1, 'nope')])).error).toContain('EMPTY');
  });

  it('masks the buyer like maskName, falling back to the billing name', () => {
    withRandoms([0.5]);
    expect(main(order([box(1)], 'élodie')).draws[0].buyer).toBe(maskName('élodie'));
    expect(main(order([box(1)], '  ')).draws[0].buyer).toBe(maskName('Billing'));
    expect(main(order([box(1)], null)).draws[0].buyer).toBe('B***');
  });
});

describe('Flow script output', () => {
  it('draws once per box and ignores other lines', () => {
    withRandoms([0.001, 0.9, 0.1]);
    const out = main(order([plain, box(3)]));
    expect(out.count).toBe(3);
    expect(out.draws.map((d: {tier: string}) => d.tier)).toEqual(['Grail', 'Base', 'Hit']);
    expect(out.error).toBe('');
  });

  it('writes nothing for an order without a box', () => {
    const out = main(order([plain]));
    expect(out).toEqual({count: 0, draws: [], json: JSON.stringify({drawnAt: '2026-11-19T10:00:00Z', draws: []}), error: ''});
  });

  it('keeps the public feed free of email, order id and full name', () => {
    withRandoms([0.5]);
    const [entry] = main(order([box(1)])).draws;
    expect(Object.keys(entry).sort()).toEqual(['buyer', 'drawnAt', 'odds', 'prize', 'prizeHandle', 'roll', 'tier']);
    expect(entry.buyer).toBe('J***');
    expect(entry.drawnAt).toBe('2026-11-19T10:00:00Z');
  });

  it('strips characters that would break the JSON blob of the next step', () => {
    const prizes = [{id: 'a', title: 'Say "hi" \\ now', tier: 'A', handle: 'a', odds: 100}];
    withRandoms([0.2]);
    expect(main(order([box(1, prizes)])).draws[0].prize).toBe('Say hi  now');
  });

  it('stores the draws as JSON for the order metafield', () => {
    withRandoms([0.001]);
    const parsed = JSON.parse(main(order([box(1)])).json);
    expect(parsed.draws[0]).toMatchObject({prize: PRIZES[0].title, odds: PRIZES[0].odds, roll: 0.001});
  });
});
