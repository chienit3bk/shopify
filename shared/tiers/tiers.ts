/**
 * Tiered discounts: volume tiers per SKU ("4+ → 10% off") and spend tiers on the
 * order ("$150+ → 10% off"). Pure, shared by the tiered-discount Function (prices)
 * and the checkout blocks (tier table, "spend $X more" bar). Unit-tested.
 */

export interface VolumeTier {
  minQuantity: number;
  percent: number;
}

export interface SpendTier {
  /** In the config currency. */
  amount: number;
  /** Per-market round amounts, e.g. {EUR: 140}. */
  amounts?: Record<string, number>;
  percent: number;
}

export interface VolumeRule {
  productIds: string[];
  tiers: VolumeTier[];
  label: string;
}

/** Script-style rule: discount codes can't be used while the cart holds a sale item. */
export interface RejectCodes {
  message: string;
  /** Codes that still work on sale items, e.g. a staff code. Case-insensitive. */
  allowedCodes?: string[];
}

export interface EnteredCode {
  code: string;
  rejectable: boolean;
}

export interface TiersConfig {
  version: 1;
  currencyCode: string;
  /** The first volume rule (kept for configs written before `volumeRules`). */
  volume: VolumeRule | null;
  /**
   * More quantity-break tables, each for its own products — dozens of "buy N, save X%" rules
   * from one discount instead of one automatic discount per product. First match wins.
   */
  volumeRules?: VolumeRule[];
  spend: {
    tiers: SpendTier[];
    label: string;
    excludedProductIds: string[];
    /** Items already on sale (compare-at price above the price) don't count and get no extra %. */
    excludeOnSale?: boolean;
    /** Gift cards don't count and are never discounted. */
    excludeGiftCards?: boolean;
  } | null;
  rejectCodes?: RejectCodes;
}

export interface SpendLine {
  productId: string;
  isGift: boolean;
  /** Compare-at price above the selling price. */
  onSale?: boolean;
  isGiftCard?: boolean;
}

export type SpendExclusion = 'gift' | 'excluded' | 'sale' | 'gift_card';

/** Why a line doesn't count towards (or get) the spend discount, or null when it does. */
export function spendExclusion(spend: NonNullable<TiersConfig['spend']>, line: SpendLine): SpendExclusion | null {
  if (line.isGift) return 'gift';
  if (spend.excludeGiftCards && line.isGiftCard) return 'gift_card';
  if (spend.excludeOnSale && line.onSale) return 'sale';
  if (spend.excludedProductIds.includes(line.productId)) return 'excluded';
  return null;
}

/** On sale = a compare-at price above the price (both per unit, same currency). */
export function isOnSale(price: number, compareAt: number | null | undefined): boolean {
  return typeof compareAt === 'number' && compareAt > price;
}

/** The entered codes to reject. A code that isn't rejectable must never be returned. */
export function codesToReject(rule: RejectCodes | undefined, codes: EnteredCode[], hasSaleLine: boolean): string[] {
  if (!rule || !hasSaleLine) return [];
  const allowed = new Set((rule.allowedCodes ?? []).map((code) => code.toLowerCase()));
  return codes.filter((entered) => entered.rejectable && !allowed.has(entered.code.toLowerCase())).map((entered) => entered.code);
}

export interface Progress<T> {
  current: T | null;
  next: T | null;
}

/** Product id → its volume rule: `volume` first, then `volumeRules` in order (first match wins). */
export function volumeRuleIndex(config: TiersConfig): Map<string, VolumeRule> {
  const index = new Map<string, VolumeRule>();
  for (const rule of [config.volume, ...(config.volumeRules ?? [])]) {
    if (!rule) continue;
    for (const id of rule.productIds) if (!index.has(id)) index.set(id, rule);
  }
  return index;
}

/** The volume rule for one product (see `volumeRuleIndex` for many). */
export function volumeRuleFor(config: TiersConfig, productId: string): VolumeRule | null {
  return volumeRuleIndex(config).get(productId) ?? null;
}

