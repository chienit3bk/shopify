/**
 * Build-your-own bundle: the buyer picks N items from a list, and the Cart Transform Function
 * merges them into one line at the bundle price ("Pick any 3 for $69").
 *
 * The storefront block tags every picked line with the same `_builder` property. The Function
 * trusts nothing else from the browser: the size, price and eligible products come from the app's
 * shop config, so a buyer who edits a line property cannot get a cheaper bundle. `linesMerge` only
 * takes a percentage, so the fixed price is turned into the percent that lands on it.
 * Pure, so it is unit-tested without a cart.
 */

export const BUILDER_PROPERTY = '_builder';

export interface BuilderConfig {
  version: 1;
  /** A published variant that stands for the merged line (its title and image are shown). */
  parentVariantId: string;
  title: string;
  /** How many items make a bundle. */
  size: number;
  /** Price of one bundle in the shop currency. */
  price: number;
  /** Products the buyer may pick from. */
  productIds: string[];
}

export interface BuilderLine {
  id: string;
  quantity: number;
  /** Price of one unit in the cart currency. */
  unitPrice: number;
  productId: string;
  /** The `_builder` line property, or null when the line was not picked in the builder. */
  group: string | null;
}

export interface BuilderMerge {
  lines: {cartLineId: string; quantity: number}[];
  /** Percent off the merged lines' list price, 0–100, 4 decimals. */
  percentageDecrease: number;
}

export function parseBuilderConfig(raw: unknown): BuilderConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  const price = Number(c.price);
  if (
    c.version !== 1 ||
    typeof c.parentVariantId !== 'string' ||
    !c.parentVariantId.startsWith('gid://shopify/ProductVariant/') ||
    typeof c.title !== 'string' ||
    !Number.isInteger(c.size) ||
    c.size < 2 ||
    !(price > 0) ||
    !Array.isArray(c.productIds) ||
    c.productIds.length === 0 ||
    !c.productIds.every((id: unknown) => typeof id === 'string' && id.startsWith('gid://shopify/Product/'))
  ) {
    return null;
  }
  return {version: 1, parentVariantId: c.parentVariantId, title: c.title, size: c.size, price, productIds: c.productIds};
}

/**
 * One merge per complete group: `size` units, all from eligible products, all tagged with the
 * same group. Anything else stays a normal cart line at list price, so a half-built bundle never
 * gets the bundle price. `rate` is the presentment currency rate (1 when the cart is in the shop
 * currency). A bundle that would cost more than its parts is not merged.
 */
export function planBuilderMerges(lines: BuilderLine[], config: BuilderConfig, rate = 1): BuilderMerge[] {
  const groups = new Map<string, BuilderLine[]>();
  for (const line of lines) {
    if (!line.group) continue;
    groups.set(line.group, [...(groups.get(line.group) ?? []), line]);
  }

  const merges: BuilderMerge[] = [];
  for (const members of groups.values()) {
    const units = members.reduce((sum, l) => sum + l.quantity, 0);
    if (units !== config.size) continue;
    if (!members.every((l) => config.productIds.includes(l.productId))) continue;

    const list = members.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const target = config.price * rate;
    if (!(list > target)) continue;
    merges.push({
      lines: members.map((l) => ({cartLineId: l.id, quantity: l.quantity})),
      percentageDecrease: Math.round((1 - target / list) * 100 * 10000) / 10000,
    });
  }
  return merges;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
