/**
 * Import charge: a percentage of the product value, added when the order ships to one of a
 * list of countries (the demo: 10% on orders to the US).
 *
 * The cart transform Function adds it on the server, so it is recalculated on every cart and
 * checkout change and no theme script can miss it. Each product line is expanded into
 * [the product at its own price, the charge variant at percent × that price], so the charge is a
 * line of its own on the checkout and on the order, and multi-item carts are exact per item.
 * Lines expand on every Shopify plan; only `lineUpdate` needs Plus.
 * Pure, so it is unit-tested without a cart.
 */

export interface ImportChargeConfig {
  version: 1;
  /** The charge product's variant (not taxable, no shipping, not tracked). */
  variantId: string;
  /** Whole or decimal percent of the product price, e.g. 10. */
  percent: number;
  /** ISO country codes the charge applies to, e.g. ["US"]. */
  countries: string[];
}

export function parseImportChargeConfig(raw: unknown): ImportChargeConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1) return null;
  if (typeof c.variantId !== 'string' || !c.variantId.startsWith('gid://shopify/ProductVariant/')) return null;
  if (typeof c.percent !== 'number' || !(c.percent > 0) || c.percent > 100) return null;
  if (!Array.isArray(c.countries) || c.countries.length === 0) return null;
  const countries = c.countries.filter((x: unknown) => typeof x === 'string').map((x: string) => x.toUpperCase());
  if (countries.length === 0) return null;
  return {version: 1, variantId: c.variantId, percent: c.percent, countries};
}

export function appliesTo(config: ImportChargeConfig, countryCode: string | null | undefined): boolean {
  return !!countryCode && config.countries.includes(countryCode.toUpperCase());
}

/** The charge on one unit, rounded to the cent (half up). */
export function chargePerUnit(unitPrice: number, percent: number): number {
  if (!(unitPrice > 0)) return 0;
  return Math.round((Math.round(unitPrice * 100) * percent) / 100) / 100;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
