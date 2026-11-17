import {
  BuyerJourneyStep,
  type CartValidationsGenerateRunInput,
  type CartValidationsGenerateRunResult,
  type ValidationError,
} from '../generated/api';
import {
  checkableFields,
  parsePersonalization,
  personalizationProblems,
  problemMessage,
} from '../../../shared/personalization/rules';

type Line = CartValidationsGenerateRunInput['cart']['lines'][number];

/** Property key -> value for the keys the input query reads (FUNCTION_KEYS). */
function lineValues(line: Line): Record<string, string | null | undefined> {
  return {Name: line.name?.value, Number: line.number?.value, Initials: line.initials?.value};
}

/**
 * The source of truth for personalized products: the product page block only helps the buyer
 * fill the fields in. A line added by permalink, the AJAX API, a quick add or an express button
 * that skipped them is stopped here. The cart page stays editable (CART_INTERACTION is skipped);
 * every checkout step shows the error. Checkout can't target a single line, so errors sit on $.cart.
 */
export function cartValidationsGenerateRun(input: CartValidationsGenerateRunInput): CartValidationsGenerateRunResult {
  const errors: ValidationError[] = [];
  if (input.buyerJourney.step === BuyerJourneyStep.CartInteraction) return {operations: [{validationAdd: {errors}}]};

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    const {product} = line.merchandise;
    const fields = parsePersonalization(product.personalization?.jsonValue);
    if (!fields) continue;
    for (const problem of personalizationProblems(checkableFields(fields), lineValues(line))) {
      const message = problemMessage(problem, product.title);
      // Two lines of one product with the same gap would read twice.
      if (!errors.some((error) => error.message === message)) errors.push({message, target: '$.cart'});
    }
  }

  return {operations: [{validationAdd: {errors}}]};
}
