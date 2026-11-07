/**
 * Product-page A/B test without an app: a persistent cookie splits visitors 50/50, the block shows
 * the matching variant, and the web pixel counts views, add-to-carts and orders per variant.
 * Pure, so the split, the cookie and the readout are unit-tested without a browser.
 */

export const AB_COOKIE = 'ab_test';
/** Cart attribute that carries the assignment to the order (no underscore, so it shows on the order). */
export const AB_ATTRIBUTE = 'ab_test';
export const AB_EVENT = 'ab_exposure';
export const AB_COOKIE_DAYS = 90;
export const AB_VARIANTS = ['A', 'B'] as const;
export type AbVariant = (typeof AB_VARIANTS)[number];

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export interface Assignment {
  experiment: string;
  variant: AbVariant;
}

export function cleanExperiment(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return ID_PATTERN.test(id) ? id : null;
}

/** `pdp-trust:B` → {experiment, variant}. Anything else is not an assignment. */
export function parseAssignment(raw: unknown): Assignment | null {
  if (typeof raw !== 'string') return null;
  const [id, variant, ...rest] = raw.split(':');
  const experiment = cleanExperiment(id);
  if (!experiment || rest.length > 0 || (variant !== 'A' && variant !== 'B')) return null;
  return {experiment, variant};
}

export function formatAssignment(a: Assignment): string {
  return `${a.experiment}:${a.variant}`;
}

/** The variant a forced `?ab=B` asks for (QA link). */
export function forcedVariant(search: string): AbVariant | null {
  try {
    const value = new URLSearchParams(search).get('ab');
    return value === 'A' || value === 'B' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Which variant this visitor gets. A forced variant wins, then the stored assignment of the same
 * experiment, otherwise a fresh 50/50 draw (`random` is Math.random in the browser).
 */
export function chooseVariant(experiment: string, stored: string | null | undefined, forced: AbVariant | null, random: number): AbVariant {
  if (forced) return forced;
  const current = parseAssignment(stored);
  if (current && current.experiment === experiment) return current.variant;
  return random < 0.5 ? 'A' : 'B';
}

export interface VariantStats {
  views: number;
  carts: number;
  orders: number;
  /** Per currency, so EUR and USD are never added together. */
  revenue: Record<string, number>;
}
export type ExperimentStats = Record<AbVariant, VariantStats>;
export interface AbState {
  version: 1;
  experiments: Record<string, ExperimentStats>;
}

const emptyVariant = (): VariantStats => ({views: 0, carts: 0, orders: 0, revenue: {}});
export const emptyAbState = (): AbState => ({version: 1, experiments: {}});

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const amount = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

export function parseAbState(raw: unknown): AbState {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return emptyAbState();
    }
  }
  const s = data as Partial<AbState> | null;
  if (!s || typeof s !== 'object' || s.version !== 1 || typeof s.experiments !== 'object' || s.experiments === null) {
    return emptyAbState();
  }
  const experiments: Record<string, ExperimentStats> = {};
  for (const [id, e] of Object.entries(s.experiments)) {
    if (!cleanExperiment(id)) continue;
    const parsed = {A: emptyVariant(), B: emptyVariant()};
    for (const v of AB_VARIANTS) {
      const raw = e?.[v];
      const revenue: Record<string, number> = {};
      for (const [currency, value] of Object.entries(raw?.revenue ?? {})) revenue[currency] = amount(value);
      parsed[v] = {views: count(raw?.views), carts: count(raw?.carts), orders: count(raw?.orders), revenue};
    }
    experiments[id] = parsed;
  }
  return {version: 1, experiments};
}

export type AbEventKind = 'view' | 'cart' | 'order';

export function recordAbEvent(state: AbState, a: Assignment, kind: AbEventKind, order?: {subtotal: number; currencyCode: string}): AbState {
  const current = state.experiments[a.experiment] ?? {A: emptyVariant(), B: emptyVariant()};
  const v = current[a.variant];
  const next: VariantStats = {...v, revenue: {...v.revenue}};
  if (kind === 'view') next.views += 1;
  if (kind === 'cart') next.carts += 1;
  if (kind === 'order') {
    next.orders += 1;
    if (order && order.subtotal > 0) {
      next.revenue[order.currencyCode] = Math.round(((next.revenue[order.currencyCode] ?? 0) + order.subtotal) * 100) / 100;
    }
  }
  return {version: 1, experiments: {...state.experiments, [a.experiment]: {...current, [a.variant]: next}}};
}

/** The experiment a checkout belongs to: its cart attribute first, the cookie as a fallback. */
export function assignmentFromCheckout(attributes: {key: string; value: string}[] | undefined | null, cookie: string | null | undefined): Assignment | null {
  const found = (attributes ?? []).find((x) => x.key === AB_ATTRIBUTE);
  return parseAssignment(found?.value) ?? parseAssignment(cookie);
}

export interface Readout {
  views: number;
  carts: number;
  orders: number;
  /** Orders per view, 0..1. */
  conversion: number;
  /** Add-to-carts per view, 0..1. */
  cartRate: number;
}

export function readVariant(v: VariantStats): Readout {
  return {
    views: v.views,
    carts: v.carts,
    orders: v.orders,
    conversion: v.views > 0 ? v.orders / v.views : 0,
    cartRate: v.views > 0 ? v.carts / v.views : 0,
  };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 on erf). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Two-sided p-value of a two-proportion z-test; null while a variant has no views. */
export function pValue(successA: number, totalA: number, successB: number, totalB: number): number | null {
  if (totalA <= 0 || totalB <= 0) return null;
  const pooled = (successA + successB) / (totalA + totalB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return 1;
  const z = (successB / totalB - successA / totalA) / se;
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

/** Minimum views per variant before a result is called. Below it the readout says "keep collecting". */
export const MIN_VIEWS = 100;

export interface Verdict {
  status: 'collecting' | 'no-difference' | 'winner';
  winner: AbVariant | null;
  p: number | null;
}

export function verdict(stats: ExperimentStats): Verdict {
  const a = stats.A;
  const b = stats.B;
  if (a.views < MIN_VIEWS || b.views < MIN_VIEWS) return {status: 'collecting', winner: null, p: pValue(a.orders, a.views, b.orders, b.views)};
  const p = pValue(a.orders, a.views, b.orders, b.views);
  if (p !== null && p < 0.05) {
    return {status: 'winner', winner: b.orders / b.views > a.orders / a.views ? 'B' : 'A', p};
  }
  return {status: 'no-difference', winner: null, p};
}
