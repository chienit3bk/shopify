(function (root) {
  // Property the cart transform Function groups by. Underscore keeps it out of the cart and order.
  var GROUP_PROPERTY = '_builder';

  function total(counts) {
    return counts.reduce(function (sum, n) {
      return sum + n;
    }, 0);
  }

  // Whether one more pick is allowed, and whether the bundle is complete.
  function pickState(counts, size) {
    var picked = total(counts);
    return { picked: picked, full: picked >= size, complete: picked === size };
  }

  // List price of the picks and what the bundle saves, in cents. Never negative.
  function bundleSummary(counts, cents, bundleCents) {
    var list = counts.reduce(function (sum, n, i) {
      return sum + n * cents[i];
    }, 0);
    return { list: list, save: Math.max(0, list - bundleCents) };
  }

  // The /cart/add.js body: one line per picked item, all tagged with the same group.
  function cartItems(counts, variantIds, group) {
    var items = [];
    counts.forEach(function (n, i) {
      if (n > 0) {
        var properties = {};
        properties[GROUP_PROPERTY] = group;
        items.push({ id: Number(variantIds[i]), quantity: n, properties: properties });
      }
    });
    return items;
  }

  function newGroup() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  var api = { pickState: pickState, bundleSummary: bundleSummary, cartItems: cartItems, GROUP_PROPERTY: GROUP_PROPERTY };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function init(el) {
    var size = Number(el.dataset.size);
    var bundleCents = Number(el.dataset.bundleCents);
    var money = new Intl.NumberFormat(el.dataset.locale || undefined, { style: 'currency', currency: el.dataset.currency || 'USD' });
    var items = Array.prototype.slice.call(el.querySelectorAll('[data-item]'));
    var counts = items.map(function () {
      return 0;
    });
    var cents = items.map(function (item) {
      return Number(item.dataset.cents);
    });
    var ids = items.map(function (item) {
      return item.dataset.variantId;
    });
    var summary = el.querySelector('[data-summary]');
    var add = el.querySelector('[data-add-bundle]');
    var status = el.querySelector('[data-status]');
    add.textContent = el.dataset.add;

    // This page exists for the bundle: the theme's own buy button would add the placeholder product.
    var themeForm = Array.prototype.slice.call(document.querySelectorAll('form[action*="/cart/add"]')).find(function (form) {
      return !el.contains(form);
    });
    if (themeForm) themeForm.hidden = true;

    function render() {
      var state = pickState(counts, size);
      var sums = bundleSummary(counts, cents, bundleCents);
      var text = el.dataset.picked.replace('__N__', String(state.picked));
      if (state.complete && sums.save > 0) text += ' · ' + el.dataset.save.replace('__AMOUNT__', money.format(sums.save / 100));
      summary.textContent = text;
      add.disabled = !state.complete;
      items.forEach(function (item, i) {
        item.querySelector('[data-count]').textContent = String(counts[i]);
        item.querySelector('[data-minus]').disabled = counts[i] === 0;
        item.querySelector('[data-plus]').disabled = state.full;
        item.classList.toggle('sb-builder__item--picked', counts[i] > 0);
      });
    }

    el.addEventListener('click', function (event) {
      var button = event.target.closest('[data-plus],[data-minus]');
      if (!button) return;
      var index = items.indexOf(button.closest('[data-item]'));
      if (index < 0) return;
      if (button.hasAttribute('data-plus') && !pickState(counts, size).full) counts[index] += 1;
      if (button.hasAttribute('data-minus') && counts[index] > 0) counts[index] -= 1;
      status.textContent = '';
      render();
    });

    add.addEventListener('click', function () {
      if (!pickState(counts, size).complete) return;
      add.disabled = true;
      fetch(routeRoot() + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: cartItems(counts, ids, newGroup()) }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error(el.dataset.error);
          root.location.href = routeRoot() + 'cart';
        })
        .catch(function (error) {
          add.disabled = false;
          status.textContent = error.message || el.dataset.error;
        });
    });

    render();
  }

  function start(scope) {
    scope.querySelectorAll('[data-bundle-builder]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      init(el);
    });
  }

  start(document);
  document.addEventListener('shopify:section:load', function (event) {
    start(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
