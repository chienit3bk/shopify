/**
 * Fixed-price bundles: one product in the store and the cart, its components on the order.
 * A case pack is the same thing with one component ("Case of 6" → 6 × Cleanser), so stock is
 * counted per bottle.
 *
 * The bundle variant carries its components in a metafield. The cart transform Function
 * expands the bundle line into them and splits the bundle's own price across them, weighted by
 * each component's list price, so the parts always add up to exactly what the buyer was shown.
 * Pure, so it is unit-tested without a cart.
 */

export interface BundleComponent {
  variantId: string;
  quantity: number;
  /** List price per unit in any currency; only the ratios matter. */
  weight: number;
}

export interface BundleConfig {
  version: 1;
  components: BundleComponent[];
}

export interface PricedComponent {
  variantId: string;
  quantity: number;
  /** Price per unit, 2 decimals, in the cart currency. */
  unitPrice: number;
}

/**
 * Splits `bundlePrice` (one bundle, cart currency) across the components by weight. Unit prices
 * are rounded down to the cent and the leftover cents go to the components in order, one cent per
 * unit at a time. Cents still left (fewer than any quantity: a $100 case of 6) go on one unit of
 * the first component, split out as its own entry, so Σ unitPrice × quantity is always exact.
 */
export function priceComponents(bundlePrice: number, components: BundleComponent[]): PricedComponent[] {
  const totalCents = Math.round(bundlePrice * 100);
  const totalWeight = components.reduce((sum, c) => sum + c.weight * c.quantity, 0);
  if (components.length === 0 || totalWeight <= 0 || totalCents < 0) return [];

  const unitCents = components.map((c) => Math.floor((totalCents * c.weight) / totalWeight));
  let left = totalCents - unitCents.reduce((sum, cents, i) => sum + cents * components[i].quantity, 0);
  for (let i = 0; left > 0 && i < components.length * 2; i++) {
    const k = i % components.length;
    if (components[k].quantity <= left) {
      unitCents[k] += 1;
      left -= components[k].quantity;
    }
  }
  const priced = components.map((c, i) => ({variantId: c.variantId, quantity: c.quantity, unitPrice: unitCents[i] / 100}));
  if (left > 0) {
    const first = priced[0];
    priced.splice(0, 1, {...first, quantity: first.quantity - 1}, {...first, quantity: 1, unitPrice: (unitCents[0] + left) / 100});
  }
  return priced.filter((p) => p.quantity > 0);
}

export function parseBundleConfig(raw: unknown): BundleConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1 || !Array.isArray(c.components) || c.components.length === 0) return null;
  const valid = c.components.every(
    (p: any) =>
      p &&
      typeof p.variantId === 'string' &&
      p.variantId.startsWith('gid://shopify/ProductVariant/') &&
      Number.isInteger(p.quantity) &&
      p.quantity > 0 &&
      typeof p.weight === 'number' &&
      p.weight > 0,
  );
  if (!valid) return null;
  // One component is a case pack ("6 × Cleanser"); a single unit of one product isn't a bundle.
  if (c.components.length === 1 && c.components[0].quantity < 2) return null;
  return {
    version: 1,
    components: c.components.map((p: any) => ({variantId: p.variantId, quantity: p.quantity, weight: p.weight})),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
