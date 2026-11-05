// GA4 custom pixel. Paste into Shopify admin: Settings > Customer events > Add custom pixel.
// Replace the measurement id, then Save and Connect. Full guide: docs/ga4-pixel.md
const MEASUREMENT_ID = 'G-XXXXXXXXXX';

const script = document.createElement('script');
script.async = true;
script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
document.head.appendChild(script);

window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
gtag('js', new Date());
// The pixel runs in an iframe, so page data comes from each Shopify event, not from window.location.
gtag('config', MEASUREMENT_ID, {send_page_view: false});

function toItem(variant, quantity, fallbackName) {
  return {
    item_id: variant?.sku || variant?.id || fallbackName,
    item_name: variant?.product?.title || fallbackName,
    item_brand: variant?.product?.vendor,
    item_variant: variant?.title === 'Default Title' ? undefined : variant?.title,
    price: variant?.price?.amount,
    quantity,
  };
}

function checkoutParams(checkout) {
  return {
    currency: checkout.currencyCode,
    value: checkout.totalPrice?.amount,
    items: (checkout.lineItems || []).map((line) => toItem(line.variant, line.quantity, line.title)),
  };
}

function send(name, event, params) {
  const {location, title} = event.context.document;
  gtag('event', name, {page_location: location.href, page_title: title, ...params});
}

analytics.subscribe('page_viewed', (event) => send('page_view', event, {}));

analytics.subscribe('product_viewed', (event) => {
  const variant = event.data.productVariant;
  send('view_item', event, {currency: variant.price.currencyCode, value: variant.price.amount, items: [toItem(variant, 1)]});
});

analytics.subscribe('product_added_to_cart', (event) => {
  const line = event.data.cartLine;
  if (!line) return;
  send('add_to_cart', event, {
    currency: line.cost.totalAmount.currencyCode,
    value: line.cost.totalAmount.amount,
    items: [toItem(line.merchandise, line.quantity)],
  });
});

analytics.subscribe('checkout_started', (event) => send('begin_checkout', event, checkoutParams(event.data.checkout)));

analytics.subscribe('payment_info_submitted', (event) => send('add_payment_info', event, checkoutParams(event.data.checkout)));

analytics.subscribe('checkout_completed', (event) => {
  const checkout = event.data.checkout;
  if (!checkout.order?.id) return;
  send('purchase', event, {
    ...checkoutParams(checkout),
    transaction_id: checkout.order.id,
    tax: checkout.totalTax?.amount,
    shipping: checkout.shippingLine?.price?.amount,
  });
});
