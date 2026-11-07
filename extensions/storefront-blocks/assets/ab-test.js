(function (root) {
  // Same rules as shared/ab/test.ts (a test keeps the two in step).
  var COOKIE = 'ab_test';
  var ATTRIBUTE = 'ab_test';
  var EVENT = 'ab_exposure';
  var DAYS = 90;
  var ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

  function cleanExperiment(value) {
    if (typeof value !== 'string') return null;
    var id = value.trim().toLowerCase();
    return ID_PATTERN.test(id) ? id : null;
  }

  function parseAssignment(raw) {
    if (typeof raw !== 'string') return null;
    var parts = raw.split(':');
    var experiment = cleanExperiment(parts[0]);
    if (!experiment || parts.length !== 2 || (parts[1] !== 'A' && parts[1] !== 'B')) return null;
    return { experiment: experiment, variant: parts[1] };
  }

  function forcedVariant(search) {
    try {
      var value = new URLSearchParams(search).get('ab');
      return value === 'A' || value === 'B' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function chooseVariant(experiment, stored, forced, random) {
    if (forced) return forced;
    var current = parseAssignment(stored);
    if (current && current.experiment === experiment) return current.variant;
    return random < 0.5 ? 'A' : 'B';
  }

  var api = { cleanExperiment: cleanExperiment, parseAssignment: parseAssignment, forcedVariant: forcedVariant, chooseVariant: chooseVariant, COOKIE: COOKIE, ATTRIBUTE: ATTRIBUTE, EVENT: EVENT };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function readCookie() {
    var match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(value) {
    document.cookie = COOKIE + '=' + encodeURIComponent(value) + '; max-age=' + DAYS * 86400 + '; path=/; SameSite=Lax';
  }

  function init(el) {
    var experiment = cleanExperiment(el.dataset.experiment);
    if (!experiment) return;
    var variant = chooseVariant(experiment, readCookie(), forcedVariant(root.location.search), Math.random());
    var value = experiment + ':' + variant;
    var changed = readCookie() !== value;
    writeCookie(value);

    // Both variants are in the HTML (hidden); show one. No second request, no layout jump below.
    el.querySelectorAll('[data-variant]').forEach(function (node) {
      node.hidden = node.dataset.variant !== variant;
    });
    el.setAttribute('data-assigned', variant);

    // The pixel counts the view; the cart attribute carries the assignment to the order.
    if (root.Shopify && root.Shopify.analytics && typeof root.Shopify.analytics.publish === 'function') {
      root.Shopify.analytics.publish(EVENT, { experiment: experiment, variant: variant });
    }
    if (changed) {
      var attributes = {};
      attributes[ATTRIBUTE] = value;
      fetch(routeRoot() + 'cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ attributes: attributes }),
      }).catch(function () {});
    }
  }

  function start(scope) {
    scope.querySelectorAll('[data-ab-test]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      init(el);
    });
  }

  start(document);
  document.addEventListener('shopify:section:load', function (event) {
    start(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
