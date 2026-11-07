(function (root) {
  // Same readout as shared/ab/test.ts (a test keeps the two in step).
  var MIN_VIEWS = 100;

  function normalCdf(z) {
    var t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
    var y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  function pValue(successA, totalA, successB, totalB) {
    if (totalA <= 0 || totalB <= 0) return null;
    var pooled = (successA + successB) / (totalA + totalB);
    var se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
    if (se === 0) return 1;
    var z = successB / totalB - successA / totalA;
    return Math.min(1, 2 * (1 - normalCdf(Math.abs(z / se))));
  }

  function verdict(stats) {
    var a = stats.A;
    var b = stats.B;
    var p = pValue(a.orders, a.views, b.orders, b.views);
    if (a.views < MIN_VIEWS || b.views < MIN_VIEWS) return { status: 'collecting', winner: null, p: p };
    if (p !== null && p < 0.05) return { status: 'winner', winner: b.orders / b.views > a.orders / a.views ? 'B' : 'A', p: p };
    return { status: 'no-difference', winner: null, p: p };
  }

  var api = { pValue: pValue, verdict: verdict, MIN_VIEWS: MIN_VIEWS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  function rate(n, total) {
    return total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '0.0%';
  }

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  function init(el) {
    var state;
    try {
      state = JSON.parse(root.localStorage.getItem('ab_test_totals') || 'null');
    } catch (error) {
      state = null;
    }
    var id = el.dataset.experiment;
    var stats = state && state.version === 1 && state.experiments && state.experiments[id];
    var body = el.querySelector('[data-rows]');
    var note = el.querySelector('[data-verdict]');
    if (!stats) {
      note.textContent = el.dataset.empty;
      return;
    }
    ['A', 'B'].forEach(function (variant) {
      var v = stats[variant];
      var row = document.createElement('tr');
      row.setAttribute('data-row', variant);
      var revenue = Object.keys(v.revenue || {}).map(function (c) {
        return v.revenue[c].toFixed(2) + ' ' + c;
      });
      [variant, String(v.views), String(v.carts), String(v.orders), rate(v.orders, v.views), revenue.join(', ') || '0'].forEach(function (text) {
        row.appendChild(cell(text));
      });
      body.appendChild(row);
    });
    var result = verdict(stats);
    if (result.status === 'collecting') note.textContent = el.dataset.collecting.replace('__MIN__', String(MIN_VIEWS));
    else if (result.status === 'winner') note.textContent = el.dataset.winner.replace('__V__', result.winner).replace('__P__', result.p.toFixed(3));
    else note.textContent = el.dataset.tie.replace('__P__', result.p === null ? '-' : result.p.toFixed(3));
  }

  document.querySelectorAll('[data-ab-results]').forEach(init);
})(typeof window !== 'undefined' ? window : globalThis);
