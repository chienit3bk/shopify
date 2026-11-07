import {createStaticProvider} from '../../../shared/address/autocomplete';

/**
 * The one place the address service is chosen. The demo ships a static directory (no API key, no
 * network). A real provider implements the same two methods, see "Swap in a real provider" in the README.
 */
export const provider = createStaticProvider();
