export interface OrderLine {
  title: string;
  variantTitle?: string | null;
  quantity: number;
  variantId?: string | null;
  image?: {url: string; altText?: string | null} | null;
  totalPrice?: {amount: string} | null;
}

export interface Order {
  lineItems: {nodes: OrderLine[]};
}

export interface BuyAgainItem {
  variantId: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  imageUrl: string | null;
  imageAlt: string;
}

/**
 * Items worth reordering, newest order first. Orders must arrive newest first.
 * Skips deleted variants (no id) and free lines such as gifts. A variant bought
 * twice appears once, with the quantity from its newest order.
 */
export function pickBuyAgain(orders: Order[], limit = 4): BuyAgainItem[] {
  const items = new Map<string, BuyAgainItem>();
  for (const order of orders) {
    for (const line of order.lineItems.nodes) {
      if (!line.variantId || line.quantity < 1) continue;
      if (Number(line.totalPrice?.amount ?? 0) <= 0) continue;
      if (items.has(line.variantId)) continue;
      items.set(line.variantId, {
        variantId: line.variantId,
        title: line.title,
        variantTitle: line.variantTitle || null,
        quantity: line.quantity,
        imageUrl: line.image?.url ?? null,
        imageAlt: line.image?.altText || line.title,
      });
    }
  }
  return [...items.values()].slice(0, limit);
}

/** Cart permalink for one item: `<shop>/cart/<variant>:<qty>`. */
export function cartUrl(shopUrl: string, item: BuyAgainItem): string {
  const id = item.variantId.split('/').pop();
  return `${shopUrl.replace(/\/+$/, '')}/cart/${id}:${item.quantity}`;
}
