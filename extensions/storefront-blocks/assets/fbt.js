(function (root) {
  // Products worth offering: in stock, not the current product, not seen twice, first available variant.
  function pickProducts(products, currentId, limit) {
    var seen = {};
    var picked = [];
    (products || []).forEach(function (product) {
      if (!product || picked.length >= limit || product.id === currentId || seen[product.id]) return;
      var variant = (product.variants || []).filter(function (v) {
        return v.available;
      })[0];
      if (!variant) return;
      seen[product.id] = true;
      picked.push({
        id: product.id,
        title: product.title,
        url: product.url,
        image: product.featured_image,
        variantId: variant.id,
        variantTitle: variant.title === 'Default Title' ? '' : variant.title,
        cents: variant.price,
      });
    });
    return picked;
  }

  // Sum of the ticked items, current product included, in cents.
  function totalCents(items, checked) {
    return items.reduce(function (sum, item, i) {
      return checked[i] ? sum + item.cents : sum;
    }, 0);
  }

  // /cart/add.js body: one line per ticked item.
  function cartItems(items, checked) {
    return items
      .filter(function (item, i) {
        return checked[i];
      })
      .map(function (item) {
        return { id: Number(item.variantId), quantity: 1 };
      });
  }

  function sized(url, width) {
    if (!url) return '';
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + width;
  }

  var api = { pickProducts: pickProducts, totalCents: totalCents, cartItems: cartItems, sized: sized };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function routeRoot() {
    return root.Shopify && root.Shopify.routes ? root.Shopify.routes.root : '/';
  }

  function recommendations(productId, intent) {
    var url = routeRoot() + 'recommendations/products.json?product_id=' + productId + '&limit=10&intent=' + intent;
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.ok ? response.json() : { products: [] };
      })
      .then(function (data) {
        return data.products || [];
      })
      .catch(function () {
        return [];
      });
  }

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function init(el) {
    var limit = Number(el.dataset.limit);
    var productId = Number(el.dataset.productId);
    var money = new Intl.NumberFormat(el.dataset.locale || undefined, { style: 'currency', currency: el.dataset.currency || 'USD' });
    var current = {
      id: productId,
      title: el.dataset.title,
      url: el.dataset.url,
      image: el.dataset.image,
      variantId: el.dataset.variantId,
      variantTitle: '',
      cents: Number(el.dataset.cents),
    };
    var list = el.querySelector('[data-list]');
    var total = el.querySelector('[data-total]');
    var add = el.querySelector('[data-add-all]');
    var status = el.querySelector('[data-status]');

    var intent = el.dataset.intent;
    recommendations(productId, intent)
      .then(function (products) {
        if (products.length || el.dataset.fallback !== 'true' || intent === 'related') return products;
        return recommendations(productId, 'related');
      })
      .then(function (products) {
        var items = [current].concat(pickProducts(products, productId, limit));
        if (items.length < 2) return;
        var checked = items.map(function () {
          return true;
        });

        function currentVariantId() {
          var field = document.querySelector('form[action*="/cart/add"] [name="id"]');
          return field && field.value ? field.value : current.variantId;
        }

        function render() {
          var count = checked.filter(Boolean).length;
          total.textContent = money.format(totalCents(items, checked) / 100);
          add.textContent = el.dataset.addAll.replace('__COUNT__', String(count));
          add.disabled = count === 0;
        }

        items.forEach(function (item, i) {
          var li = node('li', 'sb-fbt__item');
          var label = node('label', 'sb-fbt__label');
          var box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = true;
          box.className = 'sb-fbt__check';
          box.addEventListener('change', function () {
            checked[i] = box.checked;
            status.textContent = '';
            render();
          });
          var image = node('img', 'sb-fbt__image');
          image.alt = '';
          image.width = 64;
          image.height = 64;
          image.src = sized(item.image, 128);
          var name = node('span', 'sb-fbt__name', i === 0 ? el.dataset.thisItem + ': ' + item.title : item.title);
          label.appendChild(box);
          label.appendChild(image);
          label.appendChild(name);
          li.appendChild(label);
          if (item.variantTitle) li.appendChild(node('span', 'sb-fbt__variant', item.variantTitle));
          li.appendChild(node('span', 'sb-fbt__price', money.format(item.cents / 100)));
          list.appendChild(li);
        });

        add.addEventListener('click', function () {
          var body = cartItems(items, checked);
          if (!body.length) return;
          if (checked[0]) body[0].id = Number(currentVariantId());
          add.disabled = true;
          add.textContent = el.dataset.adding;
          fetch(routeRoot() + 'cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: body }),
          })
            .then(function (response) {
              if (!response.ok) throw new Error(el.dataset.error);
              root.location.href = routeRoot() + 'cart';
            })
            .catch(function (error) {
              status.textContent = error.message || el.dataset.error;
              render();
            });
        });

        render();
        el.hidden = false;
      });
  }

  function start(scope) {
    scope.querySelectorAll('[data-fbt]:not([data-ready])').forEach(function (el) {
      el.setAttribute('data-ready', '');
      init(el);
    });
  }

  start(document);
  document.addEventListener('shopify:section:load', function (event) {
    start(event.target);
  });
})(typeof window !== 'undefined' ? window : globalThis);
