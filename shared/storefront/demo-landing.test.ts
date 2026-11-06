import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

type Demo = {settings: Record<string, string>};
type Section = {type: string; blocks?: Record<string, Demo>; settings: Record<string, string>};

const raw = readFileSync('theme/templates/index.json', 'utf8');
const template = JSON.parse(raw) as {sections: Record<string, Section>; order: string[]};
const areas = template.order.map((id) => template.sections[id]).filter((s) => s.type === 'demo-area');
const demos = areas.flatMap((area) => Object.values(area.blocks ?? {}));

describe('demo landing data', () => {
  it('lists every demo once, in a named area', () => {
    expect(demos).toHaveLength(35);
    expect(new Set(demos.map((d) => d.settings.name)).size).toBe(demos.length);
    for (const area of areas) expect(area.settings.title).toBeTruthy();
  });

  it('gives every card a name, a plain line and one link', () => {
    for (const {settings} of demos) {
      expect(settings.name).toBeTruthy();
      expect(settings.text).toBeTruthy();
      expect(settings.try_url).toMatch(/^(\/|https:\/\/)/);
    }
  });

  it('says what the visitor must do on any card that is not a plain Try it', () => {
    for (const {settings} of demos) {
      if (settings.try_label !== 'Try it') expect(settings.note).toBeTruthy();
    }
  });

  it('keeps public text to demo data', () => {
    expect(raw).not.toMatch(/qikify|gmail|\/account\/orders/i);
    const emails = raw.match(/[\w.+-]+(%40|@)[\w.-]+/g) ?? [];
    for (const email of emails) expect(email).toMatch(/(%40|@)example\.com$/);
  });
});