/** Highest volume tier reached by `quantity`, and the one after it. */
export function volumeProgress(tiers: VolumeTier[], quantity: number): Progress<VolumeTier> {
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  const current = [...sorted].reverse().find((tier) => quantity >= tier.minQuantity) ?? null;
  const next = sorted.find((tier) => quantity < tier.minQuantity) ?? null;
  return {current, next};
}

/** A spend tier's threshold in the cart currency, or null when it can't be known. */
export function spendThreshold(tier: SpendTier, configCurrency: string, currencyCode: string, rate?: number): number | null {
  const explicit = tier.amounts?.[currencyCode];
  if (explicit !== undefined) return explicit;
  if (currencyCode === configCurrency) return tier.amount;
  return rate === undefined ? null : round2(tier.amount * rate);
}

export interface SpendStatus {
  current: (SpendTier & {threshold: number}) | null;
  next: (SpendTier & {threshold: number; remaining: number}) | null;
}

/** Spend tier reached by `subtotal` (cart currency) and how far the next one is. */
export function spendProgress(config: TiersConfig, subtotal: number, currencyCode: string, rate?: number): SpendStatus {
  if (!config.spend) return {current: null, next: null};
  const resolved = config.spend.tiers
    .map((tier) => ({...tier, threshold: spendThreshold(tier, config.currencyCode, currencyCode, rate)}))
    .filter((tier): tier is SpendTier & {threshold: number} => tier.threshold !== null)
    .sort((a, b) => a.threshold - b.threshold);
  const current = [...resolved].reverse().find((tier) => subtotal >= tier.threshold) ?? null;
  const upcoming = resolved.find((tier) => subtotal < tier.threshold);
  return {
    current,
    next: upcoming ? {...upcoming, remaining: round2(upcoming.threshold - subtotal)} : null,
  };
}

export function parseTiersConfig(raw: unknown): TiersConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1 || typeof c.currencyCode !== 'string') return null;
  const percent = (p: unknown) => typeof p === 'number' && p > 0 && p <= 100;
  const ids = (list: unknown) => Array.isArray(list) && list.every((id) => typeof id === 'string');

  const volumeRule = (v: any): VolumeRule | null =>
    v &&
    ids(v.productIds) &&
    typeof v.label === 'string' &&
    Array.isArray(v.tiers) &&
    v.tiers.length > 0 &&
    v.tiers.every((t: any) => Number.isInteger(t?.minQuantity) && t.minQuantity > 0 && percent(t.percent))
      ? {productIds: v.productIds, tiers: v.tiers, label: v.label}
      : null;

  let volume: TiersConfig['volume'] = null;
  if (c.volume) {
    volume = volumeRule(c.volume);
    if (!volume) return null;
  }
  // A bad extra rule is dropped on its own, so one typo can't switch off the other 39.
  const volumeRules = Array.isArray(c.volumeRules)
    ? c.volumeRules.map(volumeRule).filter((rule: VolumeRule | null): rule is VolumeRule => rule !== null)
    : [];

  let spend: TiersConfig['spend'] = null;
  if (c.spend) {
    const s = c.spend;
    const ok =
      typeof s.label === 'string' &&
      ids(s.excludedProductIds ?? []) &&
      Array.isArray(s.tiers) &&
      s.tiers.length > 0 &&
      s.tiers.every((t: any) => typeof t?.amount === 'number' && t.amount > 0 && percent(t.percent));
    if (!ok) return null;
    spend = {
      tiers: s.tiers,
      label: s.label,
      excludedProductIds: s.excludedProductIds ?? [],
      excludeOnSale: s.excludeOnSale === true,
      excludeGiftCards: s.excludeGiftCards === true,
    };
  }
  const r = c.rejectCodes;
  const rejectCodes: RejectCodes | null =
    r && typeof r.message === 'string' && r.message.length > 0 && ids(r.allowedCodes ?? [])
      ? {message: r.message, allowedCodes: r.allowedCodes ?? []}
      : null;
  return {
    version: 1,
    currencyCode: c.currencyCode,
    volume,
    ...(volumeRules.length ? {volumeRules} : {}),
    spend,
    ...(rejectCodes ? {rejectCodes} : {}),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
