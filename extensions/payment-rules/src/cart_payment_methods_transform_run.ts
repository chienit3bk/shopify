import type {
  CartPaymentMethodsTransformRunInput,
  CartPaymentMethodsTransformRunResult,
  Operation,
} from '../generated/api';
import {parsePaymentRules, paymentOperations} from '../../../shared/payment/rules';

/**
 * Bank transfer only on big orders, no cash on delivery above a cap or to remote states,
 * and a per-country order of payment methods. Rules: shared/payment/rules.ts.
 */
export function cartPaymentMethodsTransformRun(
  input: CartPaymentMethodsTransformRunInput,
): CartPaymentMethodsTransformRunResult {
  const config = parsePaymentRules(input.paymentCustomization.config?.jsonValue);
  if (!config) return {operations: []};

  const address = input.cart.deliveryGroups.find((group) => group.deliveryAddress)?.deliveryAddress ?? null;
  const operations = paymentOperations(config, input.paymentMethods, {
    subtotal: Number(input.cart.cost.subtotalAmount.amount),
    currencyRate: Number(input.presentmentCurrencyRate),
    countryCode: address?.countryCode ?? input.localization.country.isoCode ?? null,
    provinceCode: address?.provinceCode ?? null,
  }).map(
    (op): Operation =>
      op.type === 'hide'
        ? {paymentMethodHide: {paymentMethodId: op.id}}
        : {paymentMethodMove: {paymentMethodId: op.id, index: op.index}},
  );
  return {operations};
}
