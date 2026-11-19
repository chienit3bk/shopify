import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  MAX_POLLS,
  POLL_MS,
  byRarity,
  oddsLabel,
  parseReveal,
  revealStatus,
  type RevealDraw,
} from '../../../shared/mystery/reveal';

export default async (): Promise<void> => {
  render(<Extension />, document.body);
};

// Written by the "Mystery box draw" Flow workflow a few seconds after payment.
// No `shop` field: it is ACCESS_DENIED until the buyer is fully signed in.
const QUERY = `query MysteryDraw($id: ID!) {
  order(id: $id) {
    draw: metafield(namespace: "custom", key: "mystery_draw") { value }
  }
}`;

interface Result {
  data?: {order: {draw: {value: string} | null} | null} | null;
  errors?: unknown[];
}

function Extension() {
  const t = shopify.i18n.translate;
  const orderId = shopify.order.value?.id;
  // A box = a product in this order with a published prize list.
  const hasBox = shopify.appMetafields.value.some(
    (entry): boolean => entry.target.type === 'product' && entry.metafield.key === 'mystery_prizes' && !!entry.metafield.value,
  );
  const [draws, setDraws] = useState<RevealDraw[] | null>(null);
  const [polls, setPolls] = useState(0);

  useEffect((): (() => void) | undefined => {
    if (!orderId || !hasBox) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;
    const load = (): void => {
      fetch('shopify://customer-account/api/2026-10/graphql.json', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query: QUERY, variables: {id: orderId}}),
      })
        .then((response): Promise<Result> => response.json())
        .then(({data, errors}: Result): RevealDraw[] | null => {
          if (errors) console.error('mystery-box-reveal', JSON.stringify(errors));
          return parseReveal(data?.order?.draw?.value);
        })
        .catch((error: unknown): null => {
          console.error(error);
          return null;
        })
        .then((found: RevealDraw[] | null): void => {
          if (stopped) return;
          count += 1;
          setPolls(count);
          if (found) setDraws(found);
          else if (count < MAX_POLLS) timer = setTimeout(load, POLL_MS);
        });
    };
    load();
    return (): void => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [orderId, hasBox]);

  if (!orderId || !hasBox) return null;
  const status = revealStatus(draws, polls);
  const shopUrl = shopify.shop.storefrontUrl ?? `https://${shopify.shop.myshopifyDomain}`;

  return (
    <s-section heading={t('heading')}>
      {status === 'pending' ? (
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-spinner accessibilityLabel={t('pending')} />
          <s-text>{t('pending')}</s-text>
        </s-stack>
      ) : status === 'late' ? (
        <s-text color="subdued">{t('late')}</s-text>
      ) : (
        <s-stack gap="base">
          {byRarity(draws ?? []).map((d, i) => (
            <s-stack key={`${d.prize}-${i}`} gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone={d.odds <= 5 ? 'critical' : 'neutral'}>{d.tier || t('box', {index: i + 1})}</s-badge>
                <s-text color="subdued">{t('odds', {odds: oddsLabel(d.odds)})}</s-text>
              </s-stack>
              <s-text type="strong">{d.prize}</s-text>
              {d.prizeHandle ? (
                <s-link href={`${shopUrl}/products/${encodeURIComponent(d.prizeHandle)}`}>{t('view')}</s-link>
              ) : null}
            </s-stack>
          ))}
          <s-text color="subdued">{t('fair')}</s-text>
        </s-stack>
      )}
    </s-section>
  );
}
