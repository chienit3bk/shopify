(function (root) {
  // Same rules as shared/personalization/rules.ts (the Function's copy). A parity test runs both
  // on the same cases, so the product page never lets through what checkout will refuse.
  var FORMATS = ['text', 'letters', 'number'];
  var LETTERS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
  var DIGITS = /^\d+$/;

  function positiveInt(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  function int(value) {
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
  }

  function parseFields(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.fields)) return [];
    var fields = [];
    raw.fields.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      var key = typeof f.key === 'string' ? f.key.trim() : '';
      if (!key || fields.some(function (other) { return other.key === key; })) return;
      var format = FORMATS.indexOf(f.format) !== -1 ? f.format : 'text';
      fields.push({
        key: key,
        label: typeof f.label === 'string' && f.label.trim() ? f.label.trim() : key,
        required: f.required === true,
        maxLength: positiveInt(f.maxLength),
        format: format,
        min: format === 'number' ? int(f.min) : undefined,
        max: format === 'number' ? int(f.max) : undefined,
      });
    });
    return fields;
  }

  function charCount(value) {
    return Array.from(value).length;
  }

  function fieldProblem(field, raw) {
    var value = String(raw == null ? '' : raw).trim();
    if (!value) return field.required ? { type: 'missing' } : null;
    var length = charCount(value);
    if (field.maxLength && length > field.maxLength) return { type: 'too_long', length: length, maxLength: field.maxLength };
    if (field.format === 'letters' && !LETTERS.test(value)) return { type: 'wrong_format' };
    if (field.format === 'number') {
      if (!DIGITS.test(value)) return { type: 'wrong_format' };
      var n = Number(value);
      if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
        return { type: 'out_of_range', min: field.min, max: field.max };
      }
    }
    return null;
  }

  // messages: required, tooLong, letters, number, range, each with [label] / [count] / [min] / [max].
  function problemText(field, problem, messages) {
    var template =
      problem.type === 'missing' ? messages.required
      : problem.type === 'too_long' ? messages.tooLong
      : problem.type === 'out_of_range' ? messages.range
      : field.format === 'number' ? messages.number
      : messages.letters;
    return template
      .replace('[label]', field.label)
      .replace('[count]', field.maxLength)
      .replace('[min]', field.min === undefined ? 0 : field.min)
      .replace('[max]', field.max === undefined ? '' : field.max);
  }

  var api = { parseFields: parseFields, fieldProblem: fieldProblem, problemText: problemText, charCount: charCount };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function productForm(scope) {
    return Array.prototype.slice.call(scope.querySelectorAll('form[action*="/cart/add"]')).find(function (candidate) {
      return candidate.querySelector('[type="submit"]');
    });
  }

  function initBlock(el) {
    var configEl = el.querySelector('[data-personalization-config]');
    var fields = [];
    try {
      fields = parseFields(JSON.parse(configEl.textContent));
    } catch (error) {
      return;
    }
    var scope = el.closest('.shopify-section') || document;
    var form = productForm(scope);
    if (!form) return;
    // Liquid already set form="product-form-<section id>" (Dawn's id). Other themes: use the real id.
    // getAttribute: form.id would return the form's <input name="id">.
    var formId = form.getAttribute('id');
    if (!formId) {
      formId = 'sb-personalize-form-' + el.dataset.blockId;
      form.setAttribute('id', formId);
    }
    var messages = {
      required: el.dataset.requiredMessage,
      tooLong: el.dataset.lengthMessage,
      letters: el.dataset.lettersMessage,
      number: el.dataset.numberMessage,
      range: el.dataset.rangeMessage,
    };
    var rows = fields
      .map(function (field) {
        var row = el.querySelector('[data-field="' + CSS.escape(field.key) + '"]');
        if (!row) return null;
        var input = row.querySelector('input');
        input.setAttribute('form', formId);
        return { field: field, input: input, error: row.querySelector('[data-field-error]'), count: row.querySelector('[data-count]') };
      })
      .filter(Boolean);

    function check() {
      var first = null;
      rows.forEach(function (item) {
        var problem = fieldProblem(item.field, item.input.value);
        var message = problem ? problemText(item.field, problem, messages) : '';
        item.error.textContent = message;
        item.error.hidden = !message;
        item.input.toggleAttribute('aria-invalid', Boolean(message));
        if (message && !first) first = item.input;
      });
      if (first) {
        first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        first.focus({ preventScroll: true });
      }
      return !first;
    }

    el.addEventListener('input', function (event) {
      var item = rows.find(function (candidate) {
        return candidate.input === event.target;
      });
      if (!item) return;
      if (item.count) item.count.textContent = charCount(item.input.value) + '/' + item.field.maxLength;
      item.error.hidden = true;
      item.input.removeAttribute('aria-invalid');
    });

    // Capture phase: runs before the theme's own submit handler (Dawn's form is novalidate).
    form.addEventListener('submit', function (event) {
      if (check()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    // Buy it now doesn't fire the form's submit event. Wallet buttons drawn in an iframe can't be
    // stopped from here: the validation Function stops them in checkout.
    scope.addEventListener('click', function (event) {
      if (!event.target.closest('.shopify-payment-button, shopify-accelerated-checkout')) return;
      if (check()) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function init(scope) {
    scope.querySelectorAll('[data-personalization]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      initBlock(el);
    });
  }

  init(document);
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
