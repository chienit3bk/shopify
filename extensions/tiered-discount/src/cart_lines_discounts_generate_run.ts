import {
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
  type CartOperation,
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import {codesToReject, isOnSale, parseTiersConfig, spendExclusion, spendProgress, volumeProgress, volumeRuleIndex} from '../../../shared/tiers/tiers';

/**
 * One config, two discount classes:
 *   PRODUCT — volume tiers per SKU (quantity summed across lines of the same variant), one
 *             table per product group (`volume` + `volumeRules`),
 *   ORDER   — spend tiers on the subtotal of the lines that count (no gifts, no excluded products,
 *             optionally no sale items or gift cards), and only those lines get the % off.
 */
export function cartLinesDiscountsGenerateRun(input: CartInput): CartLinesDiscountsGenerateRunResult {
  const config = parseTiersConfig(input.shop.config?.jsonValue);
  if (!config) return {operations: []};

  const lines = input.cart.lines.map((line) => ({
    id: line.id,
    quantity: line.quantity,
    subtotal: Number(line.cost.subtotalAmount.amount),
    isGift: Boolean(line.giftRule?.value),
    variantId: line.merchandise.__typename === 'ProductVariant' ? line.merchandise.id : '',
    productId: line.merchandise.__typename === 'ProductVariant' ? line.merchandise.product.id : '',
    isGiftCard: line.merchandise.__typename === 'ProductVariant' && line.merchandise.product.isGiftCard,
    onSale: isOnSale(
      Number(line.cost.amountPerQuantity.amount),
      line.cost.compareAtAmountPerQuantity ? Number(line.cost.compareAtAmountPerQuantity.amount) : null,
    ),
  }));
  const operations: CartOperation[] = [];

  const rejected = codesToReject(config.rejectCodes, input.enteredDiscountCodes, lines.some((line) => line.onSale));
  if (rejected.length) {
    operations.push({
      enteredDiscountCodesReject: {codes: rejected.map((code) => ({code})), message: config.rejectCodes!.message},
    });
  }

  if ((config.volume || config.volumeRules?.length) && input.discount.discountClasses.includes(DiscountClass.Product)) {
    const rules = volumeRuleIndex(config);
    const eligible = lines
      .filter((line) => !line.isGift)
      .map((line) => ({line, rule: rules.get(line.productId) ?? null}))
      .filter((entry) => entry.rule !== null);
    const perVariant = new Map<string, number>();
    eligible.forEach(({line}) => perVariant.set(line.variantId, (perVariant.get(line.variantId) ?? 0) + line.quantity));

    const candidates = eligible.flatMap(({line, rule}) => {
      const tier = volumeProgress(rule!.tiers, perVariant.get(line.variantId) ?? 0).current;
      if (!tier) return [];
      return [
        {
          message: `${rule!.label} — ${tier.percent}% off`,
          targets: [{cartLine: {id: line.id}}],
          value: {percentage: {value: tier.percent.toFixed(1)}},
        },
      ];
    });
    if (candidates.length) {
      operations.push({productDiscountsAdd: {candidates, selectionStrategy: ProductDiscountSelectionStrategy.All}});
    }
  }

  if (config.spend && input.discount.discountClasses.includes(DiscountClass.Order)) {
    const spend = config.spend;
    const notCounted = lines.filter((line) => spendExclusion(spend, line) !== null);
    const subtotal = lines.filter((line) => !notCounted.includes(line)).reduce((sum, line) => sum + line.subtotal, 0);
    const tier = spendProgress(
      config,
      subtotal,
      input.cart.cost.subtotalAmount.currencyCode,
      Number(input.presentmentCurrencyRate) || undefined,
    ).current;
    if (tier) {
      operations.push({
        orderDiscountsAdd: {
          candidates: [
            {
              message: `${config.spend.label} — ${tier.percent}% off`,
              targets: [{orderSubtotal: {excludedCartLineIds: notCounted.map((line) => line.id)}}],
              value: {percentage: {value: tier.percent.toFixed(1)}},
            },
          ],
          selectionStrategy: OrderDiscountSelectionStrategy.First,
        },
      });
    }
  }

  return {operations};
}
