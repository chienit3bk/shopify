import {describe, expect, it} from 'vitest';
import {
  addPaymentInfo,
  addToCart,
  beginCheckout,
  ga4Config,
  measurementProtocolBody,
  measurementProtocolUrl,
  pageView,
  purchase,
  toGa4Item,
  viewItem,
} from './ga4';

const variant = {
  id: '111',
  sku: 'SERUM-30',
  title: '30 ml',
  price: {amount: 48, currencyCode: 'USD'},
  product: {id: '9', title: 'Vitamin C Serum', vendor: 'Solvane', type: 'Serum'},
};

const checkout = {
  currencyCode: 'USD',
  totalPrice: {amount: 106.5, currencyCode: 'USD'},
  totalTax: {amount: 8.5, currencyCode: 'USD'},
  shippingLine: {price: {amount: 2, currencyCode: 'USD'}},
  discountApplications: [
    {title: 'Spend tiers', type: 'AUTOMATIC'},
    {title: 'WELCOME10', type: 'DISCOUNT_CODE'},
  ],
  lineItems: [{title: 'Vitamin C Serum', quantity: 2, variant}],
  order: {id: 'gid://shopify/OrderIdentity/5'},
};

describe('toGa4Item', () => {
  it('maps a variant to a GA4 item', () => {
    expect(toGa4Item(variant, 2)).toEqual({
      item_id: 'SERUM-30',
      item_name: 'Vitamin C Serum',
      item_brand: 'Solvane',
      item_category: 'Serum',
      item_variant: '30 ml',
      price: 48,
      quantity: 2,
    });
  });

  it('falls back to the variant id and drops the default variant title', () => {
    const item = toGa4Item({...variant, sku: '', title: 'Default Title'});
    expect(item.item_id).toBe('111');
    expect(item).not.toHaveProperty('item_variant');
  });

  it('uses the line title when the variant is gone', () => {
    expect(toGa4Item(null, 1, 'Deleted product')).toEqual({item_id: 'Deleted product', item_name: 'Deleted product', quantity: 1});
  });
});

describe('events', () => {
  it('page_view keeps the real storefront url', () => {
    expect(pageView('https://shop.test/a', 'A')).toEqual({name: 'page_view', params: {page_location: 'https://shop.test/a', page_title: 'A'}});
  });

  it('view_item', () => {
    const event = viewItem(variant);
    expect(event.name).toBe('view_item');
    expect(event.params).toMatchObject({currency: 'USD', value: 48});
  });

  it('add_to_cart uses the line total', () => {
    const event = addToCart({quantity: 2, merchandise: variant, cost: {totalAmount: {amount: 96, currencyCode: 'USD'}}});
    expect(event.params).toMatchObject({currency: 'USD', value: 96});
    expect((event.params.items as {quantity: number}[])[0].quantity).toBe(2);
  });

  it('begin_checkout and add_payment_info carry value and items', () => {
    expect(beginCheckout(checkout).name).toBe('begin_checkout');
    expect(addPaymentInfo(checkout).name).toBe('add_payment_info');
    expect(beginCheckout(checkout).params).toMatchObject({currency: 'USD', value: 106.5});
  });

  it('purchase has transaction id, tax, shipping and only the typed code as coupon', () => {
    expect(purchase(checkout)?.params).toMatchObject({
      transaction_id: 'gid://shopify/OrderIdentity/5',
      value: 106.5,
      tax: 8.5,
      shipping: 2,
      coupon: 'WELCOME10',
    });
  });

  it('purchase is skipped without an order id', () => {
    expect(purchase({...checkout, order: null})).toBeNull();
  });

  it('keeps a zero value', () => {
    expect(beginCheckout({...checkout, totalPrice: {amount: 0, currencyCode: 'USD'}}).params.value).toBe(0);
  });
});

describe('ga4Config', () => {
  it('accepts a measurement id with a secret', () => {
    expect(ga4Config({ga4MeasurementId: ' G-ABC123 ', ga4ApiSecret: 'abc'})).toEqual({measurementId: 'G-ABC123', apiSecret: 'abc'});
  });

  it.each([
    [{ga4MeasurementId: 'none', ga4ApiSecret: 'abc'}],
    [{ga4MeasurementId: 'UA-1234', ga4ApiSecret: 'abc'}],
    [{ga4MeasurementId: 'G-ABC123', ga4ApiSecret: 'none'}],
    [{}],
  ])('stays off for %j', (settings) => {
    expect(ga4Config(settings)).toBeNull();
  });
});

describe('measurement protocol', () => {
  it('escapes the url values', () => {
    expect(measurementProtocolUrl({measurementId: 'G-A1', apiSecret: 'a&b'})).toBe(
      'https://www.google-analytics.com/mp/collect?measurement_id=G-A1&api_secret=a%26b',
    );
  });

  it('builds the body', () => {
    expect(JSON.parse(measurementProtocolBody('client-1', {name: 'view_item', params: {value: 1}}, 5))).toEqual({
      client_id: 'client-1',
      timestamp_micros: 5,
      events: [{name: 'view_item', params: {value: 1}}],
    });
  });
});
