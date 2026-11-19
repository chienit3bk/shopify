import {describe, expect, it} from 'vitest';
import {helpLinks, shipments, type Fulfillment} from './order-help';

const ful = (over: Partial<Fulfillment> = {}): Fulfillment => ({
  id: 'gid://shopify/Fulfillment/1',
  status: 'SUCCESS',
  latestShipmentStatus: null,
  estimatedDeliveryAt: '2026-11-24T00:00:00Z',
  trackingInformation: [{company: 'UPS', number: '1Z999', url: 'https://ups.com/t/1Z999'}],
  ...over,
});

describe('shipments', () => {
  it('starts at Packed before the carrier reports anything', () => {
    const [s] = shipments([ful()]);
    expect(s.step).toBe(0);
    expect(s.status).toBeNull();
    expect(s.carrier).toBe('UPS');
    expect(s.url).toBe('https://ups.com/t/1Z999');
  });

  it.each([
    ['LABEL_PRINTED', 0],
    ['IN_TRANSIT', 1],
    ['DELAYED', 1],
    ['OUT_FOR_DELIVERY', 2],
    ['DELIVERED', 3],
    ['PICKED_UP', 3],
  ] as const)('maps %s to step %i', (status, step) => {
    expect(shipments([ful({latestShipmentStatus: status})])[0].step).toBe(step);
  });

  it('flags delays and failed attempts', () => {
    expect(shipments([ful({latestShipmentStatus: 'DELAYED'})])[0].attention).toBe(true);
    expect(shipments([ful({latestShipmentStatus: 'ATTEMPTED_DELIVERY'})])[0].attention).toBe(true);
    expect(shipments([ful({latestShipmentStatus: 'IN_TRANSIT'})])[0].attention).toBe(false);
  });

  it('hides the ETA once delivered', () => {
    expect(shipments([ful({latestShipmentStatus: 'IN_TRANSIT'})])[0].eta).toBe('2026-11-24T00:00:00Z');
    expect(shipments([ful({latestShipmentStatus: 'DELIVERED'})])[0].eta).toBeNull();
  });

  it('drops cancelled and failed fulfillments', () => {
    expect(shipments([ful({status: 'CANCELLED'}), ful({status: 'ERROR'})])).toEqual([]);
  });

  it('keeps a shipment without tracking (manual fulfillment)', () => {
    const [s] = shipments([ful({trackingInformation: []})]);
    expect(s.carrier).toBeNull();
    expect(s.url).toBeNull();
  });

  it('uses the first tracking entry that has a number or url', () => {
    const [s] = shipments([
      ful({trackingInformation: [{company: 'Other'}, {company: 'DHL', number: 'JD01'}]}),
    ]);
    expect(s.carrier).toBe('DHL');
    expect(s.number).toBe('JD01');
  });
});

describe('helpLinks', () => {
  it('pre-fills the order name in the contact link', () => {
    const [contact] = helpLinks('https://solvane.shop/', '#1042', false);
    expect(contact.href).toBe('https://solvane.shop/pages/contact?order=%231042');
  });

  it('shows returns only after something shipped', () => {
    const topics = (shipped: boolean) =>
      helpLinks('https://solvane.shop', '#1', shipped).map((l) => l.topic);
    expect(topics(false)).toEqual(['contact', 'shipping', 'faq']);
    expect(topics(true)).toEqual(['contact', 'shipping', 'returns', 'faq']);
  });
});
