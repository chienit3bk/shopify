// Order status page: shipment progress per fulfillment + self-serve help links.
// Pure logic; the extension only fetches and renders.

export type ShipmentStatus =
  | 'ATTEMPTED_DELIVERY'
  | 'CARRIER_PICKED_UP'
  | 'CONFIRMED'
  | 'DELAYED'
  | 'DELIVERED'
  | 'FAILURE'
  | 'IN_TRANSIT'
  | 'LABEL_PRINTED'
  | 'LABEL_PURCHASED'
  | 'OUT_FOR_DELIVERY'
  | 'PICKED_UP'
  | 'READY_FOR_PICKUP';

export interface Fulfillment {
  id: string;
  status: 'CANCELLED' | 'ERROR' | 'FAILURE' | 'SUCCESS' | 'OPEN' | 'PENDING';
  latestShipmentStatus?: ShipmentStatus | null;
  estimatedDeliveryAt?: string | null;
  trackingInformation: {number?: string | null; url?: string | null; company?: string | null}[];
}

/** 0 Packed · 1 Shipped · 2 Out for delivery · 3 Delivered */
export const STEPS = ['packed', 'shipped', 'outForDelivery', 'delivered'] as const;
export type Step = (typeof STEPS)[number];

const STEP_OF: Record<ShipmentStatus, number> = {
  CONFIRMED: 0,
  LABEL_PURCHASED: 0,
  LABEL_PRINTED: 0,
  READY_FOR_PICKUP: 0,
  FAILURE: 0,
  CARRIER_PICKED_UP: 1,
  IN_TRANSIT: 1,
  DELAYED: 1,
  ATTEMPTED_DELIVERY: 2,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3,
  PICKED_UP: 3,
};

/** Statuses the buyer should act on or be warned about. */
const NEEDS_ATTENTION = new Set<ShipmentStatus>(['DELAYED', 'ATTEMPTED_DELIVERY', 'FAILURE']);

export interface Shipment {
  id: string;
  step: number;
  /** Shopify's raw event status, or null before the carrier reports one. */
  status: ShipmentStatus | null;
  attention: boolean;
  carrier: string | null;
  number: string | null;
  url: string | null;
  /** ISO date, hidden once delivered. */
  eta: string | null;
}

/** One shipment per live fulfillment; cancelled/failed fulfillments are dropped. */
export function shipments(fulfillments: Fulfillment[]): Shipment[] {
  return fulfillments
    .filter((f) => f.status === 'SUCCESS' || f.status === 'OPEN' || f.status === 'PENDING')
    .map((f) => {
      const status = f.latestShipmentStatus ?? null;
      const step = status ? STEP_OF[status] : 0;
      const tracking = f.trackingInformation.find((t) => t.url || t.number) ?? {};
      return {
        id: f.id,
        step,
        status,
        attention: status ? NEEDS_ATTENTION.has(status) : false,
        carrier: tracking.company ?? null,
        number: tracking.number ?? null,
        url: tracking.url ?? null,
        eta: step < 3 ? (f.estimatedDeliveryAt ?? null) : null,
      };
    });
}

export type HelpTopic = 'contact' | 'returns' | 'shipping' | 'faq';

export interface HelpLink {
  topic: HelpTopic;
  href: string;
}

/**
 * Help links for one order. The contact link carries the order name so the
 * buyer doesn't have to retype it; returns are hidden until something shipped
 * (Shopify's own "Request return" covers delivered orders).
 */
export function helpLinks(shopUrl: string, orderName: string, hasShipped: boolean): HelpLink[] {
  const base = shopUrl.replace(/\/+$/, '');
  const order = encodeURIComponent(orderName);
  const links: HelpLink[] = [
    {topic: 'contact', href: `${base}/pages/contact?order=${order}`},
    {topic: 'shipping', href: `${base}/policies/shipping-policy`},
  ];
  if (hasShipped) links.push({topic: 'returns', href: `${base}/policies/refund-policy`});
  links.push({topic: 'faq', href: `${base}/pages/faq`});
  return links;
}
