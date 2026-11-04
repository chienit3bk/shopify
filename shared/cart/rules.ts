/**
 * Cart rules a merchant can't express in Shopify settings: max quantity per product,
 * minimum order value per market, and products that can't be bought together — plus the B2B
 * set: minimum quantity per product, case packs, and a higher minimum on the first order.
 * Pure, used by the cart-rules Validation Function and unit tests.
 */

import {addDays} from '../delivery/date';

/**
 * Who a rule applies to. B2B = buying for a company location; wholesale = a customer tagged
 * "wholesale" (no B2B catalog needed); omitted = everyone. Wholesale can only add limits: the tag
 * also matches a guest's unverified email, so never use it to grant something.
 */
export type BuyerScope = 'b2b' | 'retail' | 'wholesale';

export type CartRule = {buyer?: BuyerScope} & (
  | {type: 'max_quantity'; productIds: string[]; max: number; label: string}
  | {
      type: 'min_subtotal';
      amount: number;
      amounts?: Record<string, number>;
      currencyCode: string;
      /** Minimum for a buyer's first order (same currency rules), e.g. €500 first, €300 after. */
      firstOrderAmount?: number;
      firstOrderAmounts?: Record<string, number>;
    }
  | {type: 'incompatible'; productIds: string[]; label: string}
  /** No productIds = every product (except excluded ones). */
  | {type: 'min_quantity'; productIds?: string[]; min: number}
  | {type: 'case_pack'; productIds: string[]; size: number}
  /**
   * A checkbox the buyer must tick when these products are in the cart (age check, final sale…).
   * The consent block stores ticked ids in the "Consent" cart attribute, so it shows on the order.
   */
  | {type: 'consent'; id: string; productIds: string[]; label: string; error: string}
  /** Products with a ship-to list (product metafield) can only go to those countries. */
  | {type: 'country_restriction'}
  /**
   * One per customer per period (sample kits). The last claim is a customer metafield, which the
   * Function also gets for a guest whose email matches a customer. That can only block: a guest
   * typing someone else's email stops themselves, and never learns the date.
   */
  | {type: 'once_per_period'; productIds: string[]; days: number; label: string}
);

export interface CartRulesConfig {
  version: 1;
  rules: CartRule[];
  /** Never count towards the minimum (services, gift lines are excluded anyway). */
  excludedProductIds: string[];
}

export interface RuleLine {
  productId: string;
  title: string;
  quantity: number;
  /** Countries this product may ship to (product metafield); undefined = anywhere. */
  shipsTo?: string[];
  /** Line amount after item discounts (a "buy 2 get 1" free unit is 0). */
  subtotal: number;
  isGift: boolean;
}

export interface RuleCart {
  currencyCode: string;
  /**
   * The "Subtotal" the buyer sees (after item discounts, before order discounts). When set, the
   * minimum is this minus gift and excluded lines; otherwise the sum of the counted lines.
   */
  subtotal?: number;
  /** Buying for a company location (B2B checkout). */
  isB2B?: boolean;
  /** Customer tagged "wholesale", signed in or matched by a guest's email. */
  isWholesale?: boolean;
  /** No earlier orders (the company location's, or the customer's). Unknown → false. */
  isFirstOrder?: boolean;
  /** Consent ids the buyer ticked. */
  consents?: string[];
  /** Delivery country, once the buyer has entered an address. */
  deliveryCountry?: string;
  /** Cart currency per config currency; unknown → only explicit market amounts apply. */
  rate?: number;
  /** Buyer signed in to their customer account (a guest only typed an email). */
  isSignedIn?: boolean;
  /** Date of the buyer's last claim (customer metafield), YYYY-MM-DD or a full timestamp. */
  lastClaim?: string;
  /** Shop's date, YYYY-MM-DD. */
  today?: string;
  lines: RuleLine[];
}

export type Violation =
  | {type: 'max_quantity'; title: string; max: number; quantity: number}
  | {type: 'min_subtotal'; minimum: number; subtotal: number; currencyCode: string; firstOrder: boolean}
  | {type: 'incompatible'; titles: string[]; label: string}
  | {type: 'min_quantity'; title: string; min: number; quantity: number}
  | {type: 'case_pack'; title: string; size: number; quantity: number}
  | {type: 'consent'; id: string; error: string}
  | {type: 'country_restriction'; title: string; countryCode: string; shipsTo: string[]}
  | {type: 'once_per_period'; label: string; days: number; nextDate?: string};

