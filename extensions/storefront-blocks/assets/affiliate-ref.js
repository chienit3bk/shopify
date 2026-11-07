(function (root) {
  // Same rules as shared/affiliate/ref.ts (a test keeps the two in step).
  var PARAM = 'ref';
  var ATTRIBUTE = 'affiliate_ref';
  var STORAGE_KEY = 'affiliate_ref';
  var DAYS = 30;
  var PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

  function cleanRef(value) {
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    return PATTERN.test(trimmed) ? trimmed : null;
  }

  function refFromSearch(search) {
    try {
      return cleanRef(new URLSearchParams(search).get(PARAM));
    } catch (error) {
      return null;
    }
  }

  function parseStored(raw, now) {
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      var ref = cleanRef(data && data.ref);
      if (!ref || typeof data.at !== 'number') return null;
      if (now - data.at > DAYS * 86400000) return null;
      return { ref: ref, at: data.at };
    } catch (error) {
      return null;
    }
  }

  // A new ?ref= wins (last click); otherwise the stored one while it is inside the window.
  function nextStoredRef(search, stored, now) {
    var fresh = refFromSearch(search);
    if (fresh) return { ref: fresh, at: now };
    return parseStored(stored, now);
  }

  var api = { cleanRef: cleanRef, refFromSearch: refFromSearch, nextStoredRef: nextStoredRef, ATTRIBUTE: ATTRIBUTE };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function read() {
    try {
      return root.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function write(value) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      // Private mode: the ref still goes onto the cart below.
    }
  }

  var next = nextStoredRef(root.location.search, read(), Date.now());
  if (!next) return;
  write(next);

  // Put the ref on the cart so it reaches the order. Only writes when it changed.
  fetch(routeRoot() + 'cart.js', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json();
    })
    .then(function (cart) {
      if (cart.attributes && cart.attributes[ATTRIBUTE] === next.ref) return;
      var attributes = {};
      attributes[ATTRIBUTE] = next.ref;
      return fetch(routeRoot() + 'cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ attributes: attributes }),
      });
    })
    .catch(function () {});
})(typeof window !== 'undefined' ? window : globalThis);
