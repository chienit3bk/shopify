/**
 * One-tap order note templates ("Leave at the front door", "Call on arrival"…).
 *
 * Checkout has no note field of its own; the block writes the order note through
 * `applyNoteChange`. Templates are whole lines, so tapping one again removes exactly that line
 * and keeps whatever the buyer typed. Pure, unit-tested.
 */

export interface NoteTemplate {
  id: string;
  /** Button text, short. */
  label: string;
  /** The line added to the note. */
  text: string;
}

export interface NoteTemplatesConfig {
  version: 1;
  templates: NoteTemplate[];
  /** Longest note the warehouse or courier label can show. */
  maxLength: number;
}

const lines = (note: string | null | undefined) =>
  (note ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim());

export function hasTemplate(note: string | null | undefined, template: NoteTemplate): boolean {
  return lines(note).includes(template.text.trim());
}

/**
 * The note after tapping a template: on appends its line (once), off removes that line only.
 * Returns null when adding it would make the note longer than `maxLength`.
 */
export function toggleTemplate(note: string | null | undefined, template: NoteTemplate, on: boolean, maxLength: number): string | null {
  const current = lines(note).filter((line, i, all) => line !== '' || (i > 0 && i < all.length - 1));
  const text = template.text.trim();
  if (!on) return current.filter((line) => line !== text).join('\n').trim();
  if (current.includes(text)) return current.join('\n').trim();
  const next = [...current.filter((line) => line !== ''), text].join('\n');
  return next.length > maxLength ? null : next;
}

/** What the buyer typed: no control characters, at most one blank line, cut to `maxLength`. */
export function cleanNote(text: string, maxLength: number): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function parseNoteTemplatesConfig(raw: unknown): NoteTemplatesConfig | null {
  const data = typeof raw === 'string' ? safeJson(raw) : raw;
  if (typeof data !== 'object' || data === null) return null;
  const c = data as Record<string, any>;
  if (c.version !== 1 || !Array.isArray(c.templates) || !Number.isInteger(c.maxLength) || c.maxLength < 1) return null;
  const templates = c.templates.filter(
    (t: any): t is NoteTemplate =>
      t && typeof t.id === 'string' && typeof t.label === 'string' && typeof t.text === 'string' && t.text.trim() !== '' && !t.text.includes('\n'),
  );
  if (templates.length === 0) return null;
  return {version: 1, templates, maxLength: c.maxLength};
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
