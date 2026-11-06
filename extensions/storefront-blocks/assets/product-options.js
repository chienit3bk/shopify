(function (root) {
  // Labels of the options on show. An option whose parent is hidden stays hidden too.
  function visibleLabels(fields, values) {
    var shown = [];
    fields.forEach(function (field) {
      if (!field.whenLabel || (shown.indexOf(field.whenLabel) !== -1 && values[field.whenLabel] === field.whenValue)) {
        shown.push(field.label);
      }
    });
    return shown;
  }

  function fieldErrors(fields, values, messages) {
    var shown = visibleLabels(fields, values);
    var errors = {};
    fields.forEach(function (field) {
      if (shown.indexOf(field.label) === -1) return;
      var value = String(values[field.label] || '').trim();
      if (field.required && !value) errors[field.label] = messages.required.replace('[label]', field.label);
      else if (field.max && value.length > field.max) {
        errors[field.label] = messages.tooLong.replace('[label]', field.label).replace('[count]', field.max);
      }
    });
    return errors;
  }

  // One request for the product and its add-ons, so the buyer never gets only half of it.
  function cartItems(entries, addonVariantIds) {
    var properties = {};
    var id = null;
    var quantity = 1;
    entries.forEach(function (entry) {
      var match = /^properties\[(.+)\]$/.exec(entry[0]);
      if (match && entry[1] !== '') properties[match[1]] = entry[1];
      if (entry[0] === 'id') id = Number(entry[1]);
      if (entry[0] === 'quantity') quantity = Number(entry[1]) || 1;
    });
    return [{ id: id, quantity: quantity, properties: properties }].concat(
      addonVariantIds.map(function (variantId) {
        return { id: Number(variantId), quantity: quantity };
      }),
    );
  }

  var api = { visibleLabels: visibleLabels, fieldErrors: fieldErrors, cartItems: cartItems };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function initOptions(el) {
    var scope = el.closest('.shopify-section') || document;
    var form = Array.prototype.slice.call(scope.querySelectorAll('form[action*="/cart/add"]')).find(function (candidate) {
      return candidate.querySelector('[type="submit"]');
    });
    if (!form) return;
    // getAttribute: form.id is the form's <input name="id"> here, not its id.
    var formId = form.getAttribute('id');
    if (!formId) {
      formId = 'sb-product-form';
      form.setAttribute('id', formId);
    }
    var submit = form.querySelector('[type="submit"]');
    var formError = el.querySelector('[data-options-error]');
    var messages = { required: el.dataset.requiredMessage, tooLong: el.dataset.lengthMessage };
    var rows = Array.prototype.slice.call(el.querySelectorAll('[data-option]')).map(function (row) {
      var control = row.querySelector('input, select');
      if (control.name) control.setAttribute('form', formId);
      return {
        row: row,
        control: control,
        error: row.querySelector('[data-option-error]'),
        count: row.querySelector('[data-count]'),
        field: {
          label: row.dataset.label,
          required: row.dataset.required === 'true',
          max: Number(row.dataset.max) || 0,
          whenLabel: row.dataset.whenLabel,
          whenValue: row.dataset.whenValue,
        },
      };
    });
    var fields = rows.map(function (item) {
      return item.field;
    });

    function values() {
      var result = {};
      rows.forEach(function (item) {
        var control = item.control;
        result[item.field.label] = control.type === 'checkbox' ? (control.checked ? 'Yes' : '') : control.value;
      });
      return result;
    }

    function addons() {
      return rows
        .filter(function (item) {
          return item.row.dataset.variantId && item.control.checked && !item.row.hidden;
        })
        .map(function (item) {
          return item.row.dataset.variantId;
        });
    }

    function refresh() {
      var shown = visibleLabels(fields, values());
      rows.forEach(function (item) {
        var visible = shown.indexOf(item.field.label) !== -1;
        item.row.hidden = !visible;
        // A disabled control isn't sent, so a hidden option never reaches the order.
        item.control.disabled = !visible;
        if (item.count) item.count.textContent = item.control.value.length + '/' + item.field.max;
      });
      // Buy it now can't add a second line, so it steps aside while an add-on is ticked.
      scope.classList.toggle('sb-has-addon', addons().length > 0);
    }

    function showErrors(errors) {
      var first = null;
      rows.forEach(function (item) {
        var message = errors[item.field.label] || '';
        item.error.textContent = message;
        item.error.hidden = !message;
        item.control.toggleAttribute('aria-invalid', Boolean(message));
        if (message && !first) first = item.control;
      });
      if (first) {
        first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        first.focus({ preventScroll: true });
      }
      return !first;
    }

    function addWithAddons() {
      var drawer = document.querySelector('cart-drawer');
      var hasDrawer = Boolean(drawer && drawer.renderContents && drawer.getSectionsToRender);
      var body = { items: cartItems(Array.from(new FormData(form).entries()), addons()) };
      if (hasDrawer) {
        body.sections = drawer.getSectionsToRender().map(function (section) {
          return section.section || section.id;
        });
        body.sections_url = location.pathname;
      }
      formError.hidden = true;
      submit.setAttribute('aria-disabled', 'true');
      fetch(routeRoot() + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (response) {
          return response.json().then(function (result) {
            if (!response.ok) throw new Error(result.description || result.message || el.dataset.error);
            if (hasDrawer) {
              // The theme's own submit clears this too. Left on, a first add shows an empty drawer.
              drawer.classList.remove('is-empty');
              drawer.renderContents({ id: body.items[0].id, sections: result.sections });
            } else {
              location.href = routeRoot() + 'cart';
            }
          });
        })
        .catch(function (error) {
          formError.textContent = error.message;
          formError.hidden = false;
        })
        .finally(function () {
          submit.removeAttribute('aria-disabled');
        });
    }

    // Errors clear on input, not change: change fires on blur, and the layout shift would make
    // the buyer's click on the next control miss.
    el.addEventListener('input', function (event) {
      refresh();
      var item = rows.find(function (candidate) {
        return candidate.control === event.target;
      });
      if (!item) return;
      item.error.hidden = true;
      item.control.removeAttribute('aria-invalid');
    });

    // Capture phase: this runs before the theme's own submit handler.
    form.addEventListener('submit', function (event) {
      var valid = showErrors(fieldErrors(fields, values(), messages));
      if (valid && !addons().length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (valid && submit.getAttribute('aria-disabled') !== 'true') addWithAddons();
    }, true);

    // Buy it now skips the form's submit event, so it gets the same check.
    scope.addEventListener('click', function (event) {
      if (!event.target.closest('.shopify-payment-button')) return;
      if (showErrors(fieldErrors(fields, values(), messages))) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    refresh();
  }

  function init(scope) {
    scope.querySelectorAll('[data-options]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      initOptions(el);
    });
  }

  init(document);
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
