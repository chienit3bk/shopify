import type {CartTransformRunInput, CartTransformRunResult, Operation} from '../generated/api';
import {parseBundleConfig, priceComponents} from '../../../shared/bundle/bundle';
import {type BuilderLine, parseBuilderConfig, planBuilderMerges} from '../../../shared/bundle/builder';

/**
 * Two kinds of bundle share this one cart transform (a store has a single one):
 * - Fixed-price bundles: a variant with `custom.bundle_components` is expanded into its components,
 *   priced so they add up to the bundle's own price. The bundle variant has `requiresComponents`,
 *   so it can never be bought without this expansion.
 * - Build-your-own bundles: items the buyer picked on the product page (line property `_builder`)
 *   are merged into one line at the bundle price from the app's shop config.
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

  const builder = parseBuilderConfig(input.shop.builder?.jsonValue);
  if (builder) {
    const lines: BuilderLine[] = [];
    for (const line of input.cart.lines) {
      if (line.merchandise.__typename !== 'ProductVariant') continue;
      lines.push({
        id: line.id,
        quantity: line.quantity,
        unitPrice: Number(line.cost.amountPerQuantity.amount),
        productId: line.merchandise.product.id,
        group: line.group?.value ?? null,
      });
    }
    for (const merge of planBuilderMerges(lines, builder, Number(input.presentmentCurrencyRate))) {
      operations.push({
        linesMerge: {
          parentVariantId: builder.parentVariantId,
          title: builder.title,
          cartLines: merge.lines,
          price: {percentageDecrease: {value: String(merge.percentageDecrease)}},
        },
      });
    }
  }

  return {operations};
}