/** Every rule the cart breaks, in config order. Gift lines never count. */
export function violations(config: CartRulesConfig, cart: RuleCart): Violation[] {
  const paid = cart.lines.filter((line) => !line.isGift);
  const excluded = new Set(config.excludedProductIds);
  const out: Violation[] = [];

  for (const rule of config.rules) {
    if (rule.buyer === 'wholesale' ? !cart.isWholesale : rule.buyer && rule.buyer !== (cart.isB2B ? 'b2b' : 'retail')) continue;

    if (rule.type === 'max_quantity') {
      for (const {title, quantity} of perProduct(paid.filter((l) => rule.productIds.includes(l.productId)))) {
        if (quantity > rule.max) out.push({type: 'max_quantity', title, max: rule.max, quantity});
      }
    } else if (rule.type === 'min_quantity') {
      const covered = paid.filter((l) => (rule.productIds ? rule.productIds.includes(l.productId) : !excluded.has(l.productId)));
      for (const {title, quantity} of perProduct(covered)) {
        if (quantity < rule.min) out.push({type: 'min_quantity', title, min: rule.min, quantity});
      }
    } else if (rule.type === 'case_pack') {
      for (const {title, quantity} of perProduct(paid.filter((l) => rule.productIds.includes(l.productId)))) {
        if (quantity % rule.size !== 0) out.push({type: 'case_pack', title, size: rule.size, quantity});
      }
    } else if (rule.type === 'country_restriction') {
      const country = cart.deliveryCountry?.toUpperCase();
      if (!country) continue;
      const seen = new Set<string>();
      for (const line of paid) {
        const shipsTo = line.shipsTo?.map((c) => c.trim().toUpperCase()).filter(Boolean);
        if (!shipsTo?.length || shipsTo.includes(country) || seen.has(line.productId)) continue;
        seen.add(line.productId);
        out.push({type: 'country_restriction', title: line.title, countryCode: country, shipsTo});
      }
    } else if (rule.type === 'once_per_period') {
      if (!paid.some((l) => rule.productIds.includes(l.productId))) continue;
      const claimed = cart.lastClaim?.slice(0, 10);
      if (!claimed || !cart.today || !ISO_DATE.test(claimed)) continue;
      const nextDate = addDays(claimed, rule.days);
      if (cart.today >= nextDate) continue;
      out.push({type: 'once_per_period', label: rule.label, days: rule.days, ...(cart.isSignedIn ? {nextDate} : {})});
    } else if (rule.type === 'consent') {
      if (paid.some((l) => rule.productIds.includes(l.productId)) && !cart.consents?.includes(rule.id)) {
        out.push({type: 'consent', id: rule.id, error: rule.error});
      }
    } else if (rule.type === 'min_subtotal') {
      const firstOrder = Boolean(cart.isFirstOrder) && rule.firstOrderAmount !== undefined;
      const minimum = firstOrder
        ? amountIn(rule.firstOrderAmount!, rule.firstOrderAmounts, rule.currencyCode, cart)
        : amountIn(rule.amount, rule.amounts, rule.currencyCode, cart);
      if (minimum === null) continue;
      const notCounted = cart.lines.filter((l) => l.isGift || excluded.has(l.productId)).reduce((sum, l) => sum + l.subtotal, 0);
      const counted = paid.filter((l) => !excluded.has(l.productId)).reduce((sum, l) => sum + l.subtotal, 0);
      const subtotal = round2(cart.subtotal !== undefined ? cart.subtotal - notCounted : counted);
      // A cart of excluded items only (a sample kit, a service) has nothing the minimum applies to.
      if (paid.some((l) => !excluded.has(l.productId)) && subtotal < minimum) {
        out.push({type: 'min_subtotal', minimum, subtotal, currencyCode: cart.currencyCode, firstOrder});
      }
    } else {
      const present = new Map<string, string>();
      for (const line of paid) if (rule.productIds.includes(line.productId)) present.set(line.productId, line.title);
      if (present.size > 1) out.push({type: 'incompatible', titles: [...present.values()], label: rule.label});
    }
  }
  return highestMinimumOnly(out);
}

