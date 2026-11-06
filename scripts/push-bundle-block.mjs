// Places the Bundle picker block above the theme's variant picker:
//   node scripts/push-bundle-block.mjs <theme id>
// Reads the live template, so editor changes are kept. Running it again changes nothing.
// The block renders nothing on products without `custom.bundle_items`.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const STORE = 'clark-nguyen.myshopify.com';
const BLOCK = 'shopify://apps/clark-checkout-demos/blocks/bundle_picker/01a1a4e6-790c-7115-966d-2b6b81789c20';
const FILE = 'templates/product.json';

const themeId = process.argv[2];
if (!/^\d+$/.test(themeId ?? '')) {
  console.error('Usage: node scripts/push-bundle-block.mjs <theme id>');
  process.exit(1);
}
const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
const dir = mkdtempSync(join(tmpdir(), 'bundle-block-'));

function gql(query, variables) {
  const variableFile = join(dir, 'variables.json');
  writeFileSync(variableFile, JSON.stringify(variables));
  const output = execFileSync(
    'shopify',
    ['store', 'execute', '-s', STORE, '--allow-mutations', '--no-input', '--json', '-q', query, '--variable-file', variableFile],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']},
  );
  const parsed = JSON.parse(output);
  return parsed.data ?? parsed;
}

const {theme} = gql(
  `query Files($id: ID!) {
    theme(id: $id) {
      files(filenames: ["${FILE}"], first: 1) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {id: gid},
);
// Shopify puts a comment above generated JSON templates.
const product = JSON.parse(theme.files.nodes[0].body.content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
const main = product.sections.main;
if (main.blocks.sb_bundle) {
  console.log('Already placed.');
  process.exit(0);
}
main.blocks.sb_bundle = {type: BLOCK, settings: {}};
main.block_order.splice(main.block_order.indexOf('variant_picker'), 0, 'sb_bundle');

const result = gql(
  `mutation Push($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { filename code message }
    }
  }`,
  {themeId: gid, files: [{filename: FILE, body: {type: 'TEXT', value: JSON.stringify(product, null, 2)}}]},
);
console.log(JSON.stringify(result.themeFilesUpsert, null, 2));
