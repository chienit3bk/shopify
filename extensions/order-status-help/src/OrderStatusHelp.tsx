import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  STEPS,
  helpLinks,
  shipments,
  type Fulfillment,
  type Shipment,
} from '../../../shared/customer-account/order-help';

export default async () => {
  render(<Extension />, document.body);
};

// No `shop` field here: it is ACCESS_DENIED until the buyer is fully signed in
// (pre-authenticated order links, staff previews). The shop URL comes from the
// extension API instead, so help links render in every state.
const QUERY = `query OrderTracking($id: ID!) {
  order(id: $id) {
    fulfillments(first: 10) {
      nodes {
        id
        status
        latestShipmentStatus
        estimatedDeliveryAt
        trackingInformation { number url company }
      }
    }
  }
}`;

interface Result {
  data?: {order: {fulfillments: {nodes: Fulfillment[]}} | null} | null;
  errors?: unknown[];
}

function Extension() {
  const t = shopify.i18n.translate;
  const order = shopify.order.value;
  const orderId = order?.id;
  const shopUrl = shopify.shop.storefrontUrl ?? `https://${shopify.shop.myshopifyDomain}`;
  // null = tracking not readable (loading or not signed in): help links still show.
  const [list, setList] = useState<Shipment[] | null>(null);

  useEffect(() => {
    if (!orderId) return;
    fetch('shopify://customer-account/api/2026-10/graphql.json', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: QUERY, variables: {id: orderId}}),
    })
      .then((response) => response.json())
      .then(({data, errors}: Result) => {
        if (errors) console.error('order-status-help', JSON.stringify(errors));
        if (!data?.order) return;
        setList(shipments(data.order.fulfillments.nodes));
      })
      .catch(console.error);
  }, [orderId]);

  if (!order) return null;
  const links = helpLinks(shopUrl, order.name, (list?.length ?? 0) > 0);

  return (
    <s-section heading={t('heading')}>
      <s-stack gap="large">
        {list === null ? null : list.length === 0 ? (
          <s-text color="subdued">{t('notShipped')}</s-text>
        ) : (
          list.map((s, i) => (
            <ShipmentRow
              key={s.id}
              shipment={s}
              title={list.length > 1 ? t('shipment', {index: i + 1}) : null}
            />
          ))
        )}
        {list === null ? null : <s-divider />}
        <s-stack gap="small-200">
          <s-text type="strong">{t('helpHeading', {order: order.name})}</s-text>
          {links.map((link) => (
            <s-link key={link.topic} href={link.href}>
              {t(`help.${link.topic}`)}
            </s-link>
          ))}
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function ShipmentRow({shipment: s, title}: {shipment: Shipment; title: string | null}) {
  const t = shopify.i18n.translate;
  const stepLabel = t(`step.${STEPS[s.step]}`);
  return (
    <s-stack gap="small-200">
      {title ? <s-text type="strong">{title}</s-text> : null}
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-badge tone={s.step === 3 ? 'auto' : 'neutral'}>{stepLabel}</s-badge>
        <s-text color="subdued">{t('stepOf', {step: s.step + 1})}</s-text>
        {s.attention && s.status ? (
          <s-badge tone="critical">{t(`attention.${s.status}`)}</s-badge>
        ) : null}
      </s-stack>
      {s.eta ? (
        <s-text>{t('eta', {date: shopify.i18n.formatDate(new Date(s.eta), {dateStyle: 'medium'})})}</s-text>
      ) : null}
      {s.carrier || s.number ? (
        <s-text color="subdued">{t('carrier', {carrier: s.carrier ?? '', number: s.number ?? ''})}</s-text>
      ) : null}
      {s.url ? (
        <s-button href={s.url} target="_blank">
          {t('track')}
        </s-button>
      ) : null}
    </s-stack>
  );
}
