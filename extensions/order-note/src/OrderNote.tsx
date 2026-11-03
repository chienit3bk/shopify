import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {cleanNote, hasTemplate, parseNoteTemplatesConfig, toggleTemplate, type NoteTemplate} from '../../../shared/notes/templates';

export default async () => {
  render(<OrderNote />, document.body);
};

/**
 * Delivery instructions in checkout: one-tap suggestions plus free text, written to the order
 * note, which the merchant sees on the order and on packing slips that print it.
 */
function OrderNote() {
  const t = shopify.i18n.translate;
  const entry = shopify.appMetafields.value.find(
    ({target, metafield}) => target.type === 'shop' && metafield.key === 'order_note_config',
  );
  const config = entry ? parseNoteTemplatesConfig(entry.metafield.value) : null;
  const saved = shopify.note.value ?? '';
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!config || !shopify.instructions.value.notes.canUpdateNote) return null;

  async function write(note: string) {
    setDraft(note);
    if (note === saved) return;
    setBusy(true);
    try {
      await shopify.applyNoteChange(note ? {type: 'updateNote', note} : {type: 'removeNote'});
    } finally {
      setBusy(false);
    }
  }

  function tap(template: NoteTemplate) {
    const next = toggleTemplate(draft, template, !hasTemplate(draft, template), config!.maxLength);
    if (next === null) {
      setError(t('tooLong'));
      return;
    }
    setError(undefined);
    return write(next);
  }

  return (
    <s-stack gap="small-200">
      <s-text type="strong">{t('heading')}</s-text>
      <s-stack direction="inline" gap="small-200">
        {config.templates.map((template) => (
          <s-press-button key={template.id} pressed={hasTemplate(draft, template)} disabled={busy} onClick={() => tap(template)}>
            {template.label}
          </s-press-button>
        ))}
      </s-stack>
      <s-text-area
        label={t('label')}
        rows={2}
        maxLength={config.maxLength}
        value={draft}
        error={error}
        onInput={(event) => setDraft((event.currentTarget as HTMLElementTagNameMap['s-text-area']).value ?? '')}
        onChange={(event) => write(cleanNote((event.currentTarget as HTMLElementTagNameMap['s-text-area']).value ?? '', config.maxLength))}
      />
      <s-text type="small" color="subdued">
        {t('help', {used: draft.length, max: config.maxLength})}
      </s-text>
    </s-stack>
  );
}
