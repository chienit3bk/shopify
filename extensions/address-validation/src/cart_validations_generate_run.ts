import {
  BuyerJourneyStep,
  type CartValidationsGenerateRunInput,
  type CartValidationsGenerateRunResult,
  type ValidationError,
} from '../generated/api';
import {type AddressProblem, addressProblems, parseAddressRulesConfig} from '../../../shared/address/rules';

function message(problem: AddressProblem): string {
  switch (problem.type) {
    case 'no_house_number':
      return 'Add your house or building number before the street name, e.g. "350 5th Ave".';
    case 'po_box':
      return "We can't deliver to a PO Box. Please enter a street address.";
    case 'zip_state_mismatch':
      return `ZIP ${problem.zip} is in ${problem.expected.join(' / ')}, not ${problem.provinceCode}. Check the ZIP code and the state.`;
  }
}

const TARGET_FIELD = {no_house_number: 'address1', po_box: 'address1', zip_state_mismatch: 'zip'} as const;

/**
 * Errors sit on the address field that needs fixing, so the buyer sees them next to it. Runs from
 * the information step on; the cart page has no address yet.
 */
export function cartValidationsGenerateRun(input: CartValidationsGenerateRunInput): CartValidationsGenerateRunResult {
  const config = parseAddressRulesConfig(input.shop.config?.jsonValue);
  const errors: ValidationError[] = [];
  if (!config || input.buyerJourney.step === BuyerJourneyStep.CartInteraction) return {operations: [{validationAdd: {errors}}]};

  input.cart.deliveryGroups.forEach((group, i) => {
    if (!group.deliveryAddress) return;
    for (const problem of addressProblems(config, group.deliveryAddress)) {
      errors.push({message: message(problem), target: `$.cart.deliveryGroups[${i}].deliveryAddress.${TARGET_FIELD[problem.type]}`});
    }
  });

  return {operations: [{validationAdd: {errors}}]};
}
