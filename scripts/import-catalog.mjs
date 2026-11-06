// Imports products from a CSV, with metafields, an ingredient chart metaobject and filter tags.
//   node scripts/import-catalog.mjs scripts/catalog-demo.csv --dry-run    checks the file, writes nothing
//   node scripts/import-catalog.mjs scripts/catalog-demo.csv              writes to the demo store
//   --map <file> picks another column mapping (default scripts/catalog-map.json)
// One bad row stops the whole import, so a file never lands half applied. Running it again updates
// the same products. The demo set must never reach a cart, so no gift, discount or validation rule
// can see it. Sold out alone does not do that: /cart/add.js still accepted the variant. Requiring a
// selling plan that does not exist makes Shopify refuse the line.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildPlan, ingredientRow} from '../shared/catalog/import.ts';

const STORE = 'clark-nguyen.myshopify.com';
const CHART_TYPE = 'ingredient_chart';
const COLLECTION = {handle: 'catalog-demo', title: 'Catalog demo', descriptionHtml: '<p>Fictional products imported from a CSV. Not for sale.</p>'};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mapIndex = args.indexOf('--map');
const mapFile = mapIndex === -1 ? 'scripts/catalog-map.json' : args[mapIndex + 1];
const file = args.find((arg, index) => !arg.startsWith('--') && (mapIndex === -1 || index !== mapIndex + 1));
if (!file || !mapFile) {
  console.error('Usage: node scripts/import-catalog.mjs <file.csv> [--map <file>] [--dry-run]');
  process.exit(1);
}

const map = JSON.parse(readFileSync(mapFile, 'utf8'));
const {products, errors} = buildPlan(readFileSync(file, 'utf8'), map);

