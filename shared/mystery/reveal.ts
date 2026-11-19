// Order status page: read the draw that the Flow workflow wrote to the order (custom.mystery_draw).
import {formatOdds} from './draw';

export interface RevealDraw {
  prize: string;
  prizeHandle: string;
  tier: string;
  odds: number;
}

/** Poll every POLL_MS until the draw lands, give up after MAX_POLLS (60 s). */
export const POLL_MS = 5_000;
export const MAX_POLLS = 12;

/** null = nothing written yet (or unreadable); otherwise the draws, one per box. */
export function parseReveal(value: string | null | undefined): RevealDraw[] | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const draws = (parsed as {draws?: unknown})?.draws;
  if (!Array.isArray(draws)) return null;
  const clean = draws
    .map((d) => ({
      prize: typeof d?.prize === 'string' ? d.prize : '',
      prizeHandle: typeof d?.prizeHandle === 'string' ? d.prizeHandle : '',
      tier: typeof d?.tier === 'string' ? d.tier : '',
      odds: Number(d?.odds),
    }))
    .filter((d) => d.prize && Number.isFinite(d.odds) && d.odds > 0);
  return clean.length ? clean : null;
}

export type RevealStatus = 'pending' | 'done' | 'late';

export function revealStatus(draws: RevealDraw[] | null, polls: number): RevealStatus {
  if (draws) return 'done';
  return polls >= MAX_POLLS ? 'late' : 'pending';
}

/** 0.5 → "1 in 200", 4.5 → "1 in 22", 80 → "1 in 1". */
export function oneIn(odds: number): string {
  return `1 in ${Math.max(1, Math.round(100 / odds))}`;
}

/** "4.5% · 1 in 22". Common pulls (50% and up) get the percentage only: 80% would read "1 in 1". */
export function oddsLabel(odds: number): string {
  return odds < 50 ? `${formatOdds(odds)} · ${oneIn(odds)}` : formatOdds(odds);
}

/** The rarest pull first: that's the headline. */
export function byRarity(draws: RevealDraw[]): RevealDraw[] {
  return [...draws].sort((a, b) => a.odds - b.odds);
}
