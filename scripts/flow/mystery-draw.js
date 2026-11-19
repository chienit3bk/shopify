// Shopify Flow "Run code" step of the "Mystery box draw" workflow (trigger: Order paid).
// Flow can't import modules, so the rules of shared/mystery/draw.ts are inlined here;
// shared/mystery/flow-script.test.ts keeps the two in step. Paste this file into the step
// (scripts/flow/mystery-draw-workflow.mjs does it through the Admin API).
//
// Input query (the product metafield is the patched field `mysteryPrizes` = custom.mystery_prizes):
//   query { order { processedAt createdAt customer { firstName } billingAddress { firstName }
//     shippingAddress { firstName } lineItems { quantity product { id mysteryPrizes { value } } } } }
// Output schema: see OUTPUT_SCHEMA in mystery-draw-workflow.mjs.

const SUM_TOLERANCE = 0.001;

export default function main(input) {
  const order = input.order;
  const buyer = maskName(firstNameOf(order));
  const drawnAt = order.processedAt || order.createdAt;
  const draws = [];
  const errors = [];

  for (const line of order.lineItems) {
    const raw = line.product && line.product.mysteryPrizes ? line.product.mysteryPrizes.value : null;
    if (!raw) continue;
    let prizes;
    try {
      prizes = parsePrizes(JSON.parse(raw));
    } catch (error) {
      errors.push(line.product.id + ': prize list is not valid JSON (' + error.message + ')');
      continue;
    }
    const problems = validateOdds(prizes);
    if (problems.length) {
      // Never draw from odds that don't match what the buyer was shown.
      errors.push(line.product.id + ': ' + JSON.stringify(problems));
      continue;
    }
    // One draw per box: quantity 3 = three independent draws.
    for (let i = 0; i < line.quantity; i++) {
      const r = Math.random();
      const prize = draw(prizes, r);
      draws.push({
        buyer: buyer,
        prize: clean(prize.title),
        prizeHandle: clean(prize.handle),
        tier: clean(prize.tier),
        odds: round2(prize.odds),
        drawnAt: drawnAt,
        roll: Math.round(r * 1e6) / 1e6,
      });
    }
  }

  return {
    count: draws.length,
    draws: draws,
    // The order metafield: what the buyer sees on the order status page.
    json: JSON.stringify({
      drawnAt: drawnAt,
      draws: draws.map(function (d) {
        return {prize: d.prize, prizeHandle: d.prizeHandle, tier: d.tier, odds: d.odds, roll: d.roll};
      }),
    }),
    error: errors.join('; '),
  };
}

function firstNameOf(order) {
  const sources = [order.customer, order.billingAddress, order.shippingAddress];
  for (const source of sources) {
    if (source && source.firstName && source.firstName.trim()) return source.firstName;
  }
  return null;
}

function parsePrizes(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (p) {
    return {
      id: String(p && p.id != null ? p.id : ''),
      title: String(p && p.title ? p.title : ''),
      tier: p && p.tier ? String(p.tier) : '',
      handle: p && p.handle ? String(p.handle) : '',
      odds: Number(p && p.odds),
    };
  });
}

function validateOdds(prizes) {
  if (prizes.length === 0) return [{code: 'EMPTY'}];
  const errors = [];
  const seen = {};
  let total = 0;
  for (const p of prizes) {
    if (seen[p.id]) errors.push({code: 'DUPLICATE', id: p.id});
    seen[p.id] = true;
    if (!Number.isFinite(p.odds) || p.odds <= 0) {
      errors.push({code: 'BAD_ODDS', id: p.id});
      continue;
    }
    total += p.odds;
  }
  if (Math.abs(total - 100) > SUM_TOLERANCE) errors.push({code: 'SUM', total: round2(total)});
  return errors;
}

function draw(prizes, r) {
  const target = r * 100;
  let edge = 0;
  for (const p of prizes) {
    edge += p.odds;
    if (target < edge) return p;
  }
  return prizes[prizes.length - 1];
}

function maskName(firstName) {
  const first = (firstName || '').trim();
  const letter = Array.from(first)[0];
  return letter ? letter.toUpperCase() + '***' : 'Someone';
}

// The values go into a JSON blob in the next Flow step: no quotes, backslashes or control characters.
// (A char-code filter, not a regex: Flow's linter rejects control characters in a regex.)
function clean(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (ch !== '"' && ch !== '\\' && ch.charCodeAt(0) >= 32) out += ch;
  }
  return out.slice(0, 120);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
