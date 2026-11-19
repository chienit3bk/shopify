import type {CartTransformRunInput, CartTransformRunResult, Operation} from '../generated/api';
import {parseBundleConfig, priceComponents} from '../../../shared/bundle/bundle';
import {type BuilderLine, parseBuilderConfig, planBuilderMerges} from '../../../shared/bundle/builder';
import {appliesTo, chargePerUnit, parseImportChargeConfig} from '../../../shared/import-charge/import-charge';

/**
 * Two kinds of bundle share this one cart transform (a store has a single one):
 * - Fixed-price bundles: a variant with `custom.bundle_components` is expanded into its components,
 *   priced so they add up to the bundle's own price. The bundle variant has `requiresComponents`,
 *   so it can never be bought without this expansion.
 * - Build-your-own bundles: items the buyer picked on the product page (line property `_builder`)
 *   are merged into one line at the bundle price from the app's shop config.
 * - Import charge: when the buyer's country is in the app's `import_charge` config, every physical
 *   product line gets the charge (percent × its price) as a component of its own. A fixed bundle
 *   carries it as one more component; merged build-your-own lines don't get it (a line can't be
 *   both merged and expanded).
 */
export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const operations: Operation[] = [];
  const importCharge = parseImportChargeConfig(input.shop.importCharge?.jsonValue);
  const charging = importCharge && appliesTo(importCharge, input.localization.country.isoCode) ? importCharge : null;
  const chargeItem = (unitPrice: number) => {
    const amount = charging ? chargePerUnit(unitPrice, charging.percent) : 0;
    return amount > 0
      ? [{merchandiseId: charging!.variantId, quantity: 1, price: {adjustment: {fixedPricePerUnit: {amount: amount.toFixed(2)}}}}]
      : [];
  };
  const handled = new Set<string>();

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    const config = parseBundleConfig(line.merchandise.bundle?.jsonValue);
    if (!config) continue;

    const bundlePrice = Number(line.cost.amountPerQuantity.amount);
    const priced = priceComponents(bundlePrice, config.components);
    if (priced.length === 0) continue;
    handled.add(line.id);
    operations.push({
      lineExpand: {
        cartLineId: line.id,
        expandedCartItems: [
          ...priced.map((c) => ({
            merchandiseId: c.variantId,
            quantity: c.quantity,
            price: {adjustment: {fixedPricePerUnit: {amount: c.unitPrice.toFixed(2)}}},
          })),
          ...chargeItem(bundlePrice),
        ],
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
      merge.lines.forEach((l) => handled.add(l.cartLineId));
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

  if (charging) {
    for (const line of input.cart.lines) {
      const m = line.merchandise;
      if (m.__typename !== 'ProductVariant' || !m.requiresShipping || handled.has(line.id)) continue;
      const unitPrice = Number(line.cost.amountPerQuantity.amount);
      const charge = chargeItem(unitPrice);
      if (charge.length === 0) continue;
      operations.push({
        lineExpand: {
          cartLineId: line.id,
          expandedCartItems: [
            {merchandiseId: m.id, quantity: 1, price: {adjustment: {fixedPricePerUnit: {amount: unitPrice.toFixed(2)}}}},
            ...charge,
          ],
        },
      });
    }
  }

  return {operations};
}
