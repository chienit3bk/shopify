// Places the Collection filter and Ingredient chart blocks on a theme:
//   node scripts/push-catalog-blocks.mjs <theme id>
// Reads the theme's live templates and adds only these two blocks, so editor changes are kept.
// Running it again changes nothing. The blocks render nothing without tags or a chart.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const STORE = 'clark-nguyen.myshopify.com';
const BLOCKS = 'shopify://apps/clark-checkout-demos/blocks';
const UID = '01a1a4e6-790c-7115-966d-2b6b81789c20';

const themeId = process.argv[2];
if (!/^\d+$/.test(themeId ?? '')) {
  console.error('Usage: node scripts/push-catalog-blocks.mjs <theme id>');
  process.exit(1);
}
const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
const dir = mkdtempSync(join(tmpdir(), 'catalog-blocks-'));

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
      files(filenames: ["templates/collection.json", "templates/product.json"], first: 2) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {id: gid},
);
// Shopify puts a comment above generated JSON templates.
const read = (filename) =>
  JSON.parse(theme.files.nodes.find((file) => file.filename === filename).body.content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));

const collection = read('templates/collection.json');
if (!collection.sections.sb_filter) {
  collection.sections.sb_filter = {
    type: 'apps',
    blocks: {filter: {type: `${BLOCKS}/collection_filter/${UID}`, settings: {}}},
    block_order: ['filter'],
    settings: {include_margins: true},
  };
  collection.order.splice(collection.order.indexOf('product-grid'), 0, 'sb_filter');
}

const product = read('templates/product.json');
const main = product.sections.main;
if (!main.blocks.sb_ingredients) {
  main.blocks.sb_ingredients = {type: `${BLOCKS}/ingredient_chart/${UID}`, settings: {}};
  main.block_order.splice(main.block_order.indexOf('description') + 1, 0, 'sb_ingredients');
}

const result = gql(
  `mutation Push($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { filename code message }
    }
  }`,
  {
    themeId: gid,
    files: [
      {filename: 'templates/collection.json', body: {type: 'TEXT', value: JSON.stringify(collection, null, 2)}},
      {filename: 'templates/product.json', body: {type: 'TEXT', value: JSON.stringify(product, null, 2)}},
    ],
  },
);
console.log(JSON.stringify(result.themeFilesUpsert, null, 2));
