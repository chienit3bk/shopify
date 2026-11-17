/**
 * Payment method rules for a payment customization Function: hide, reorder.
 *
 * - Bank transfer only above a subtotal: every other method is hidden and bank transfer
 *   moves to the top ("card fees eat my margin on big orders").
 * - Cash on delivery hidden for some shipping provinces/states and above a cap.
 * - Methods reordered per destination country.
 *
 * Amounts in the config are in the shop currency. The Function converts them to the
 * checkout currency with `presentmentCurrencyRate` before comparing. Pure, shared by the
 * payment-rules Function and unit tests.
 */

export interface PaymentRulesConfig {
  version: 1;
  /** Above `minSubtotal`, only the bank-transfer method (plus `keep`) is offered, listed first. */
  bankTransferOnly?: {
    /** Method names that count as bank transfer (first one found wins). */
    methods: string[];
    /** Cart subtotal at or above this, in shop currency. */
    minSubtotal: number;
    /** Other method names to leave visible, e.g. "Gift card". */
    keep?: string[];
  };
  /** Cash on delivery: hidden above a cap and for some destinations. */
  cashOnDelivery?: {
    methods: string[];
    /** Hidden when the subtotal is above this, in shop currency. */
    maxSubtotal?: number;
    /** Hidden when shipping to one of these provinces/states (ISO codes, e.g. US + AK). */
    blockedRegions?: Array<{countryCode: string; provinceCodes: string[]}>;
  };
  /** Per destination country, these method names go first, in this order. */
  orderByCountry?: Array<{countries: string[]; order: string[]}>;
}

export interface PaymentContext {
  /** Cart subtotal, in the checkout (presentment) currency. */
  subtotal: number;
  /** Shop currency → checkout currency. 1 when they're the same. */
  currencyRate: number;
  /** Destination country, else the buyer's localization country. */
  countryCode: string | null;
  /** Destination province/state code, when there's a shipping address. */
  provinceCode: string | null;
}

export interface PaymentMethodLike {
  id: string;
  name: string;
}

export type PaymentOperation = {type: 'hide'; id: string} | {type: 'move'; id: string; index: number};

const normalize = (name: string) => name.trim().toLowerCase();
const matches = (names: string[] | undefined, method: PaymentMethodLike) =>
  !!names && names.some((name) => normalize(name) === normalize(method.name));

/** A shop-currency amount in the checkout currency, rounded to cents. */
export function toPresentment(amount: number, rate: number): number {
  return Math.round(amount * (rate > 0 ? rate : 1) * 100) / 100;
}

export function bankTransferOnlyApplies(config: PaymentRulesConfig, context: PaymentContext): boolean {
  const rule = config.bankTransferOnly;
  return !!rule && context.subtotal >= toPresentment(rule.minSubtotal, context.currencyRate);
}

export function codBlocked(config: PaymentRulesConfig, context: PaymentContext): boolean {
  const rule = config.cashOnDelivery;
  if (!rule) return false;
  if (rule.maxSubtotal !== undefined && context.subtotal > toPresentment(rule.maxSubtotal, context.currencyRate)) return true;
  if (!context.countryCode || !context.provinceCode) return false;
  const country = context.countryCode.toUpperCase();
  const province = context.provinceCode.toUpperCase();
  return (rule.blockedRegions ?? []).some(
    (region) => region.countryCode.toUpperCase() === country && region.provinceCodes.some((code) => code.toUpperCase() === province),
  );
}

/**
 * Operations for the checkout's payment methods. Never hides every method: when the
 * bank-transfer method isn't offered (not set up, or not for this market), the
 * bank-transfer-only rule does nothing rather than leave the buyer with no way to pay.
 */
export function paymentOperations(config: PaymentRulesConfig, methods: PaymentMethodLike[], context: PaymentContext): PaymentOperation[] {
  const operations: PaymentOperation[] = [];
  const hidden = new Set<string>();
  const hide = (method: PaymentMethodLike) => {
    if (hidden.has(method.id)) return;
    hidden.add(method.id);
    operations.push({type: 'hide', id: method.id});
  };

  const bankRule = config.bankTransferOnly;
  const bank = bankRule && bankTransferOnlyApplies(config, context) ? firstMatch(bankRule.methods, methods) : undefined;
  if (bankRule && bank) {
    for (const method of methods) {
      if (method.id !== bank.id && !matches(bankRule.keep, method)) hide(method);
    }
    operations.push({type: 'move', id: bank.id, index: 0});
    return operations;
  }

  if (config.cashOnDelivery && codBlocked(config, context)) {
    for (const method of methods) if (matches(config.cashOnDelivery.methods, method)) hide(method);
  }

  const country = context.countryCode?.toUpperCase();
  const ordering = country
    ? config.orderByCountry?.find((rule) => rule.countries.some((c) => c.toUpperCase() === country))
    : undefined;
  if (ordering) {
    let index = 0;
    for (const name of ordering.order) {
      const method = methods.find((m) => !hidden.has(m.id) && matches([name], m));
      if (method) operations.push({type: 'move', id: method.id, index: index++});
    }
  }
  return operations;
}

function firstMatch(names: string[], methods: PaymentMethodLike[]): PaymentMethodLike | undefined {
  for (const name of names) {
    const method = methods.find((m) => matches([name], m));
    if (method) return method;
  }
  return undefined;
}

/** Validates the metafield JSON. Bad sections are dropped; a bad document returns null (no changes). */
export function parsePaymentRules(raw: unknown): PaymentRulesConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1) return null;

  const strings = (list: unknown): list is string[] =>
    Array.isArray(list) && list.length > 0 && list.every((s) => typeof s === 'string' && s.trim().length > 0);
  const amount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const config: PaymentRulesConfig = {version: 1};

  const bank = c.bankTransferOnly;
  if (bank && strings(bank.methods) && amount(bank.minSubtotal) && (bank.keep === undefined || (Array.isArray(bank.keep) && bank.keep.every((s: unknown) => typeof s === 'string')))) {
    config.bankTransferOnly = {methods: bank.methods, minSubtotal: bank.minSubtotal, ...(bank.keep?.length ? {keep: bank.keep} : {})};
  }

  const cod = c.cashOnDelivery;
  if (cod && strings(cod.methods) && (cod.maxSubtotal === undefined || amount(cod.maxSubtotal))) {
    const regions = Array.isArray(cod.blockedRegions)
      ? cod.blockedRegions.filter((r: any) => r && typeof r.countryCode === 'string' && strings(r.provinceCodes))
      : [];
    config.cashOnDelivery = {
      methods: cod.methods,
      ...(cod.maxSubtotal !== undefined ? {maxSubtotal: cod.maxSubtotal} : {}),
      ...(regions.length > 0 ? {blockedRegions: regions} : {}),
    };
  }

  if (Array.isArray(c.orderByCountry)) {
    const rules = c.orderByCountry.filter((r: any) => r && strings(r.countries) && strings(r.order));
    if (rules.length > 0) config.orderByCountry = rules;
  }
  return config;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
