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
        variantTitle: visibleVariantTitle(line.variantTitle),
        quantity: line.quantity,
        imageUrl: line.image?.url ?? null,
        imageAlt: line.image?.altText || line.title,
      });
    }
  }
  return [...items.values()].slice(0, limit);
}

/**
 * Adds one item to the current cart: `<shop>/cart/add?id=<variant>&quantity=<qty>`.
 * A `/cart/<variant>:<qty>` permalink would replace the cart and jump to checkout,
 * so a second click would drop the first item.
 */
export function cartUrl(shopUrl: string, item: BuyAgainItem): string {
  const id = item.variantId.split('/').pop();
  return `${shopUrl.replace(/\/+$/, '')}/cart/add?id=${id}&quantity=${item.quantity}`;
}

/** Shopify names the only variant of a product "Default Title": not worth showing. */
function visibleVariantTitle(title?: string | null): string | null {
  return title && title !== 'Default Title' ? title : null;
}