console.log(`${file}: ${products.length} good, ${new Set(errors.map((error) => error.line)).size} bad`);
for (const product of products) {
  console.log(`  ok   line ${product.line}  ${product.handle}  $${product.price}  ${product.tags.slice(1).join(' ')}  ${product.ingredients.length} ingredients`);
}
for (const {line, field, message} of errors) {
  console.log(`  BAD  ${line === 0 ? 'file' : `line ${line}`}  ${field}: ${message}`);
}
if (errors.length > 0) {
  console.error(dryRun ? 'Fix the rows above.' : 'Nothing was written. Fix the rows above.');
  process.exit(1);
}
if (dryRun) {
  console.log('Dry run: nothing was written.');
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'catalog-'));
function gql(query, variables = {}) {
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

function check(result, label) {
  if (result.userErrors?.length > 0) throw new Error(`${label}: ${JSON.stringify(result.userErrors)}`);
  return result;
}

const lookup = gql(
  `query Lookup($handle: String!) {
    metaobjectDefinitionByType(type: "${CHART_TYPE}") { id }
    collectionByIdentifier(identifier: {handle: $handle}) { id }
    publications(first: 10) { nodes { id name } }
    metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "custom") { nodes { key } }
  }`,
  {handle: COLLECTION.handle},
);
const onlineStore = lookup.publications.nodes.find((publication) => publication.name === 'Online Store');
const publish = (id, label) =>
  check(
    gql(
      `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      {id, input: [{publicationId: onlineStore.id}]},
    ).publishablePublish,
    label,
  );

let chartDefinitionId = lookup.metaobjectDefinitionByType?.id;
if (!chartDefinitionId) {
  chartDefinitionId = check(
    gql(
      `mutation Definition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) { metaobjectDefinition { id } userErrors { field message code } }
      }`,
      {
        definition: {
          type: CHART_TYPE,
          name: 'Ingredient chart',
          displayNameKey: 'title',
          access: {storefront: 'PUBLIC_READ'},
          fieldDefinitions: [
            {key: 'title', name: 'Title', type: 'single_line_text_field', required: true},
            {
              key: 'ingredients',
              name: 'Ingredients',
              description: 'One per line: Name | Amount | What it does',
              type: 'list.single_line_text_field',
              required: true,
            },
          ],
        },
      },
    ).metaobjectDefinitionCreate,
    'Chart definition',
  ).metaobjectDefinition.id;
  console.log('Created metaobject definition', CHART_TYPE);
}

const fields = [
  {key: 'region', name: 'Origin region', type: 'single_line_text_field', validations: [{name: 'choices', value: JSON.stringify(map.regions)}]},
  {key: 'concerns', name: 'Skin concerns', type: 'list.single_line_text_field', validations: [{name: 'choices', value: JSON.stringify(map.concerns)}]},
  {key: CHART_TYPE, name: 'Ingredient chart', type: 'metaobject_reference', validations: [{name: 'metaobject_definition_id', value: chartDefinitionId}]},
];
const existingKeys = lookup.metafieldDefinitions.nodes.map((definition) => definition.key);
for (const field of fields.filter(({key}) => !existingKeys.includes(key))) {
  check(
    gql(
      `mutation Field($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) { createdDefinition { id } userErrors { field message code } }
      }`,
      {definition: {...field, namespace: 'custom', ownerType: 'PRODUCT', access: {storefront: 'PUBLIC_READ'}}},
    ).metafieldDefinitionCreate,
    `Definition ${field.key}`,
  );
  console.log('Created metafield definition', `custom.${field.key}`);
}

let collectionId = lookup.collectionByIdentifier?.id;
if (!collectionId) {
  collectionId = check(
    gql(
      `mutation Collection($input: CollectionInput!) {
        collectionCreate(input: $input) { collection { id } userErrors { field message } }
      }`,
      {input: COLLECTION},
    ).collectionCreate,
    'Collection',
  ).collection.id;
  publish(collectionId, 'Publish collection');
  console.log('Created collection', COLLECTION.handle);
}

for (const product of products) {
  const chart = check(
    gql(
      `mutation Chart($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) { metaobject { id } userErrors { field message code } }
      }`,
      {
        handle: {type: CHART_TYPE, handle: product.handle},
        metaobject: {
          fields: [
            {key: 'title', value: product.title},
            {key: 'ingredients', value: JSON.stringify(product.ingredients.map(ingredientRow))},
          ],
        },
      },
    ).metaobjectUpsert,
    `Chart ${product.handle}`,
  ).metaobject;

  const saved = check(
    gql(
      `mutation Product($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
        productSet(input: $input, identifier: $identifier, synchronous: true) { product { id handle } userErrors { field message code } }
      }`,
      {
        identifier: {handle: product.handle},
        input: {
          handle: product.handle,
          title: product.title,
          descriptionHtml: `<p>${product.description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`,
          productType: product.productType,
          vendor: 'Solvane',
          status: 'ACTIVE',
          requiresSellingPlan: true,
          tags: product.tags,
          collections: [collectionId],
          files: [{originalSource: product.image, contentType: 'IMAGE', alt: product.title}],
          productOptions: [{name: 'Title', values: [{name: 'Default Title'}]}],
          variants: [
            {
              optionValues: [{optionName: 'Title', name: 'Default Title'}],
              price: product.price,
              sku: product.sku,
              inventoryPolicy: 'DENY',
              inventoryItem: {tracked: true},
            },
          ],
          metafields: [
            {namespace: 'custom', key: 'region', type: 'single_line_text_field', value: product.region},
            {namespace: 'custom', key: 'concerns', type: 'list.single_line_text_field', value: JSON.stringify(product.concerns)},
            {namespace: 'custom', key: CHART_TYPE, type: 'metaobject_reference', value: chart.id},
          ],
        },
      },
    ).productSet,
    `Product ${product.handle}`,
  ).product;
  publish(saved.id, `Publish ${product.handle}`);
  console.log('Imported', saved.handle);
}
console.log(`Done: ${products.length} products in /collections/${COLLECTION.handle}`);
