// Places the two blocks of the bundle-builder and affiliate demos on the live theme:
//   node scripts/push-builder-blocks.mjs <theme id>
// - "Build your own bundle" goes above the buy buttons in templates/product.json (it renders only
//   on the product named in the bundle_builder config).
// - "Affiliate ref tracking" is an app embed, so it goes in config/settings_data.json.
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
  console.error('Usage: node scripts/push-builder-blocks.mjs <theme id>');
  process.exit(1);
}
const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
const dir = mkdtempSync(join(tmpdir(), 'builder-blocks-'));

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
      files(filenames: ["templates/product.json", "config/settings_data.json"], first: 2) {
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
if (!main.blocks.sb_builder) {
  main.blocks.sb_builder = {type: `${APP}/bundle_builder/${EXTENSION}`, settings: {}};
  main.block_order.splice(main.block_order.indexOf('buy_buttons'), 0, 'sb_builder');
  files.push({filename: 'templates/product.json', body: {type: 'TEXT', value: JSON.stringify(product, null, 2)}});
}

const settings = read('config/settings_data.json');
settings.current.blocks ??= {};
if (!Object.values(settings.current.blocks).some((b) => b.type?.includes('/blocks/affiliate_ref/'))) {
  settings.current.blocks.sb_affiliate_ref = {type: `${APP}/affiliate_ref/${EXTENSION}`, disabled: false, settings: {}};
  files.push({filename: 'config/settings_data.json', body: {type: 'TEXT', value: JSON.stringify(settings, null, 2)}});
}

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
