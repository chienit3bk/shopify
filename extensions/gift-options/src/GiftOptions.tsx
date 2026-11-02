import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {GIFT_MESSAGE_ATTRIBUTE, cleanMessage, hasWrap, parseGiftOptionsConfig, toggleWrap} from '../../../shared/gift/options';

export default async () => {
  render(<GiftOptions />, document.body);
};

const PRICE_QUERY = `query WrapPrice($id: ID!) { node(id: $id) { ... on ProductVariant { price { amount currencyCode } } } }`;

/**
 * "This order is a gift": a card message (the "Gift message" cart attribute, on the order) and
 * an optional paid gift wrap (a service line). Unticking clears both.
 */
function GiftOptions() {
  const t = shopify.i18n.translate;
  const entry = shopify.appMetafields.value.find(
    ({target, metafield}) => target.type === 'shop' && metafield.key === 'gift_options_config',
  );
  const config = entry ? parseGiftOptionsConfig(entry.metafield.value) : null;

  const lines = shopify.lines.value.map((line) => ({
    id: line.id,
    quantity: line.quantity,
    merchandiseId: line.merchandise.id,
    attributes: line.attributes,
  }));
  const savedMessage = shopify.attributes.value.find((a) => a.key === GIFT_MESSAGE_ATTRIBUTE)?.value ?? '';
  const wrapped = config ? hasWrap(config, lines) : false;

  const [isGift, setIsGift] = useState(savedMessage !== '' || wrapped);
  const [draft, setDraft] = useState(savedMessage);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState<{amount: string; currencyCode: string} | null>(null);

  useEffect(() => {
    if (!config) return;
    shopify
      .query<{node: {price: {amount: string; currencyCode: string}} | null}>(PRICE_QUERY, {variables: {id: config.wrapVariantId}})
      .then(({data}) => setPrice(data?.node?.price ?? null))
      .catch((error) => console.error('[gift-options] price query failed', error));
  }, [config?.wrapVariantId]);

  const instructions = shopify.instructions.value;
  if (!config || !instructions.attributes.canUpdateAttributes) return null;
  const canWrap = price !== null && instructions.lines.canAddCartLine && instructions.lines.canRemoveCartLine;

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }

  function saveMessage(text: string) {
    const message = cleanMessage(text, config!.messageMaxLength);
    setDraft(message);
    if (message === savedMessage) return;
    return run(() =>
      shopify.applyAttributeChange(
        message
          ? {type: 'updateAttribute', key: GIFT_MESSAGE_ATTRIBUTE, value: message}
          : {type: 'removeAttribute', key: GIFT_MESSAGE_ATTRIBUTE},
      ),
    );
  }

  function setWrap(on: boolean) {
    return run(async () => {
      for (const change of toggleWrap(config!, lines, on)) await shopify.applyCartLinesChange(change);
    });
  }

  function setGift(on: boolean) {
    setIsGift(on);
    if (on) return;
    setDraft('');
    return run(async () => {
      if (savedMessage) await shopify.applyAttributeChange({type: 'removeAttribute', key: GIFT_MESSAGE_ATTRIBUTE});
      for (const change of toggleWrap(config!, lines, false)) await shopify.applyCartLinesChange(change);
    });
  }

  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack gap="base">
        <s-checkbox
          label={t('isGift')}
          checked={isGift}
          disabled={busy}
          onChange={(event) => setGift((event.currentTarget as HTMLElementTagNameMap['s-checkbox']).checked ?? false)}
        />
        {isGift && (
          <s-stack gap="small-200">
            <s-text-area
              label={t('message')}
              rows={3}
              maxLength={config.messageMaxLength}
              value={draft}
              disabled={busy}
              onInput={(event) => setDraft((event.currentTarget as HTMLElementTagNameMap['s-text-area']).value ?? '')}
              onChange={(event) => saveMessage((event.currentTarget as HTMLElementTagNameMap['s-text-area']).value ?? '')}
            />
            <s-text type="small" color="subdued">
              {t('messageHelp', {used: draft.length, max: config.messageMaxLength})}
            </s-text>
          </s-stack>
        )}
        {isGift && canWrap && (
          <s-checkbox
            label={t('wrap', {price: shopify.i18n.formatCurrency(Number(price!.amount), {currency: price!.currencyCode})})}
            checked={wrapped}
            disabled={busy}
            onChange={(event) => setWrap((event.currentTarget as HTMLElementTagNameMap['s-checkbox']).checked ?? false)}
          />
        )}
      </s-stack>
    </s-box>
  );
}
