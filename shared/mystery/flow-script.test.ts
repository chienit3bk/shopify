import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import main from '../../scripts/flow/mystery-draw.js';
import {draw, maskName, validateOdds, type Prize} from './draw';
import {rollFor} from './roll';

const SCRIPT = readFileSync(new URL('../../scripts/flow/mystery-draw.js', import.meta.url), 'utf8');
// Test-only salt; the real one lives only in the shop metafield custom.mystery_salt.
const SALT = '0123456789abcdef'.repeat(4);
const ORDER_ID = 'gid://shopify/Order/7001';
const CREATED_AT = '2026-11-19T09:59:58Z';

const config = JSON.parse(
  readFileSync(new URL('../../scripts/mystery-box-prizes.json', import.meta.url), 'utf8'),
) as {prizes: (Prize & {tier: string; handle: string})[]};
const PRIZES = config.prizes;

interface Line {
  id: string;
  quantity: number;
  product: {id: string; mysteryPrizes: {value: string} | null} | null;
}

function order(lines: Line[], firstName: string | null = 'Jordan', orderId = ORDER_ID, salt: string | null = SALT) {
  return {
    shop: {mysterySalt: salt === null ? null : {value: salt}},
    order: {
      id: orderId,
      processedAt: '2026-11-19T10:00:00Z',
      createdAt: CREATED_AT,
      customer: firstName === null ? null : {firstName},
      billingAddress: {firstName: 'Billing'},
      shippingAddress: null,
      lineItems: lines,
    },
  };
}

const BOX_LINE = 'gid://shopify/LineItem/9001';
const box = (quantity: number, prizes: unknown = PRIZES): Line => ({
  id: BOX_LINE,
  quantity,
  product: {id: 'gid://shopify/Product/1', mysteryPrizes: {value: JSON.stringify(prizes)}},
});
const plain: Line = {id: 'gid://shopify/LineItem/9000', quantity: 2, product: {id: 'gid://shopify/Product/2', mysteryPrizes: null}};

const rollOf = (box: number, orderId = ORDER_ID) =>
  rollFor(SALT, {orderId, createdAt: CREATED_AT, lineId: BOX_LINE, box});

afterEach(() => vi.restoreAllMocks());

describe('the published prize list', () => {
  it('is drawable: odds add up to 100', () => {
    expect(validateOdds(PRIZES)).toEqual([]);
  });
});

describe('Flow script keeps the rules of shared/mystery/draw.ts', () => {
  it('rolls like rollFor() and picks the same prize as draw() for that roll', () => {
    const tiers = new Set<string>();
    for (let k = 0; k < 500; k++) {
      const orderId = `gid://shopify/Order/${k}`;
      const r = rollOf(0, orderId);
      const [d] = main(order([box(1)], 'Jordan', orderId)).draws;
      expect(d.roll).toBe(Math.round(r * 1e6) / 1e6);
      expect(d.prize).toBe(draw(PRIZES, r).title);
      tiers.add(d.tier);
    }
    expect(tiers.size).toBe(4);
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
    expect(main(order([box(1)], 'élodie')).draws[0].buyer).toBe(maskName('élodie'));
    expect(main(order([box(1)], '  ')).draws[0].buyer).toBe(maskName('Billing'));
    expect(main(order([box(1)], null)).draws[0].buyer).toBe('B***');
  });
});

describe('Flow script output', () => {
  it('draws once per box, each box with its own roll, and ignores other lines', () => {
    const out = main(order([plain, box(3)]));
    expect(out.count).toBe(3);
    const rolls = [0, 1, 2].map((i) => rollOf(i));
    expect(new Set(rolls).size).toBe(3);
    expect(out.draws.map((d: {roll: number}) => d.roll)).toEqual(rolls.map((r) => Math.round(r * 1e6) / 1e6));
    expect(out.draws.map((d: {prize: string}) => d.prize)).toEqual(rolls.map((r) => draw(PRIZES, r).title));
    expect(out.error).toBe('');
  });

  it('never calls Math.random (Flow seeds it identically on every run)', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random called');
    });
    expect(main(order([box(2)])).count).toBe(2);
    expect(spy).not.toHaveBeenCalled();
    expect(SCRIPT).not.toMatch(/Math\.random\s*\(/);
  });

  it('is the same draw when Flow re-runs the same order', () => {
    expect(main(order([box(2)]))).toEqual(main(order([box(2)])));
  });

  it('draws nothing without a secret salt of at least 32 characters', () => {
    for (const salt of [null, '', 'short']) {
      const out = main(order([box(1)], 'Jordan', ORDER_ID, salt));
      expect(out.count).toBe(0);
      expect(out.error).toContain('custom.mystery_salt');
    }
  });

  it('writes nothing for an order without a box', () => {
    const out = main(order([plain]));
    expect(out).toEqual({count: 0, draws: [], json: JSON.stringify({drawnAt: '2026-11-19T10:00:00Z', draws: []}), error: ''});
  });

  it('keeps the public feed free of email, order id and full name', () => {
    const [entry] = main(order([box(1)])).draws;
    expect(Object.keys(entry).sort()).toEqual(['buyer', 'drawnAt', 'odds', 'prize', 'prizeHandle', 'roll', 'tier']);
    expect(entry.buyer).toBe('J***');
    expect(entry.drawnAt).toBe('2026-11-19T10:00:00Z');
  });

  it('strips characters that would break the JSON blob of the next step', () => {
    const prizes = [{id: 'a', title: 'Say "hi" \\ now', tier: 'A', handle: 'a', odds: 100}];
    expect(main(order([box(1, prizes)])).draws[0].prize).toBe('Say hi  now');
  });

  it('stores the draws as JSON for the order metafield', () => {
    const r = rollOf(0);
    const prize = draw(PRIZES, r) as Prize & {handle: string};
    const parsed = JSON.parse(main(order([box(1)])).json);
    expect(parsed.draws[0]).toEqual({prize: prize.title, prizeHandle: prize.handle, tier: (prize as {tier?: string}).tier, odds: prize.odds, roll: Math.round(r * 1e6) / 1e6});
  });
});
