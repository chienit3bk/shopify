/**
 * Shopify customer events -> GA4 ecommerce events. Pure mapping, no browser APIs, so the
 * app pixel can use it and the tests can run it without a store.
 */

type Money = {amount?: number | null; currencyCode?: string | null} | null | undefined;

type Variant = {
  id?: string | null;
  sku?: string | null;
  title?: string | null;
  price?: Money;
  product?: {id?: string | null; title?: string | null; vendor?: string | null; type?: string | null} | null;
} | null | undefined;

type CheckoutLine = {
  title?: string | null;
  quantity?: number | null;
  variant?: Variant;
};

export type ShopifyCheckout = {
  currencyCode?: string | null;
  totalPrice?: Money;
  totalTax?: Money;
  shippingLine?: {price?: Money} | null;
  discountApplications?: {title?: string | null; type?: string | null}[] | null;
  lineItems?: CheckoutLine[] | null;
  order?: {id?: string | null} | null;
};

export type Ga4Item = {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity: number;
};

export type Ga4Event = {name: string; params: Record<string, unknown>};

export const GA4_EVENTS = [
  'page_viewed',
  'product_viewed',
  'product_added_to_cart',
  'checkout_started',
  'payment_info_submitted',
  'checkout_completed',
] as const;

function amount(money: Money): number | undefined {
  return typeof money?.amount === 'number' ? money.amount : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

export function toGa4Item(variant: Variant, quantity = 1, fallbackName = ''): Ga4Item {
  return compact({
    item_id: variant?.sku || variant?.id || variant?.product?.id || fallbackName,
    item_name: variant?.product?.title || fallbackName,
    item_brand: variant?.product?.vendor ?? undefined,
    item_category: variant?.product?.type ?? undefined,
    item_variant: variant?.title === 'Default Title' ? undefined : variant?.title ?? undefined,
    price: amount(variant?.price),
    quantity,
  }) as Ga4Item;
}

function checkoutItems(checkout: ShopifyCheckout): Ga4Item[] {
  return (checkout.lineItems ?? []).map((line) => toGa4Item(line.variant, line.quantity ?? 1, line.title ?? ''));
}

function checkoutParams(checkout: ShopifyCheckout) {
  return {
    currency: checkout.currencyCode ?? checkout.totalPrice?.currencyCode ?? undefined,
    value: amount(checkout.totalPrice),
    items: checkoutItems(checkout),
  };
}

export function pageView(url: string, title: string): Ga4Event {
  return {name: 'page_view', params: compact({page_location: url, page_title: title})};
}

export function viewItem(variant: Variant): Ga4Event {
  return {
    name: 'view_item',
    params: compact({
      currency: variant?.price?.currencyCode ?? undefined,
      value: amount(variant?.price),
      items: [toGa4Item(variant)],
    }),
  };
}

export function addToCart(line: {quantity?: number | null; merchandise?: Variant; cost?: {totalAmount?: Money} | null}): Ga4Event {
  return {
    name: 'add_to_cart',
    params: compact({
      currency: line.cost?.totalAmount?.currencyCode ?? line.merchandise?.price?.currencyCode ?? undefined,
      value: amount(line.cost?.totalAmount),
      items: [toGa4Item(line.merchandise, line.quantity ?? 1)],
    }),
  };
}

export function beginCheckout(checkout: ShopifyCheckout): Ga4Event {
  return {name: 'begin_checkout', params: compact(checkoutParams(checkout))};
}

export function addPaymentInfo(checkout: ShopifyCheckout): Ga4Event {
  return {name: 'add_payment_info', params: compact(checkoutParams(checkout))};
}

/** Returns null without an order id: GA4 needs transaction_id to remove duplicate purchases. */
export function purchase(checkout: ShopifyCheckout): Ga4Event | null {
  const transactionId = checkout.order?.id;
  if (!transactionId) return null;
  const coupon = (checkout.discountApplications ?? []).find((discount) => discount.type === 'DISCOUNT_CODE')?.title;
  return {
    name: 'purchase',
    params: compact({
      ...checkoutParams(checkout),
      transaction_id: transactionId,
      tax: amount(checkout.totalTax),
      shipping: amount(checkout.shippingLine?.price),
      coupon: coupon ?? undefined,
    }),
  };
}

/** GA4 ids look like G-ABC123. Anything else (including "none") keeps GA4 off. */
export function ga4Config(settings: Record<string, unknown>) {
  const measurementId = typeof settings.ga4MeasurementId === 'string' ? settings.ga4MeasurementId.trim() : '';
  const apiSecret = typeof settings.ga4ApiSecret === 'string' ? settings.ga4ApiSecret.trim() : '';
  if (!/^G-[A-Z0-9]+$/.test(measurementId) || !apiSecret || apiSecret === 'none') return null;
  return {measurementId, apiSecret};
}

export function measurementProtocolUrl(config: {measurementId: string; apiSecret: string}) {
  const query = `measurement_id=${encodeURIComponent(config.measurementId)}&api_secret=${encodeURIComponent(config.apiSecret)}`;
  return `https://www.google-analytics.com/mp/collect?${query}`;
}

export function measurementProtocolBody(clientId: string, event: Ga4Event, timestampMicros?: number) {
  return JSON.stringify(
    compact({
      client_id: clientId,
      timestamp_micros: timestampMicros,
      events: [{name: event.name, params: event.params}],
    }),
  );
}
