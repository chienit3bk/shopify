import {provider} from './provider';

/** Runs once, when the buyer picks a row: the second request that fills the whole form. */
export default async () => {
  const {selectedSuggestion} = shopify.target;
  const address = selectedSuggestion.id ? await provider.resolve(selectedSuggestion.id) : undefined;
  // Nothing found: fill only what the row already said, never clear the form.
  return {formattedAddress: address ?? {}};
};
