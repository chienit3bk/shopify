import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/OrderStatusHelp.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
