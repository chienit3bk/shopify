(function (root) {
  function nextTabIndex(current, key, count) {
    if (key === 'ArrowRight') return (current + 1) % count;
    if (key === 'ArrowLeft') return (current - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return current;
  }

  function cartErrorMessage(body, fallback) {
    return (body && (body.description || body.message)) || fallback;
  }

  function cartAddUrl(routeRoot) {
    return (routeRoot || '/') + 'cart/add.js';
  }

  var api = { nextTabIndex: nextTabIndex, cartErrorMessage: cartErrorMessage, cartAddUrl: cartAddUrl };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function addToCart(variantId, quantity, fallback) {
    return fetch(cartAddUrl(routeRoot()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: quantity }] }),
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error(cartErrorMessage(body, fallback));
        return body;
      });
    });
  }

  function themeQuantityInput(form) {
    var input = form.querySelector('[name="quantity"]') || document.querySelector('[name="quantity"][form="' + form.id + '"]');
    if (input) return input;
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'quantity';
    form.appendChild(input);
    return input;
  }

  function initVolumePicker(el) {
    var scope = el.closest('.shopify-section') || document;
    var form = Array.prototype.slice.call(scope.querySelectorAll('form[action*="/cart/add"]')).find(function (candidate) {
      return candidate.querySelector('[type="submit"]');
    });
    if (!form) return;
    var input = themeQuantityInput(form);
    el.addEventListener('change', function (event) {
      if (event.target.type !== 'radio') return;
      input.value = event.target.value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function initTabs(el) {
    var tabs = Array.prototype.slice.call(el.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(el.querySelectorAll('[role="tabpanel"]'));

    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        var active = i === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[i].hidden = !active;
      });
      if (focus) tabs[index].focus();
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        select(index, false);
      });
      tab.addEventListener('keydown', function (event) {
        var next = nextTabIndex(index, event.key, tabs.length);
        if (next === index) return;
        event.preventDefault();
        select(next, true);
      });
    });

    el.addEventListener('click', function (event) {
      var button = event.target.closest('[data-quick-add]');
      if (!button) return;
      var card = button.closest('[data-card]');
      var status = card.querySelector('[data-status]');
      var label = button.textContent;
      button.disabled = true;
      status.textContent = '';
      addToCart(button.dataset.variantId, 1, el.dataset.error)
        .then(function () {
          button.textContent = el.dataset.added;
          status.innerHTML = '';
          var link = document.createElement('a');
          link.href = routeRoot() + 'cart';
          link.textContent = el.dataset.viewCart;
          status.appendChild(link);
        })
        .catch(function (error) {
          button.disabled = false;
          button.textContent = label;
          status.textContent = error.message;
        });
    });
  }

  function init(scope) {
    scope.querySelectorAll('[data-volume-picker]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      initVolumePicker(el);
    });
    scope.querySelectorAll('[data-shop-by]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      initTabs(el);
    });
  }

  init(document);
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
