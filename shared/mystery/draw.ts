// Mystery box: published odds, one draw per box, a public feed of real draws.
// Pure logic. The random number is passed in, so the draw is testable and the
// caller (a Flow "Run code" step) owns where randomness comes from.

export interface Prize {
  id: string;
  title: string;
  /** Published chance in percent, e.g. 2.5 for 2.5 %. */
  odds: number;
}

export type OddsError =
  | {code: 'EMPTY'}
  | {code: 'BAD_ODDS'; id: string}
  | {code: 'DUPLICATE'; id: string}
  | {code: 'SUM'; total: number};

/** Odds are stored with up to 2 decimals; anything within this of 100 counts as 100. */
const SUM_TOLERANCE = 0.001;

/** Every reason this prize list must not be drawn from. Empty array = OK. */
export function validateOdds(prizes: Prize[]): OddsError[] {
  if (prizes.length === 0) return [{code: 'EMPTY'}];
  const errors: OddsError[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const p of prizes) {
    if (seen.has(p.id)) errors.push({code: 'DUPLICATE', id: p.id});
    seen.add(p.id);
    if (!Number.isFinite(p.odds) || p.odds <= 0) {
      errors.push({code: 'BAD_ODDS', id: p.id});
      continue;
    }
    total += p.odds;
  }
  if (Math.abs(total - 100) > SUM_TOLERANCE) errors.push({code: 'SUM', total: round2(total)});
  return errors;
}

/**
 * Pick one prize for a random number r in [0, 1). Prize i wins when r falls in
 * its slice of the cumulative odds, so each prize wins with exactly its odds.
 * Throws on a list that fails validateOdds: a box must never be drawn from
 * odds that don't match what the buyer was shown.
 */
export function draw(prizes: Prize[], r: number): Prize {
  const errors = validateOdds(prizes);
  if (errors.length) throw new Error(`mystery: invalid odds ${JSON.stringify(errors)}`);
  if (!(r >= 0 && r < 1)) throw new Error(`mystery: r out of range ${r}`);
  const target = r * 100;
  let edge = 0;
  for (const p of prizes) {
    edge += p.odds;
    if (target < edge) return p;
  }
  // Float rounding can leave target a hair above the last edge (sum 99.9999…).
  return prizes[prizes.length - 1];
}

/** "Jordan" → "J***". Only the first letter of the first name ever leaves the order. */
export function maskName(firstName: string | null | undefined): string {
  const first = (firstName ?? '').trim();
  const letter = Array.from(first)[0];
  return letter ? `${letter.toUpperCase()}***` : 'Someone';
}

/** 2.5 → "2.5%", 0.05 → "0.05%", 40 → "40%". */
export function formatOdds(odds: number): string {
  return `${round2(odds)}%`;
}

/** Public feed entry: no email, no order id, no full name. */
export interface DrawEntry {
  buyer: string;
  prize: string;
  odds: number;
  drawnAt: string;
}

export function feedEntry(firstName: string | null | undefined, prize: Prize, drawnAt: string): DrawEntry {
  return {buyer: maskName(firstName), prize: prize.title, odds: prize.odds, drawnAt};
}

/** Newest first, only draws from the last `maxAgeHours`, at most `limit`. */
export function recentFeed(entries: DrawEntry[], now: Date, limit = 10, maxAgeHours = 72): DrawEntry[] {
  const cutoff = now.getTime() - maxAgeHours * 3_600_000;
  return entries
    .filter((e) => {
      const t = Date.parse(e.drawnAt);
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.drawnAt) - Date.parse(a.drawnAt))
    .slice(0, limit);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(drawnAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(drawnAt)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
