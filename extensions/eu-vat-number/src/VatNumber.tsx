import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {VAT_ATTRIBUTE, checkVat, isEuCountry} from '../../../shared/tax/vat';

export default async () => {
  render(<VatNumber />, document.body);
};

/**
 * "I'm buying for a business" → an EU VAT number, checked against the delivery country's format
 * and saved to the "VAT number" cart attribute (on the order). Only for EU delivery addresses.
 */
function VatNumber() {
  const t = shopify.i18n.translate;
  const countryCode = shopify.shippingAddress?.value?.countryCode;
  const saved = shopify.attributes.value.find((a) => a.key === VAT_ATTRIBUTE)?.value ?? '';
  const [business, setBusiness] = useState(saved !== '');
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string | undefined>();

  if (!isEuCountry(countryCode) || !shopify.instructions.value.attributes.canUpdateAttributes) return null;

  async function save(text: string) {
    const check = checkVat(text, countryCode);
    if (!check.ok && check.reason === 'empty') {
      setError(undefined);
      if (saved) await shopify.applyAttributeChange({type: 'removeAttribute', key: VAT_ATTRIBUTE});
      return;
    }
    if (!check.ok) {
      setError(t(check.reason === 'wrong_country' ? 'country' : 'format', {prefix: check.expectedPrefix ?? ''}));
      return;
    }
    setError(undefined);
    setDraft(check.value);
    if (check.value !== saved) await shopify.applyAttributeChange({type: 'updateAttribute', key: VAT_ATTRIBUTE, value: check.value});
  }

  async function toggle(on: boolean) {
    setBusiness(on);
    if (on) return;
    setDraft('');
    setError(undefined);
    if (saved) await shopify.applyAttributeChange({type: 'removeAttribute', key: VAT_ATTRIBUTE});
  }

  return (
    <s-stack gap="small-200">
      <s-checkbox
        label={t('business')}
        checked={business}
        onChange={(event) => toggle((event.currentTarget as HTMLElementTagNameMap['s-checkbox']).checked ?? false)}
      />
      {business && (
        <s-stack gap="small-300">
          <s-text-field
            label={t('label')}
            value={draft}
            error={error}
            autocomplete="off"
            onInput={(event) => setDraft((event.currentTarget as HTMLElementTagNameMap['s-text-field']).value ?? '')}
            onChange={(event) => save((event.currentTarget as HTMLElementTagNameMap['s-text-field']).value ?? '')}
          />
          <s-text type="small" color="subdued">
            {t('help')}
          </s-text>
        </s-stack>
      )}
    </s-stack>
  );
}
