// Places the A/B test and frequently-bought-together blocks on the live theme:
//   node scripts/push-ab-fbt-blocks.mjs <theme id>
// - "A/B test message" goes above the buy buttons in templates/product.json, "Bought together" and the
//   results table below them.
// Reads the live files, so editor changes are kept. Running it again changes nothing.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const STORE = 'clark-nguyen.myshopify.com';
const APP = 'shopify://apps/clark-checkout-demos/blocks';
const EXTENSION = '01a1a4e6-790c-7115-966d-2b6b81789c20';

const themeId = process.argv[2];
if (!/^\d+$/.test(themeId ?? '')) {
  console.error('Usage: node scripts/push-ab-fbt-blocks.mjs <theme id>');
  process.exit(1);
}
const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
const dir = mkdtempSync(join(tmpdir(), 'ab-fbt-blocks-'));

function gql(query, variables) {
  const variableFile = join(dir, 'variables.json');
  writeFileSync(variableFile, JSON.stringify(variables));
  const output = execFileSync(
    'shopify',
    ['store', 'execute', '-s', STORE, '--allow-mutations', '--no-input', '--json', '-q', query, '--variable-file', variableFile],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']},
  );
  const parsed = JSON.parse(output.slice(output.indexOf('{')));
  return parsed.data ?? parsed;
}

const {theme} = gql(
  `query Files($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/product.json"], first: 1) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {id: gid},
);
// Shopify puts a comment above generated JSON files.
const read = (name) =>
  JSON.parse(theme.files.nodes.find((n) => n.filename === name).body.content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));

const files = [];

const product = read('templates/product.json');
const main = product.sections.main;
const place = (id, name, settings, anchor, after) => {
  if (main.blocks[id]) return;
  main.blocks[id] = {type: `${APP}/${name}/${EXTENSION}`, settings};
  const at = main.block_order.indexOf(anchor);
  main.block_order.splice(at < 0 ? main.block_order.length : at + (after ? 1 : 0), 0, id);
};
place('sb_ab', 'ab_variant', {}, 'buy_buttons', false);
place('sb_fbt', 'frequently_bought_together', {}, 'buy_buttons', true);
place('sb_ab_results', 'ab_results', {}, 'sb_fbt', true);
files.push({filename: 'templates/product.json', body: {type: 'TEXT', value: JSON.stringify(product, null, 2)}});

if (files.length === 0) {
  console.log('Already placed.');
  process.exit(0);
}
const result = gql(
  `mutation Push($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { filename code message }
    }
  }`,
  {themeId: gid, files},
);
console.log(JSON.stringify(result.themeFilesUpsert, null, 2));
