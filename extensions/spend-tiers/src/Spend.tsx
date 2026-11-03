import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {amountsBeforeDiscounts} from '../../../shared/cart/subtotal';
import {isOnSale, parseTiersConfig, spendExclusion, spendProgress} from '../../../shared/tiers/tiers';

export default async () => {
  render(<Spend />, document.body);
};

const CONFIG_KEY = 'tiers_config';
/** Gift lines (free-gift block) never count towards a spend tier. */
const GIFT_ATTRIBUTE_KEY = '_free_gift';

const VARIANTS_QUERY = `query SpendVariants($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id price { amount } compareAtPrice { amount } product { isGiftCard } } }
}`;
type VariantFlags = Record<string, {onSale: boolean; isGiftCard: boolean}>;
type VariantNode = {id: string; price: {amount: string}; compareAtPrice: {amount: string} | null; product: {isGiftCard: boolean}} | null;

/**
 * "Spend $30.00 more for 10% off" above the discount field. Counts what the Function
 * counts: the lines' amounts before discounts, no gifts, no excluded products, and (when the
 * config says so) no sale items or gift cards.
 */
function Spend() {
  const t = shopify.i18n.translate;
  const entry = shopify.appMetafields.value.find(
    ({target, metafield}) => target.type === 'shop' && metafield.key === CONFIG_KEY,
  );
  const config = entry ? parseTiersConfig(entry.metafield.value) : null;
  const lines = shopify.lines.value;
  const needsFlags = Boolean(config?.spend?.excludeOnSale || config?.spend?.excludeGiftCards);
  const variantIds = [...new Set(lines.map((line) => line.merchandise.id))].sort();
  const [flags, setFlags] = useState<{key: string; value: VariantFlags} | null>(null);

  useEffect(() => {
    if (!needsFlags || variantIds.length === 0) return;
    const key = variantIds.join(',');
    shopify
      .query<{nodes: VariantNode[]}>(VARIANTS_QUERY, {variables: {ids: variantIds}})
      .then(({data}) => {
        const value: VariantFlags = {};
        for (const node of data?.nodes ?? []) {
          if (!node) continue;
          value[node.id] = {
            onSale: isOnSale(Number(node.price.amount), node.compareAtPrice ? Number(node.compareAtPrice.amount) : null),
            isGiftCard: node.product.isGiftCard,
          };
        }
        setFlags({key, value});
      })
      .catch((error) => console.error('[spend-tiers] variant query failed', error));
  }, [needsFlags, variantIds.join(',')]);

  if (!config?.spend) return null;
  // Until we know which lines are on sale, don't show a number the Function might not honour.
  if (needsFlags && flags?.key !== variantIds.join(',')) return null;

  const spend = config.spend;
  const reason = (line: (typeof lines)[number]) =>
    spendExclusion(spend, {
      productId: line.merchandise.product.id,
      isGift: line.attributes.some((attribute) => attribute.key === GIFT_ATTRIBUTE_KEY),
      ...flags?.value[line.merchandise.id],
    });
  const counts = (line: (typeof lines)[number]) => reason(line) === null;
  const saleOrCard = lines.some((line) => reason(line) === 'sale' || reason(line) === 'gift_card');
  const amounts = amountsBeforeDiscounts(shopify.cost.subtotalAmount.value.amount, lines, counts);
  const subtotal = lines.reduce((sum, line, i) => sum + (counts(line) ? amounts[i] : 0), 0);
  const currencyCode = shopify.cost.subtotalAmount.value.currencyCode;
  // No exchange rate in checkout: unknown currencies without an explicit amount stay hidden.
  const {current, next} = spendProgress(config, subtotal, currencyCode, undefined);
  if (!current && !next) return null;

  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack gap="small-200">
        {current && (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-icon type="discount" />
            <s-text type="strong">{t('saving', {label: config.spend.label, percent: current.percent})}</s-text>
          </s-stack>
        )}
        {next && (
          <>
            <s-text>
              {t('spendMore', {
                amount: shopify.i18n.formatCurrency(next.remaining, {currency: currencyCode}),
                percent: next.percent,
              })}
            </s-text>
            <s-progress value={Math.min(1, subtotal / next.threshold)} max={1} accessibilityLabel={t('progress')} />
          </>
        )}
        {saleOrCard && (
          <s-text type="small" color="subdued">
            {t('notCounted')}
          </s-text>
        )}
      </s-stack>
    </s-box>
  );
}
