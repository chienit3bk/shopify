import type {CartTransformRunInput, CartTransformRunResult, Operation} from '../generated/api';
import {parseBundleConfig, priceComponents} from '../../../shared/bundle/bundle';

/**
 * Fixed-price bundles: a variant with `custom.bundle_components` is expanded into its components,
 * priced so they add up to the bundle's own price. The bundle variant has `requiresComponents`,
 * so it can never be bought without this expansion.
 */
export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const operations: Operation[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    const config = parseBundleConfig(line.merchandise.bundle?.jsonValue);
    if (!config) continue;

    const priced = priceComponents(Number(line.cost.amountPerQuantity.amount), config.components);
    if (priced.length === 0) continue;
    operations.push({
      lineExpand: {
        cartLineId: line.id,
        expandedCartItems: priced.map((c) => ({
          merchandiseId: c.variantId,
          quantity: c.quantity,
          price: {adjustment: {fixedPricePerUnit: {amount: c.unitPrice.toFixed(2)}}},
        })),
      },
    });
  }

  return {operations};
}
