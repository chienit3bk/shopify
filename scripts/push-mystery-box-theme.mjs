// Theme setup for the mystery box (Horizon-style product-details block):
//   node scripts/push-mystery-box-theme.mjs <store>.myshopify.com <theme id>
// 1. templates/product.mystery-box.json = the live product template + "Mystery box odds" under the buy
//    buttons + "Sticky add to cart" (the box product uses template suffix `mystery-box`).
// 2. Switches on the "Mystery box live pulls" app embed in config/settings_data.json.
// Reads the live files, so editor changes are kept. Running it again changes nothing.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const [store, themeId] = process.argv.slice(2);
if (!store?.endsWith('.myshopify.com') || !/^\d+$/.test(themeId ?? '')) {
  console.error('Usage: node scripts/push-mystery-box-theme.mjs <store>.myshopify.com <theme id>');
  process.exit(1);
}
const APP = 'shopify://apps/clark-checkout-demos/blocks';
const EXTENSION = '01a1a4e6-790c-7115-966d-2b6b81789c20';
const block = (name) => `${APP}/${name}/${EXTENSION}`;
const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
const dir = mkdtempSync(join(tmpdir(), 'mystery-theme-'));

function gql(query, variables, mutation = false) {
  const variableFile = join(dir, 'variables.json');
  writeFileSync(variableFile, JSON.stringify(variables));
  const args = ['store', 'execute', '-s', store, '--no-input', '--json', '-q', query, '--variable-file', variableFile];
  if (mutation) args.push('--allow-mutations');
  const output = execFileSync('shopify', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']});
  const parsed = JSON.parse(output.slice(output.search(/^\{$/m)));
  return parsed.data ?? parsed;
}

const {theme} = gql(
  `query Files($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/product.json", "templates/product.mystery-box.json", "config/settings_data.json"], first: 3) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {id: gid},
);
// Shopify puts a comment above generated JSON files.
const parse = (content) => JSON.parse(content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
const files = Object.fromEntries(theme.files.nodes.map((n) => [n.filename, parse(n.body.content)]));
const upserts = [];

const template = files['templates/product.mystery-box.json'] ?? files['templates/product.json'];
const details = template.sections.main.blocks['product-details'];
let changed = false;
if (!details.blocks.mystery_odds) {
  details.blocks.mystery_odds = {type: block('mystery_odds'), settings: {}};
  const buy = details.block_order.findIndex((id) => details.blocks[id].type === 'buy-buttons');
  details.block_order.splice(buy + 1, 0, 'mystery_odds');
  changed = true;
}
if (!details.blocks.mystery_sticky) {
  details.blocks.mystery_sticky = {type: block('sticky_add_to_cart'), settings: {show_on_desktop: true}};
  details.block_order.push('mystery_sticky');
  changed = true;
}
if (changed) upserts.push({filename: 'templates/product.mystery-box.json', body: {type: 'TEXT', value: JSON.stringify(template, null, 2)}});

const settings = files['config/settings_data.json'];
settings.current.blocks ??= {};
const embed = Object.values(settings.current.blocks).find((b) => b.type === block('mystery_feed'));
if (!embed) {
  settings.current.blocks.mystery_feed = {type: block('mystery_feed'), disabled: false, settings: {box_pages_only: false, interval: 8, max_age: 72}};
  upserts.push({filename: 'config/settings_data.json', body: {type: 'TEXT', value: JSON.stringify(settings, null, 2)}});
} else if (embed.disabled) {
  embed.disabled = false;
  upserts.push({filename: 'config/settings_data.json', body: {type: 'TEXT', value: JSON.stringify(settings, null, 2)}});
}

if (!upserts.length) {
  console.log('Already set up.');
  process.exit(0);
}
const result = gql(
  `mutation Push($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { filename code message }
    }
  }`,
  {themeId: gid, files: upserts},
  true,
);
console.log(JSON.stringify(result.themeFilesUpsert, null, 2));
