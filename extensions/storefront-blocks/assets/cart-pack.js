(function (root) {
  function cartErrorMessage(body, fallback) {
    return (body && (body.description || body.message)) || fallback;
  }

  function formatMoney(cents, format) {
    function split(decimals, thousands, point) {
      var parts = (cents / 100).toFixed(decimals).split('.');
      return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (parts[1] ? point + parts[1] : '');
    }
    return String(format || '${{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, function (match, name) {
      if (name === 'amount') return split(2, ',', '.');
      if (name === 'amount_no_decimals') return split(0, ',', '.');
      if (name === 'amount_with_comma_separator') return split(2, '.', ',');
      if (name === 'amount_no_decimals_with_comma_separator') return split(0, '.', ',');
      if (name === 'amount_with_apostrophe_separator') return split(2, "'", '.');
      return split(2, ',', '.');
    });
  }

  // Same rule as shared/shipping/free-shipping.ts, which the discount Function runs. A test
  // compares the two. Line prices are before discounts, as the Function's subtotal is.
  function freeShippingProgress(config, cart, rate) {
    var excluded = (config.excludedProductIds || []).map(String);
    var counted = 0;
    var excludedCount = 0;
    cart.items.forEach(function (item) {
      if (item.properties && item.properties._free_gift) return;
      if (excluded.indexOf('gid://shopify/Product/' + item.product_id) !== -1) excludedCount += 1;
      else counted += item.original_line_price;
    });
    var qualifying = counted / 100;
    var threshold = null;
    if (config.amounts && config.amounts[cart.currency] !== undefined) threshold = config.amounts[cart.currency];
    else if (cart.currency === config.currencyCode) threshold = config.amount;
    else if (rate) threshold = Math.round(config.amount * rate * 100) / 100;
    if (threshold === null) return { threshold: null, qualifying: qualifying, remaining: 0, unlocked: false, ratio: 0, excludedCount: excludedCount };
    var unlocked = qualifying >= threshold;
    return {
      threshold: threshold,
      qualifying: qualifying,
      remaining: unlocked ? 0 : Math.round((threshold - qualifying) * 100) / 100,
      unlocked: unlocked,
      ratio: threshold > 0 ? Math.min(1, qualifying / threshold) : 1,
      excludedCount: excludedCount,
    };
  }

  // Recommendations first, then the fallback products: no repeats, nothing unbuyable.
  function pickProducts(lists, options) {
    var seen = {};
    (options.skipIds || []).forEach(function (id) {
      seen[String(id)] = true;
    });
    var tag = (options.excludeTag || '').trim().toLowerCase();
    var picked = [];
    lists.forEach(function (list) {
      list.forEach(function (product) {
        if (!product || seen[String(product.id)] || !product.available) return;
        var tags = (product.tags || []).map(function (t) {
          return String(t).toLowerCase();
        });
        if (tag && tags.indexOf(tag) !== -1) return;
        seen[String(product.id)] = true;
        picked.push(product);
      });
    });
    return picked.slice(0, options.limit);
  }

  // The variant quick add can use, or null when the buyer has to choose on the product page.
  function quickAddVariant(product) {
    return product.variants.length === 1 && product.variants[0].available ? product.variants[0].id : null;
  }

  function imageAtWidth(url, width) {
    if (!url) return '';
    var full = url.indexOf('//') === 0 ? 'https:' + url : url;
    return full + (full.indexOf('?') === -1 ? '?' : '&') + 'width=' + width;
  }

  var api = {
    formatMoney: formatMoney,
    freeShippingProgress: freeShippingProgress,
    pickProducts: pickProducts,
    quickAddVariant: quickAddVariant,
    imageAtWidth: imageAtWidth,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function readJson(el, selector, fallback) {
    var node = el.querySelector(selector);
    try {
      // Shopify wraps app snippets in HTML comments, even inside this script tag.
      return (node && JSON.parse(node.textContent.replace(/<!--.*?-->/g, ''))) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function recommendations(productId, limit) {
    var url = routeRoot() + 'recommendations/products.json?intent=related&product_id=' + productId + '&limit=' + limit;
    return fetch(url)
      .then(function (response) {
        return response.ok ? response.json() : { products: [] };
      })
      .then(function (body) {
        return body.products || [];
      })
      .catch(function () {
        return [];
      });
  }

  // Adds through the theme's drawer when there is one. Resolves true if the drawer took over.
  function addAndOpenDrawer(variantId, fallback) {
    var drawer = document.querySelector('cart-drawer');
    var hasDrawer = Boolean(drawer && drawer.renderContents && drawer.getSectionsToRender);
    var body = { items: [{ id: Number(variantId), quantity: 1 }] };
    if (hasDrawer) {
      body.sections = drawer.getSectionsToRender().map(function (section) {
        return section.section || section.id;
      });
      body.sections_url = location.pathname;
    }
    return fetch(routeRoot() + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (result) {
        if (!response.ok) throw new Error(cartErrorMessage(result, fallback));
        if (hasDrawer) {
          // The theme's own submit clears this too. Left on, a first add shows an empty drawer.
          drawer.classList.remove('is-empty');
          drawer.renderContents({ id: variantId, sections: result.sections });
        }
        return hasDrawer;
      });
    });
  }

  function productCard(product, el) {
    var card = document.createElement('article');
    card.className = 'sb-card';
    var link = document.createElement('a');
    link.href = product.url;
    link.className = 'sb-card__title';
    if (product.featured_image) {
      var image = document.createElement('img');
      image.src = imageAtWidth(product.featured_image, 480);
      image.alt = '';
      image.loading = 'lazy';
      image.width = 480;
      image.height = 480;
      link.appendChild(image);
    }
    link.appendChild(document.createTextNode(product.title));
    var price = document.createElement('span');
    price.textContent = formatMoney(product.price, el.dataset.moneyFormat);
    card.appendChild(link);
    card.appendChild(price);

    var variantId = quickAddVariant(product);
    if (!variantId) {
      var choose = document.createElement('a');
      choose.href = product.url;
      choose.className = 'sb-button';
      choose.textContent = el.dataset.chooseOptions;
      card.appendChild(choose);
      return card;
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sb-button';
    button.textContent = el.dataset.quickAdd;
    var status = document.createElement('p');
    status.className = 'sb-status';
    status.setAttribute('role', 'status');
    button.addEventListener('click', function () {
      button.disabled = true;
      status.textContent = '';
      addAndOpenDrawer(variantId, el.dataset.error)
        .then(function (usedDrawer) {
          button.disabled = false;
          if (usedDrawer) return;
          var cartLink = document.createElement('a');
          cartLink.href = routeRoot() + 'cart';
          cartLink.textContent = el.dataset.viewCart;
          status.appendChild(cartLink);
        })
        .catch(function (error) {
          button.disabled = false;
          status.textContent = error.message;
        });
    });
    card.appendChild(button);
    card.appendChild(status);
    return card;
  }

  function initRelated(el) {
    var limit = Number(el.dataset.limit) || 4;
    var productId = el.dataset.productId;
    recommendations(productId, limit + 4).then(function (recommended) {
      var products = pickProducts([recommended, readJson(el, '[data-fallback]', [])], {
        skipIds: [productId],
        excludeTag: el.dataset.excludeTag,
        limit: limit,
      });
      if (!products.length) return;
      var grid = el.querySelector('[data-grid]');
      grid.textContent = '';
      products.forEach(function (product) {
        grid.appendChild(productCard(product, el));
      });
      el.hidden = false;
    });
  }

  function initCartBoost(el) {
    var drawer = document.querySelector('cart-drawer');
    if (!drawer) return;
    var config = readJson(el, '[data-config]', null);
    var fallback = readJson(el, '[data-fallback]', []);
    var format = el.dataset.moneyFormat;
    var showProgress = el.dataset.showProgress === 'true' && config;
    var showAddon = el.dataset.showAddon === 'true';
    var cache = {};
    var run = 0;

    var progress = document.createElement('div');
    progress.className = 'sb-ship';
    progress.hidden = true;
    progress.setAttribute('role', 'status');
    var message = document.createElement('p');
    message.className = 'sb-ship__message';
    var track = document.createElement('div');
    track.className = 'sb-ship__track';
    var fill = document.createElement('span');
    track.appendChild(fill);
    var note = document.createElement('p');
    note.className = 'sb-ship__note';
    progress.appendChild(message);
    progress.appendChild(track);
    progress.appendChild(note);

    var addon = document.createElement('div');
    addon.className = 'sb-addon';
    addon.hidden = true;

    function mount() {
      var header = drawer.querySelector('.drawer__header');
      var footer = drawer.querySelector('.drawer__footer');
      if (header && progress.previousElementSibling !== header) header.after(progress);
      if (footer && addon.nextElementSibling !== footer) footer.before(addon);
    }

    function renderProgress(cart) {
      progress.hidden = !showProgress || cart.item_count === 0;
      if (progress.hidden) return;
      var rate = root.Shopify && root.Shopify.currency ? Number(root.Shopify.currency.rate) : undefined;
      var status = freeShippingProgress(config, cart, rate);
      if (status.threshold === null) {
        progress.hidden = true;
        return;
      }
      message.textContent = (status.unlocked ? el.dataset.unlocked : el.dataset.remaining)
        .replace('[amount]', formatMoney(Math.round(status.remaining * 100), format))
        .replace('[label]', config.label);
      fill.style.width = Math.round(status.ratio * 100) + '%';
      progress.classList.toggle('sb-ship--done', status.unlocked);
      note.textContent = status.excludedCount > 0 && !status.unlocked ? el.dataset.excluded : '';
    }

    function renderAddon(cart, product) {
      addon.textContent = '';
      addon.hidden = !product;
      if (!product) return;
      var heading = document.createElement('p');
      heading.className = 'sb-addon__heading';
      heading.textContent = el.dataset.addonHeading;
      var row = document.createElement('div');
      row.className = 'sb-addon__row';
      if (product.featured_image) {
        var image = document.createElement('img');
        image.src = imageAtWidth(product.featured_image, 120);
        image.alt = '';
        image.width = 48;
        image.height = 48;
        row.appendChild(image);
      }
      var text = document.createElement('a');
      text.href = product.url;
      text.textContent = product.title + ' · ' + formatMoney(product.price, format);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sb-button';
      button.textContent = el.dataset.add;
      var status = document.createElement('p');
      status.className = 'sb-status';
      status.setAttribute('role', 'status');
      button.addEventListener('click', function () {
        button.disabled = true;
        status.textContent = '';
        addAndOpenDrawer(quickAddVariant(product), el.dataset.error).catch(function (error) {
          button.disabled = false;
          status.textContent = error.message;
        });
      });
      row.appendChild(text);
      row.appendChild(button);
      addon.appendChild(heading);
      addon.appendChild(row);
      addon.appendChild(status);
    }

    function refresh() {
      var mine = (run += 1);
      fetch(routeRoot() + 'cart.js')
        .then(function (response) {
          return response.json();
        })
        .then(function (cart) {
          if (mine !== run) return null;
          renderProgress(cart);
          if (!showAddon || cart.item_count === 0) {
            addon.hidden = true;
            return null;
          }
          var first = cart.items[0].product_id;
          cache[first] = cache[first] || recommendations(first, 8);
          return cache[first].then(function (recommended) {
            if (mine !== run) return;
            var inCart = cart.items.map(function (item) {
              return item.product_id;
            });
            var options = { skipIds: inCart, excludeTag: el.dataset.excludeTag, limit: 8 };
            renderAddon(cart, pickProducts([recommended, fallback], options).find(quickAddVariant) || null);
          });
        })
        .catch(function () {
          progress.hidden = true;
          addon.hidden = true;
        });
    }

    // The theme replaces the drawer's HTML after every cart change, so put ours back each time.
    var timer;
    new MutationObserver(function (records) {
      var ours = records.every(function (record) {
        return progress.contains(record.target) || addon.contains(record.target) || record.target === addon;
      });
      if (ours) return;
      mount();
      clearTimeout(timer);
      timer = setTimeout(refresh, 80);
    }).observe(drawer, { childList: true, subtree: true });
    mount();
    refresh();
  }

  function init(scope) {
    [
      ['[data-related]', initRelated],
      ['[data-cart-boost]', initCartBoost],
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
