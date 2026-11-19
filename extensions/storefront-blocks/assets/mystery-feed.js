(function (root) {
  // Live feed of real mystery box draws. Same rules as shared/mystery/draw.ts
  // (shared/mystery/feed-asset.test.ts keeps the two in step).

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function formatOdds(odds) {
    return round2(odds) + '%';
  }

  function recentFeed(entries, now, limit, maxAgeHours) {
    limit = limit == null ? 10 : limit;
    maxAgeHours = maxAgeHours == null ? 72 : maxAgeHours;
    var cutoff = now.getTime() - maxAgeHours * 3600000;
    return entries
      .filter(function (e) {
        var t = Date.parse(e.drawnAt);
        return isFinite(t) && t >= cutoff && t <= now.getTime();
      })
      .sort(function (a, b) {
        return Date.parse(b.drawnAt) - Date.parse(a.drawnAt);
      })
      .slice(0, limit);
  }

  function timeAgo(drawnAt, now) {
    var minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(drawnAt)) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' h ago';
    return Math.floor(hours / 24) + ' d ago';
  }

  // Liquid hands the time over as epoch seconds: no date-format parsing differences between browsers.
  function fromLiquid(rows) {
    return (rows || [])
      .map(function (row) {
        var seconds = Number(row.drawnAt);
        return {
          buyer: String(row.buyer || 'Someone'),
          prize: String(row.prize || ''),
          handle: row.handle ? String(row.handle) : '',
          odds: Number(row.odds),
          drawnAt: isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : '',
        };
      })
      .filter(function (e) {
        return e.prize && e.drawnAt && isFinite(e.odds);
      });
  }

  var api = { formatOdds: formatOdds, recentFeed: recentFeed, timeAgo: timeAgo, fromLiquid: fromLiquid };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function init(el) {
    var data;
    try {
      data = JSON.parse(el.querySelector('[data-mystery-entries]').textContent);
    } catch (e) {
      return;
    }
    var maxAge = Number(el.getAttribute('data-max-age')) || 72;
    var every = (Number(el.getAttribute('data-interval')) || 8) * 1000;
    var entries = recentFeed(fromLiquid(data), new Date(), 10, maxAge);
    if (!entries.length) return; // Real draws only: nothing recent, no popup.

    var card = el.querySelector('[data-mystery-card]');
    var buyer = el.querySelector('[data-mystery-buyer]');
    var prize = el.querySelector('[data-mystery-prize]');
    var odds = el.querySelector('[data-mystery-odds]');
    var when = el.querySelector('[data-mystery-when]');
    var close = el.querySelector('[data-mystery-close]');
    var prefix = (root.Shopify && root.Shopify.routes && root.Shopify.routes.root) || '/';
    var index = 0;
    var timer = null;

    document.body.appendChild(el); // Out of theme wrappers that could trap position: fixed.
    el.hidden = false;

    function show() {
      var e = entries[index % entries.length];
      index += 1;
      buyer.textContent = e.buyer;
      prize.textContent = e.prize;
      prize.href = e.handle ? prefix + 'products/' + encodeURIComponent(e.handle) : '#';
      odds.textContent = formatOdds(e.odds);
      when.textContent = timeAgo(e.drawnAt, new Date());
      card.classList.add('is-visible');
      timer = setTimeout(hide, Math.min(6000, every - 1000));
    }
    function hide() {
      card.classList.remove('is-visible');
      timer = setTimeout(show, 1000);
    }
    close.addEventListener('click', function () {
      clearTimeout(timer);
      el.remove();
      try {
        sessionStorage.setItem('mystery-feed-closed', '1');
      } catch (e) {}
    });
    try {
      if (sessionStorage.getItem('mystery-feed-closed')) return el.remove();
    } catch (e) {}
    timer = setTimeout(show, 1500);
  }

  document.querySelectorAll('[data-mystery-feed]:not([data-ready])').forEach(function (el) {
    el.setAttribute('data-ready', '');
    init(el);
  });
})(typeof window !== 'undefined' ? window : globalThis);
