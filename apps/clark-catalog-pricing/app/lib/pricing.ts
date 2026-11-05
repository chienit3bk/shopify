/** Price after a percentage discount, as a 2-decimal string for the Admin API. */
export function discountedPrice(price: string, percentOff: number): string {
  const cents = Math.round(Number(price) * 100);
  return (Math.round(cents * (100 - percentOff)) / 10000).toFixed(2);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export type RuleInput = {
  name: string;
  companyLocationId: string;
  percentOff: number;
  collectionId: string | null;
  collectionPercentOff: number | null;
};

const validPercent = (value: number) => value > 0 && value < 100;

/** Returns an error message, or null when the form is valid. */
export function validateRule(input: RuleInput): string | null {
  if (!input.name) return "Enter a rule name.";
  if (!input.companyLocationId) return "Choose a company location.";
  if (!validPercent(input.percentOff)) {
    return "Catalog discount must be between 0 and 100.";
  }
  if (input.collectionId && !validPercent(input.collectionPercentOff ?? NaN)) {
    return "Collection discount must be between 0 and 100.";
  }
  return null;
}
