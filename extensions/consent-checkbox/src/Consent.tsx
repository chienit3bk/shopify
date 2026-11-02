import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {consentsFor, parseCartRules, parseConsents} from '../../../shared/cart/rules';

export default async () => {
  render(<Consent />, document.body);
};

const ATTRIBUTE = 'Consent';
const GIFT_ATTRIBUTE = '_free_gift';

/**
 * Required checkboxes for products that need the buyer's explicit "yes" (final sale, age 18+…).
 * Ticked ids go to the "Consent" cart attribute, so the merchant sees them on the order; the
 * cart-rules Function refuses the order until every box that applies is ticked.
 */
function Consent() {
  const [busy, setBusy] = useState(false);
  const entry = shopify.appMetafields.value.find(
    ({target, metafield}) => target.type === 'shop' && metafield.key === 'cart_rules_config',
  );
  const config = entry ? parseCartRules(entry.metafield.value) : null;
  if (!config || !shopify.instructions.value.attributes.canUpdateAttributes) return null;

  const productIds = shopify.lines.value
    .filter((line) => !line.attributes.some((a) => a.key === GIFT_ATTRIBUTE && a.value))
    .map((line) => line.merchandise.product.id);
  const rules = consentsFor(config, productIds);
  if (rules.length === 0) return null;

  const ticked = parseConsents(shopify.attributes.value.find((a) => a.key === ATTRIBUTE)?.value);

  async function toggle(id: string, on: boolean) {
    const next = on ? [...new Set([...ticked, id])] : ticked.filter((t) => t !== id);
    setBusy(true);
    try {
      await shopify.applyAttributeChange({type: 'updateAttribute', key: ATTRIBUTE, value: next.join(', ')});
    } finally {
      setBusy(false);
    }
  }

  return (
    <s-stack gap="small-200">
      {rules.map((rule) => (
        <s-checkbox
          key={rule.id}
          label={rule.label}
          checked={ticked.includes(rule.id)}
          disabled={busy}
          required
          onChange={(event) => toggle(rule.id, (event.currentTarget as HTMLElementTagNameMap['s-checkbox']).checked ?? false)}
        />
      ))}
    </s-stack>
  );
}
