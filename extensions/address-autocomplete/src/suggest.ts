import {safeSuggest} from '../../../shared/address/autocomplete';
import {provider} from './provider';

/** Runs after a pause in typing in address1 (or zip, in countries without a street-first form). */
export default async () => {
  const {field, value, selectedCountryCode} = shopify.target;
  return {suggestions: await safeSuggest(provider, {field, value, countryCode: selectedCountryCode}, shopify.signal)};
};
