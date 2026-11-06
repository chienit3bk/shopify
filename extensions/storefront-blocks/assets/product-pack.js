(function (root) {
  function matchesOptions(variant, options) {
    return variant.options.every(function (option, i) {
      return option === options[i];
    });
  }

  function findVariant(variants, options) {
    return variants.find(function (variant) {
      return matchesOptions(variant, options);
    }) || null;
  }

  // What each value of one option would give, with the other options kept as they are.
  function optionStates(variants, selected, index, values) {
    return values.map(function (value) {
      var options = selected.slice();
      options[index] = value;
      var variant = findVariant(variants, options);
      return { value: value, exists: Boolean(variant), available: Boolean(variant && variant.available) };
    });
  }

  // "Rose: #c9808a", one per line. Only hex is accepted: the value goes into a style.
  function parseColorMap(text) {
    var colors = {};
    String(text || '').split('\n').forEach(function (line) {
      var at = line.lastIndexOf(':');
      if (at < 1) return;
      var color = line.slice(at + 1).trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) colors[line.slice(0, at).trim().toLowerCase()] = color;
    });
    return colors;
  }

  function swatchColor(value, nativeColor, colors) {
    return nativeColor || colors[String(value).trim().toLowerCase()] || null;
  }

  // Only once the buyer has scrolled past the theme's button, not before reaching it.
  function pastButton(rect) {
    return rect.bottom <= 0;
  }

  var api = {
    findVariant: findVariant,
    optionStates: optionStates,
    parseColorMap: parseColorMap,
    swatchColor: swatchColor,
    pastButton: pastButton,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function readJson(el, selector, fallback) {
    var node = el.querySelector(selector);
    try {
      return (node && JSON.parse(node.textContent)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function themeForm(scope) {
    return Array.prototype.slice.call(scope.querySelectorAll('form[action*="/cart/add"]')).find(function (candidate) {
      return candidate.querySelector('[type="submit"]');
    });
  }

  // The theme's own control for one option: a group of radios or a select.
  function themeOption(scope, name) {
    var groups = scope.querySelectorAll('variant-radios fieldset, variant-selects fieldset, variant-selects .product-form__input');
    return Array.prototype.slice.call(groups).find(function (group) {
      var label = group.querySelector('legend, label.form__label');
      return label && label.textContent.trim().split('\n')[0].trim() === name;
    }) || null;
  }

  function themeOptionValue(group) {
    var control = group.querySelector('input:checked, select');
    return control ? control.value : null;
  }

  function setThemeOption(group, value) {
    var select = group.querySelector('select');
    if (select) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    var radio = Array.prototype.slice.call(group.querySelectorAll('input[type="radio"]')).find(function (input) {
      return input.value === value;
    });
    if (radio) radio.click();
  }

  // Writes only on a real change: the observer below would otherwise re-run on its own text.
  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function initSwatches(el) {
    var scope = el.closest('.shopify-section') || document;
    var variants = readJson(el, '[data-variants]', []);
    if (!variants.length) return;
    var colors = parseColorMap(el.dataset.colors);
    var groups = Array.prototype.slice.call(el.querySelectorAll('[data-option]'));
    var current = variants.find(function (variant) {
      return String(variant.id) === new URLSearchParams(location.search).get('variant');
    }) || variants.find(function (variant) {
      return variant.available;
    }) || variants[0];

    groups.forEach(function (group) {
      group.querySelectorAll('.sb-swatch').forEach(function (swatch) {
        var dot = swatch.querySelector('.sb-swatch__dot');
        var input = swatch.querySelector('input');
        var color = swatchColor(input.value, dot.dataset.nativeColor, colors);
        if (dot.dataset.nativeImage) dot.style.backgroundImage = 'url("' + dot.dataset.nativeImage + '")';
        else if (color) dot.style.backgroundColor = color;
        else swatch.classList.add('sb-swatch--text');
      });
    });

    // Options come from the theme's picker, so a change there (Size) reaches the swatches too.
    function selectedOptions() {
      return current.options.map(function (value, i) {
        var themeGroup = themeGroups()[i];
        return (themeGroup && themeOptionValue(themeGroup)) || value;
      });
    }

    function themeGroups() {
      return scope.querySelectorAll('variant-radios fieldset, variant-selects fieldset, variant-selects .product-form__input');
    }

    function refresh() {
      var selected = selectedOptions();
      groups.forEach(function (group) {
        var index = Number(group.dataset.index);
        var themeGroup = themeOption(scope, group.dataset.option);
        if (themeGroup) themeGroup.classList.add('sb-replaced');
        var inputs = Array.prototype.slice.call(group.querySelectorAll('input'));
        var states = optionStates(variants, selected, index, inputs.map(function (input) {
          return input.value;
        }));
        inputs.forEach(function (input, i) {
          var state = states[i];
          var note = !state.exists ? el.dataset.unavailable : state.available ? '' : el.dataset.soldOut;
          input.checked = input.value === selected[index];
          input.closest('.sb-swatch').classList.toggle('sb-swatch--off', Boolean(note));
          input.setAttribute('aria-label', note ? input.value + ', ' + note : input.value);
          if (input.checked) {
            setText(group.querySelector('[data-selected]'), input.value);
            setText(group.querySelector('[data-note]'), note ? '(' + note + ')' : '');
          }
        });
      });
    }

    el.addEventListener('change', function (event) {
      var group = event.target.closest('[data-option]');
      if (!group) return;
      event.stopPropagation();
      var themeGroup = themeOption(scope, group.dataset.option);
      if (themeGroup) {
        setThemeOption(themeGroup, event.target.value);
        refresh();
        return;
      }
      // A theme whose picker this block can't find: the variant URL works everywhere.
      var options = current.options.slice();
      options[Number(group.dataset.index)] = event.target.value;
      var variant = findVariant(variants, options);
      if (variant) location.search = '?variant=' + variant.id;
    });
    scope.addEventListener('change', refresh);
    // Newer Dawn versions replace the picker after a change.
    new MutationObserver(refresh).observe(scope, { childList: true, subtree: true });
    refresh();
  }

  function initSticky(el) {
    var scope = el.closest('.shopify-section') || document;
    var form = themeForm(scope);
    if (!form) return;
    var themeButton = form.querySelector('[type="submit"]');
    var variants = readJson(el, '[data-variants]', []);
    var button = el.querySelector('[data-sticky-button]');
    var price = el.querySelector('[data-sticky-price]');
    var variantName = el.querySelector('[data-sticky-variant]');

    // In <body> so no theme wrapper with a transform or z-index traps the fixed bar.
    document.querySelectorAll('body > [data-sticky]').forEach(function (old) {
      old.remove();
    });
    document.body.appendChild(el);

    function sync() {
      var input = form.querySelector('[name="id"]');
      var variant = variants.find(function (candidate) {
        return input && String(candidate.id) === input.value;
      });
      var blocked = themeButton.disabled || themeButton.getAttribute('aria-disabled') === 'true';
      var label = themeButton.querySelector('span');
      button.textContent = ((label || themeButton).textContent || '').trim() || button.textContent;
      button.disabled = blocked;
      price.hidden = themeButton.disabled;
      if (variant) {
        price.textContent = variant.price;
      }
      // From the picker, not the form: the form keeps the old id on an unavailable combination.
      var chosen = Array.prototype.map.call(scope.querySelectorAll('variant-radios fieldset, variant-selects fieldset, variant-selects .product-form__input'), themeOptionValue);
      if (variantName && chosen.length) variantName.textContent = chosen.join(' / ');
    }

    function setVisible(visible) {
      el.hidden = !visible;
      document.documentElement.classList.toggle('sb-sticky-open', visible);
      document.documentElement.style.setProperty('--sb-sticky-height', visible ? el.offsetHeight + 'px' : '0px');
    }

    button.addEventListener('click', function () {
      themeButton.click();
    });
    // Not an IntersectionObserver: it stays silent when a fast scroll jumps over the button.
    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        setVisible(pastButton(themeButton.getBoundingClientRect()));
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    new MutationObserver(sync).observe(themeButton, { attributes: true, childList: true, characterData: true, subtree: true });
    scope.addEventListener('change', sync);
    sync();
  }

  function init(scope) {
    [
      ['[data-swatches]', initSwatches],
      ['[data-sticky]', initSticky],
    ].forEach(function (entry) {
      scope.querySelectorAll(entry[0] + ':not([data-ready])').forEach(function (el) {
        el.setAttribute('data-ready', '');
        entry[1](el);
      });
    });
  }

  init(document);
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
