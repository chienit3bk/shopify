/**
 * "This order is a gift": a message for the card and an optional paid gift wrap.
 *
 * The message is a cart attribute (on the order, ready for the packing slip); the wrap is a
 * service line, the same one-unit add/remove as the carbon-offset add-on. Pure, unit-tested.
 */
import {type LineLike, type OffsetChange, offsetLines, toggleOffset} from '../delivery/offset';

export const GIFT_MESSAGE_ATTRIBUTE = 'Gift message';

export interface GiftOptionsConfig {
  version: 1;
  /** The "Gift wrap" variant (a service product, no shipping). */
  wrapVariantId: string;
  /** Line attribute that marks the wrap line (hidden: leading underscore). */
  wrapAttributeKey: string;
  /** Longest message that fits the card. */
  messageMaxLength: number;
}

const service = (config: GiftOptionsConfig) => ({version: 1 as const, variantId: config.wrapVariantId, attributeKey: config.wrapAttributeKey});

/** One wrap per order: on adds a single line, off removes every wrap line. */
export function toggleWrap(config: GiftOptionsConfig, lines: LineLike[], on: boolean): OffsetChange[] {
  return toggleOffset(service(config), lines, on);
}

export function hasWrap(config: GiftOptionsConfig, lines: LineLike[]): boolean {
  return offsetLines(service(config), lines).length > 0;
}

/**
 * What goes on the card: no control characters, at most two line breaks in a row, no
 * surrounding blanks, cut to the card length.
 */
export function cleanMessage(text: string, maxLength: number): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function parseGiftOptionsConfig(raw: unknown): GiftOptionsConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1 || typeof c.wrapVariantId !== 'string' || typeof c.wrapAttributeKey !== 'string') return null;
  if (!Number.isInteger(c.messageMaxLength) || c.messageMaxLength < 1) return null;
  return {version: 1, wrapVariantId: c.wrapVariantId, wrapAttributeKey: c.wrapAttributeKey, messageMaxLength: c.messageMaxLength};
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
