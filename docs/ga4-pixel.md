# Connect GA4 to a Shopify store

Two ways to send ecommerce events to GA4 without editing the theme or checkout. Both use
Shopify's customer events, so they cover the storefront, checkout and thank-you page.

| | Custom pixel | App pixel |
|---|---|---|
| Best for | One store, no app | An app that serves many stores |
| Setup | Paste a script in the admin | Save two settings on the app's pixel |
| Sends with | `gtag.js` | GA4 Measurement Protocol |
| Secret needed | No | Yes, the API secret reaches the browser |
| Code | [`examples/ga4-custom-pixel.js`](examples/ga4-custom-pixel.js) | [`shared/analytics/ga4.ts`](../shared/analytics/ga4.ts) |

Already using Shopify's Google & YouTube app for GA4? Keep one source only, or purchases count twice.

## Events

| Shopify event | GA4 event |
|---|---|
| `page_viewed` | `page_view` |
| `product_viewed` | `view_item` |
| `product_added_to_cart` | `add_to_cart` |
| `checkout_started` | `begin_checkout` |
| `payment_info_submitted` | `add_payment_info` |
| `checkout_completed` | `purchase` with `transaction_id`, `value`, `tax`, `shipping`, `items` |

## Get the GA4 values

1. In GA4, open **Admin → Data streams** and pick the web stream.
2. Copy the **Measurement ID** (`G-XXXXXXXXXX`).
3. App pixel only: open **Measurement Protocol API secrets**, create one and copy the value.

## Option 1: custom pixel

1. In Shopify admin, open **Settings → Customer events**.
2. Click **Add custom pixel**, enter a **Pixel name**, click **Add pixel**.
3. Under **Customer privacy**, keep **Permission** on *Required* with Marketing and Analytics, or match the store's policy.
4. Paste [`ga4-custom-pixel.js`](examples/ga4-custom-pixel.js) into **Code** and set `MEASUREMENT_ID`.
5. Click **Save**, then **Connect**.

To roll back: **Disconnect**, then **More actions → Delete pixel**.

## Option 2: app pixel

The pixel is `extensions/gift-funnel-pixel`. GA4 stays off until both settings are real values.

```bash
shopify app execute --store your-store.myshopify.com -q 'query { webPixel { id settings } }'
shopify app execute --store your-store.myshopify.com --query-file scripts/set-ga4-pixel.graphql \
  --variables '{"id":"gid://shopify/WebPixel/...","settings":"{\"endpoint\":\"none\",\"ga4MeasurementId\":\"G-XXXXXXXXXX\",\"ga4ApiSecret\":\"...\"}"}'
```

To roll back, set both GA4 values to `none`.

The API secret reaches the browser, so anyone can read it and send fake events. For a store
that relies on these numbers, use the custom pixel or send through your own server.

## Check it works

1. Open the store in a fresh window and accept the cookie banner.
2. In GA4, open **Reports → Realtime** and place a test order.
3. Confirm `begin_checkout` and `purchase` appear, and that the purchase value matches the order.

Pixels run in a sandbox. In DevTools, pick the pixel's frame or worker to see its requests.

## Notes

- **Consent:** events only fire after the buyer allows analytics, so GA4 can show fewer orders than Shopify.
- **Client id:** the app pixel uses Shopify's `clientId`, so sessions don't join up with a separate `gtag.js` install.
- **Cross-domain:** a checkout on another domain may need its domain listed in the GA4 stream settings.

## What was tested

- 17 unit tests cover the event mapping in `shared/analytics/ga4.ts`.
- Google's Measurement Protocol validation endpoint accepted a sample `purchase` payload.
- `mp/collect` allows cross-origin requests from the store domain.
- On the dev store, the custom pixel saved and connected, and a test order completed with it on.
- The released app pixel bundle contains the GA4 code.

**Not yet tested:** events arriving in a real GA4 property. Both pixels run sandboxed, so their
outgoing requests weren't captured either. Use the Realtime check above on the first store.
