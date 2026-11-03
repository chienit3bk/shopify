import {describe, expect, test} from 'vitest';
import {type NoteTemplate, cleanNote, hasTemplate, parseNoteTemplatesConfig, toggleTemplate} from './templates';

const door: NoteTemplate = {id: 'door', label: 'Leave at door', text: 'Leave at the front door'};
const call: NoteTemplate = {id: 'call', label: 'Call me', text: 'Call on arrival'};

describe('toggleTemplate', () => {
  test('adds a template line once, after what the buyer typed', () => {
    expect(toggleTemplate('', door, true, 200)).toBe('Leave at the front door');
    expect(toggleTemplate('Blue gate, code 1234', door, true, 200)).toBe('Blue gate, code 1234\nLeave at the front door');
    expect(toggleTemplate('Leave at the front door', door, true, 200)).toBe('Leave at the front door');
  });

  test('removing a template keeps everything else', () => {
    const note = 'Blue gate, code 1234\nLeave at the front door\nCall on arrival';
    expect(toggleTemplate(note, door, false, 200)).toBe('Blue gate, code 1234\nCall on arrival');
    expect(hasTemplate(note, call)).toBe(true);
    expect(hasTemplate('Call on arrival please', call)).toBe(false);
  });

  test('refuses to go over the length limit', () => {
    expect(toggleTemplate('x'.repeat(190), door, true, 200)).toBeNull();
  });
});

test('cleanNote', () => {
  expect(cleanNote('  Ring\u0007 twice\r\n\r\n\r\nThanks  ', 200)).toBe('Ring twice\n\nThanks');
  expect(cleanNote('abcdef', 3)).toBe('abc');
});

test('parseNoteTemplatesConfig drops multi-line or empty templates', () => {
  const cfg = parseNoteTemplatesConfig({version: 1, maxLength: 200, templates: [door, {id: 'x', label: 'x', text: 'a\nb'}, {id: 'y', label: 'y', text: ' '}]});
  expect(cfg?.templates).toEqual([door]);
  expect(parseNoteTemplatesConfig({version: 1, maxLength: 200, templates: []})).toBeNull();
});