/** A buyer under two minimums (retail + wholesale) only needs to hear the higher one. */
function highestMinimumOnly(found: Violation[]): Violation[] {
  const minimums = found.filter((v) => v.type === 'min_subtotal');
  const top = minimums.reduce<Violation | null>((best, v) => (best?.type === 'min_subtotal' && best.minimum >= v.minimum ? best : v), null);
  return found.filter((v) => v.type !== 'min_subtotal' || v === top);
}

/** Consent rules that apply to these product ids (for the checkbox block). */
export function consentsFor(config: CartRulesConfig, productIds: string[]): Array<Extract<CartRule, {type: 'consent'}>> {
  return config.rules.filter(
    (r): r is Extract<CartRule, {type: 'consent'}> => r.type === 'consent' && r.productIds.some((id) => productIds.includes(id)),
  );
}

/** "final-sale, age-18" ⇄ ['final-sale', 'age-18']. */
export function parseConsents(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

/** Quantity per product, added up across split lines (a discount can split one product in two). */
function perProduct(lines: RuleLine[]): Array<{title: string; quantity: number}> {
  const totals = new Map<string, {title: string; quantity: number}>();
  for (const line of lines) {
    const entry = totals.get(line.productId) ?? {title: line.title, quantity: 0};
    entry.quantity += line.quantity;
    totals.set(line.productId, entry);
  }
  return [...totals.values()];
}

/** Round market amount if set, the config amount in its own currency, else converted; unknown → null. */
function amountIn(amount: number, amounts: Record<string, number> | undefined, currencyCode: string, cart: RuleCart): number | null {
  const explicit = amounts?.[cart.currencyCode];
  if (explicit !== undefined) return explicit;
  if (cart.currencyCode === currencyCode) return amount;
  return cart.rate !== undefined ? round2(amount * cart.rate) : null;
}

/** Smallest valid case-pack quantities around `quantity` (lower is 0 when below one case). */
export function casePackOptions(size: number, quantity: number): {lower: number; upper: number} {
  const lower = Math.floor(quantity / size) * size;
  return {lower, upper: lower + size};
}

export function parseCartRules(raw: unknown): CartRulesConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1 || !Array.isArray(c.rules)) return null;
  const ids = (list: unknown) => Array.isArray(list) && list.length > 0 && list.every((id) => typeof id === 'string');
  const count = (n: unknown) => Number.isInteger(n) && (n as number) > 0;
  const money = (n: unknown) => typeof n === 'number' && n > 0;
  const rules = c.rules.filter((r: any): r is CartRule => {
    if (!r) return false;
    if (r.buyer !== undefined && r.buyer !== 'b2b' && r.buyer !== 'retail' && r.buyer !== 'wholesale') return false;
    if (r.type === 'min_quantity') return (r.productIds === undefined || ids(r.productIds)) && count(r.min);
    if (r.type === 'country_restriction') return true;
    if (r.type === 'once_per_period') return ids(r.productIds) && count(r.days) && typeof r.label === 'string';
    if (r.type === 'consent') return ids(r.productIds) && typeof r.id === 'string' && /^[a-z0-9-]+$/.test(r.id) && typeof r.label === 'string' && typeof r.error === 'string';
    if (r.type === 'case_pack') return ids(r.productIds) && count(r.size) && r.size > 1;
    if (r.type === 'max_quantity') return ids(r.productIds) && Number.isInteger(r.max) && r.max > 0 && typeof r.label === 'string';
    if (r.type === 'min_subtotal') return money(r.amount) && typeof r.currencyCode === 'string' && (r.firstOrderAmount === undefined || money(r.firstOrderAmount));
    if (r.type === 'incompatible') return ids(r.productIds) && r.productIds.length > 1 && typeof r.label === 'string';
    return false;
  });
  const excludedProductIds = Array.isArray(c.excludedProductIds)
    ? c.excludedProductIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  return {version: 1, rules, excludedProductIds};
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (n: number) => Math.round(n * 100) / 100;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
