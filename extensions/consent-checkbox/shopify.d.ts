import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Consent.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.actions.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}
