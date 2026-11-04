import {
  BuyerJourneyStep,
  type CartValidationsGenerateRunInput,
  type CartValidationsGenerateRunResult,
  type ValidationError,
} from '../generated/api';
import {type DateProblem, blocksPoBox, dateProblem, earliestFromShipDate, isDeliveryDay, isPoBox, addDays, parseDeliveryDateConfig, pickupOnlyTitles, poBoxRestrictedTitles} from '../../../shared/delivery/date';
import {parseCutoffConfig} from '../../../shared/shipping/cutoff';

const DATE_MESSAGES: Record<DateProblem, string> = {
  invalid: "We couldn't read the delivery date. Please pick it again.",
  too_early: 'That delivery date is no longer possible. Please pick a later date.',
  too_late: 'Please pick a delivery date within the next 30 days.',
  not_a_delivery_day: "We don't deliver on that day. Please pick another date.",
};

/**
 * - PO Box + an item the carrier can't take there (product metafield custom.no_po_box), or a
 *   carrier that can't deliver there (Express/UPS): an error on the address field as soon as
 *   the buyer enters it.
 * - An item that can only be picked up (product metafield custom.pickup_only) with a shipping
 *   option selected: an error telling the buyer to choose Pickup.
 * - Delivery date (cart attribute from the delivery-date block): re-checked when the
 *   order is placed, against the warehouse calendar.
 */
export function cartValidationsGenerateRun(input: CartValidationsGenerateRunInput): CartValidationsGenerateRunResult {
  const config = parseDeliveryDateConfig(input.shop.config?.jsonValue);
  const cutoff = parseCutoffConfig(input.shop.cutoff?.jsonValue);
  const step = input.buyerJourney.step;
  const errors: ValidationError[] = [];
  if (!config || step === BuyerJourneyStep.CartInteraction) return {operations: [{validationAdd: {errors}}]};

  input.cart.deliveryGroups.forEach((group, i) => {
    const products = group.cartLines.flatMap(({merchandise}) =>
      merchandise.__typename === 'ProductVariant'
        ? [
            {
              title: merchandise.product.title,
              noPoBox: merchandise.product.noPoBox?.jsonValue === true,
              pickupOnly: merchandise.product.pickupOnly?.jsonValue === true,
            },
          ]
        : [],
    );

    const needPickup = pickupOnlyTitles(products, group.selectedDeliveryOption?.deliveryMethodType);
    if (needPickup.length > 0) {
      errors.push({message: `${needPickup.join(' and ')} can only be picked up. Choose Pickup under Delivery, or remove it.`, target: '$.cart'});
    }

    const address = group.deliveryAddress;
    if (!address || !isPoBox(address.address1, address.address2)) return;
    const target = `$.cart.deliveryGroups[${i}].deliveryAddress.address1`;
    const restricted = poBoxRestrictedTitles(products);
    if (restricted.length > 0) {
      errors.push({message: `${restricted.join(' and ')} can't ship to a PO Box. Please use a street address.`, target});
    } else if (blocksPoBox(config, group.selectedDeliveryOption?.title)) {
      errors.push({message: "Express (UPS) can't deliver to a PO Box. Choose Standard or use a street address.", target});
    }
  });

  const chosen = input.cart.deliveryDate?.value;
  if (chosen && cutoff && step === BuyerJourneyStep.CheckoutCompletion) {
    // The Function only knows the shop's date, not the time: assume it still ships today if it's
    // a ship day (the block already enforced the cut-off), so a valid choice is never rejected.
    let shipDate = input.shop.localTime.date;
    for (let i = 0; i < 31 && !isDeliveryDay(cutoff, shipDate); i++) shipDate = addDays(shipDate, 1);
    const problem = dateProblem(cutoff, config, chosen, earliestFromShipDate(cutoff, config, shipDate));
    if (problem) errors.push({message: DATE_MESSAGES[problem], target: '$.cart'});
  }

  return {operations: [{validationAdd: {errors}}]};
}
