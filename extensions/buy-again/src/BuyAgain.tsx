import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  cartUrl,
  pickBuyAgain,
  type BuyAgainItem,
  type Order,
} from '../../../shared/customer-account/buy-again';

export default async () => {
  render(<Extension />, document.body);
};

const QUERY = `query BuyAgain {
  shop { url }
  customer {
    orders(first: 5, sortKey: PROCESSED_AT, reverse: true) {
      nodes {
        lineItems(first: 20) {
          nodes {
            title
            variantTitle
            quantity
            variantId
            image { url altText }
            totalPrice { amount }
          }
        }
      }
    }
  }
}`;

interface Result {
  data?: {shop: {url: string}; customer: {orders: {nodes: Order[]}}};
}

function Extension() {
  const t = shopify.i18n.translate;
  const [shopUrl, setShopUrl] = useState('');
  const [items, setItems] = useState<BuyAgainItem[]>([]);

  useEffect(() => {
    fetch('shopify://customer-account/api/2026-10/graphql.json', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query: QUERY}),
    })
      .then((response) => response.json())
      .then(({data}: Result) => {
        if (!data) return;
        setShopUrl(data.shop.url);
        setItems(pickBuyAgain(data.customer.orders.nodes));
      })
      .catch(console.error);
  }, []);

  if (items.length === 0) return null;

  return (
    <s-section heading={t('heading')}>
      <s-stack gap="base">
        {items.map((item) => (
          <s-stack key={item.variantId} direction="inline" gap="base" alignItems="center">
            <s-product-thumbnail src={item.imageUrl ?? undefined} alt={item.imageAlt} size="small" />
            <s-stack gap="small-500">
              <s-text type="strong">{item.title}</s-text>
              {item.variantTitle ? <s-text color="subdued">{item.variantTitle}</s-text> : null}
              <s-link href={cartUrl(shopUrl, item)}>
                {t('buyAgain', {quantity: item.quantity})}
              </s-link>
            </s-stack>
          </s-stack>
        ))}
      </s-stack>
    </s-section>
  );
}
