import {register} from '@shopify/web-pixels-extension';
import {
  GIFT_EVENTS,
  GIFT_EVENT_PREFIX,
  type FunnelState,
  isGiftEventData,
  parseFunnel,
  recordGiftEvent,
  recordOrder,
} from '../../../shared/analytics/gift-funnel';
import {
  type Ga4Event,
  addPaymentInfo,
  addToCart,
  beginCheckout,
  ga4Config,
  measurementProtocolBody,
  measurementProtocolUrl,
  pageView,
  purchase,
  viewItem,
} from '../../../shared/analytics/ga4';
import {GIFT_ATTRIBUTE_KEY} from '../../../shared/free-gift/rules';
import {
  AB_COOKIE,
  AB_EVENT,
  type AbEventKind,
  type AbState,
  type Assignment,
  assignmentFromCheckout,
  parseAbState,
  parseAssignment,
  recordAbEvent,
} from '../../../shared/ab/test';
import {type RefTotals, parseRefTotals, recordRefOrder, refFromAttributes} from '../../../shared/affiliate/ref';

/** Running totals in the storefront's localStorage — readable on the store's own pages, no backend. */
const STORAGE_KEY = 'free_gift_funnel';
/** Orders and revenue per affiliate ref, kept the same way. */
const REF_TOTALS_KEY = 'affiliate_ref_totals';
/** Views, add-to-carts and orders per A/B variant (storefront block ab_variant). */
const AB_TOTALS_KEY = 'ab_test_totals';

register(({analytics, browser, settings}) => {
  // Optional: also POST each event to the merchant's collector (GA4 proxy, Segment, …).
  const endpoint = typeof settings.endpoint === 'string' && settings.endpoint.startsWith('https://') ? settings.endpoint : null;

  // Events arrive back to back (unlock + order); serialize read-modify-write.
  let queue = Promise.resolve();
  function update(change: (state: FunnelState) => FunnelState) {
    queue = queue
      .then(async () => {
        const state = parseFunnel(await browser.localStorage.getItem(STORAGE_KEY));
        await browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(change(state)));
      })
      .catch((error) => console.error('[gift-funnel] storage failed', error));
  }

  let refQueue = Promise.resolve();
  function updateRefTotals(change: (totals: RefTotals) => RefTotals) {
    refQueue = refQueue
      .then(async () => {
        const totals = parseRefTotals(await browser.localStorage.getItem(REF_TOTALS_KEY));
        await browser.localStorage.setItem(REF_TOTALS_KEY, JSON.stringify(change(totals)));
      })
      .catch((error) => console.error('[affiliate] storage failed', error));
  }

  let abQueue = Promise.resolve();
  function updateAb(change: (state: AbState) => AbState) {
    abQueue = abQueue
      .then(async () => {
        const state = parseAbState(await browser.localStorage.getItem(AB_TOTALS_KEY));
        await browser.localStorage.setItem(AB_TOTALS_KEY, JSON.stringify(change(state)));
      })
      .catch((error) => console.error('[ab-test] storage failed', error));
  }

  function countAb(assignment: Assignment, kind: AbEventKind, timestamp: string, order?: {subtotal: number; currencyCode: string}) {
    updateAb((state) => recordAbEvent(state, assignment, kind, order));
    forward({event: `ab_${kind}`, timestamp, experiment: assignment.experiment, variant: assignment.variant, ...order});
  }

  function forward(payload: Record<string, unknown>) {
    if (!endpoint) return;
    fetch(endpoint, {method: 'POST', body: JSON.stringify(payload), keepalive: true}).catch(() => {});
  }

  // Optional: send standard ecommerce events to GA4 (docs/ga4-pixel.md). Off until both settings are real.
  const ga4 = ga4Config(settings);

  function sendGa4(clientId: string, timestamp: string, event: Ga4Event | null) {
    if (!ga4 || !event) return;
    const micros = Date.parse(timestamp) * 1000;
    fetch(measurementProtocolUrl(ga4), {
      method: 'POST',
      body: measurementProtocolBody(clientId, event, Number.isNaN(micros) ? undefined : micros),
      keepalive: true,
    }).catch(() => {});
  }

  if (ga4) {
    analytics.subscribe('page_viewed', (event) => {
      const {location, title} = event.context.document;
      sendGa4(event.clientId, event.timestamp, pageView(location.href, title));
    });
    analytics.subscribe('product_viewed', (event) => {
      sendGa4(event.clientId, event.timestamp, viewItem(event.data.productVariant));
    });
    analytics.subscribe('product_added_to_cart', (event) => {
      if (event.data.cartLine) sendGa4(event.clientId, event.timestamp, addToCart(event.data.cartLine));
    });
    analytics.subscribe('checkout_started', (event) => {
      sendGa4(event.clientId, event.timestamp, beginCheckout(event.data.checkout));
    });
    analytics.subscribe('payment_info_submitted', (event) => {
      sendGa4(event.clientId, event.timestamp, addPaymentInfo(event.data.checkout));
    });
  }

  for (const name of GIFT_EVENTS) {
    analytics.subscribe(`${GIFT_EVENT_PREFIX}${name}`, (event) => {
      const data = event.customData;
      if (!isGiftEventData(data)) return;
      update((state) => recordGiftEvent(state, name, data));
      forward({event: `${GIFT_EVENT_PREFIX}${name}`, timestamp: event.timestamp, ...data});
    });
  }

  // A/B test: the product-page block publishes the variant it showed (a view)...
  analytics.subscribe(AB_EVENT, (event) => {
    const data = event.customData as {experiment?: unknown; variant?: unknown} | undefined;
    const assignment = parseAssignment(`${data?.experiment}:${data?.variant}`);
    if (assignment) countAb(assignment, 'view', event.timestamp);
  });
  // ...an add to cart counts for the variant in the visitor's cookie.
  analytics.subscribe('product_added_to_cart', async (event) => {
    const assignment = parseAssignment(await browser.cookie.get(AB_COOKIE));
    if (assignment) countAb(assignment, 'cart', event.timestamp);
  });

  analytics.subscribe('checkout_completed', async (event) => {
    const checkout = event.data.checkout;
    sendGa4(event.clientId, event.timestamp, purchase(checkout));
    const order = {
      subtotal: Number(checkout.subtotalPrice?.amount ?? 0),
      currencyCode: checkout.currencyCode ?? checkout.subtotalPrice?.currencyCode ?? 'USD',
      lines: checkout.lineItems.map((line) => ({properties: line.properties ?? []})),
    };
    update((state) => recordOrder(state, order, GIFT_ATTRIBUTE_KEY));
    forward({event: 'checkout_completed', timestamp: event.timestamp, subtotal: order.subtotal, currencyCode: order.currencyCode});

    // A/B test: the cart attribute the block wrote (cookie as a fallback) names the variant of this order.
    const assignment = assignmentFromCheckout(checkout.attributes, await browser.cookie.get(AB_COOKIE).catch(() => null));
    if (assignment) countAb(assignment, 'order', event.timestamp, {subtotal: order.subtotal, currencyCode: order.currencyCode});

    // Affiliate: the ref the storefront put on the cart (?ref=) comes back as a checkout attribute.
    const ref = refFromAttributes(checkout.attributes);
    if (ref) {
      updateRefTotals((totals) => recordRefOrder(totals, ref, order.subtotal, order.currencyCode));
      forward({
        event: 'affiliate_conversion',
        timestamp: event.timestamp,
        ref,
        orderId: checkout.order?.id ?? null,
        subtotal: order.subtotal,
        currencyCode: order.currencyCode,
      });
    }
  });
});
