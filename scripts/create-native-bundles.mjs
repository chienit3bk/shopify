// Creates the demo for native bundles: 3 component products and 2 fixed bundles.
//   node scripts/create-native-bundles.mjs
// A fixed bundle is Shopify's own bundle model: one product with its own price, its stock read
// from the components, and the components on the order. No Function, so it runs on every plan.
// `custom.bundle_items` lists the components in option order, so the Bundle picker block can show
// each option value as that component's image. Stops if a demo product already exists.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const STORE = 'clark-nguyen.myshopify.com';
const LOCATION = 'gid://shopify/Location/116755267866';
const ONLINE_STORE = 'gid://shopify/Publication/322667872538';
const HOME_PAGE = 'gid://shopify/Collection/527871148314';
const MINIS_GIFTS = 'gid://shopify/Collection/527873442074';

const COMPONENTS = {
  wrap: {
    title: 'Bamboo Hair Wrap',
    handle: 'bamboo-hair-wrap',
    option: 'Colour',
    price: '18.00',
    sku: 'SV-WRAP',
    values: [
      {name: 'Oat', color: '#d8ccb8', stock: 20},
      {name: 'Sage', color: '#a3b18a', stock: 20},
      {name: 'Clay', color: '#c08a6b', stock: 20},
      {name: 'Ink', color: '#3d4a5c', stock: 0},
    ],
  },
  cloth: {
    title: 'Muslin Cloth 3-Pack',
    handle: 'muslin-cloth-3-pack',
    option: 'Design',
    price: '16.00',
    sku: 'SV-CLOTH3',
    values: [
      {name: 'Natural', color: '#efe8db', stock: 20},
      {name: 'Dots', color: '#efe8db', pattern: 'dots', stock: 20},
      {name: 'Stripe', color: '#efe8db', pattern: 'stripes', stock: 3},
    ],
  },
  towel: {
    title: 'Large Muslin Towel',
    handle: 'large-muslin-towel',
    option: 'Colour',
    price: '28.00',
    sku: 'SV-TOWEL',
    values: [
      {name: 'Oat', color: '#d8ccb8', stock: 20},
      {name: 'Sage', color: '#a3b18a', stock: 20},
      {name: 'Rose', color: '#d9a9a0', stock: 20},
    ],
  },
};

const BUNDLES = [
  {
    title: 'Everyday Bundle',
    handle: 'everyday-bundle',
    price: '29.00',
    compareAt: '34.00',
    items: [
      {key: 'wrap', option: 'Hair wrap'},
      {key: 'cloth', option: 'Muslin 3-pack'},
    ],
    collections: [MINIS_GIFTS],
  },
  {
    title: 'Muslin Bundle',
    handle: 'muslin-bundle',
    price: '38.00',
    items: [
      {key: 'cloth', option: 'Muslin 3-pack'},
      {key: 'towel', option: 'Large towel'},
    ],
    collections: [MINIS_GIFTS, HOME_PAGE],
  },
];

const dir = mkdtempSync(join(tmpdir(), 'native-bundles-'));

function gql(query, variables = {}) {
  const variableFile = join(dir, 'variables.json');
  writeFileSync(variableFile, JSON.stringify(variables));
  const output = execFileSync(
    'shopify',
    ['store', 'execute', '-s', STORE, '--allow-mutations', '--no-input', '--json', '-q', query, '--variable-file', variableFile],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']},
  );
  const parsed = JSON.parse(output);
  return parsed.data ?? parsed;
}

function check(label, payload) {
  if (payload?.userErrors?.length) throw new Error(`${label}: ${JSON.stringify(payload.userErrors)}`);
  return payload;
}

function draw(file, {color, pattern}) {
  const args = ['-size', '800x800', `xc:${color}`];
  if (pattern === 'dots') {
    for (let y = 60; y < 800; y += 110) {
      for (let x = (y / 110) % 2 ? 60 : 115; x < 800; x += 110) {
        args.push('-fill', '#8a7f70', '-draw', `circle ${x},${y} ${x + 11},${y}`);
      }
    }
  }
  if (pattern === 'stripes') {
    for (let x = 40; x < 800; x += 100) args.push('-fill', '#8fa3ad', '-draw', `rectangle ${x},0 ${x + 22},800`);
  }
  // Noise and a soft diagonal shade read as woven cloth.
  args.push('-attenuate', '0.35', '+noise', 'Gaussian', '(', '-size', '1300x1300', 'gradient:#ffffff-#c4c4c4', '-rotate', '35', '-gravity', 'center', '-crop', '800x800+0+0', '+repage', ')');
  args.push('-compose', 'Multiply', '-composite', '-quality', '86', file);
  execFileSync('magick', args);
}

function drawPair(file, left, right) {
  const half = (image) => ['(', image, '-resize', '1000x1000', '-gravity', 'center', '-crop', '500x1000+0+0', '+repage', ')'];
  execFileSync('magick', [...half(left), ...half(right), '+append', '-quality', '86', file]);
}

async function upload(file) {
  const filename = file.split('/').pop();
  const {stagedUploadsCreate} = gql(
    `mutation Stage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {input: [{resource: 'IMAGE', filename, mimeType: 'image/jpeg', httpMethod: 'POST'}]},
  );
  const target = check('stagedUploadsCreate', stagedUploadsCreate).stagedTargets[0];
  const form = new FormData();
  for (const {name, value} of target.parameters) form.append(name, value);
  form.append('file', new Blob([readFileSync(file)], {type: 'image/jpeg'}), filename);
  const response = await fetch(target.url, {method: 'POST', body: form});
  if (!response.ok) throw new Error(`Upload failed for ${filename}: ${response.status}`);
  return target.resourceUrl;
}

async function createComponent(key, component) {
  const images = {};
  for (const value of component.values) {
    const file = join(dir, `${component.handle}-${value.name.toLowerCase()}.jpg`);
    draw(file, value);
    images[value.name] = {file, url: await upload(file)};
  }
  const {productSet} = gql(
    `mutation Set($input: ProductSetInput!) {
      productSet(synchronous: true, input: $input) {
        product { id options { id name } variants(first: 10) { nodes { id sku } } }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: component.title,
        handle: component.handle,
        status: 'ACTIVE',
        vendor: 'Solvane',
        tags: ['bundle-demo'],
        descriptionHtml: '<p>Demo product for the native bundle example.</p>',
        productOptions: [{name: component.option, position: 1, values: component.values.map(({name}) => ({name}))}],
        files: component.values.map((value) => ({originalSource: images[value.name].url, contentType: 'IMAGE'})),
        variants: component.values.map((value) => ({
          optionValues: [{optionName: component.option, name: value.name}],
          price: component.price,
          inventoryItem: {sku: `${component.sku}-${value.name.toUpperCase()}`, tracked: true},
          inventoryQuantities: [{locationId: LOCATION, name: 'available', quantity: value.stock}],
          file: {originalSource: images[value.name].url, contentType: 'IMAGE'},
        })),
      },
    },
  );
  const {product} = check(`productSet ${key}`, productSet);
  publish(product.id);
  console.log(`component ${component.title}: ${product.id}`);
  return {...component, id: product.id, optionId: product.options[0].id, images};
}

function publish(id) {
  const {publishablePublish} = gql(
    `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) { userErrors { field message } }
    }`,
    {id, input: [{publicationId: ONLINE_STORE}]},
  );
  check('publishablePublish', publishablePublish);
}

async function waitForBundle(id) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const {productOperation} = gql(
      `query Operation($id: ID!) {
        productOperation(id: $id) {
          status
          product { id }
          ... on ProductBundleOperation { userErrors { field message } }
        }
      }`,
      {id},
    );
    check('productBundleOperation', productOperation);
    if (productOperation.status === 'COMPLETE') return productOperation.product.id;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Bundle operation ${id} did not finish`);
}

async function createBundle(bundle, components) {
  const {productBundleCreate} = gql(
    `mutation Bundle($input: ProductBundleCreateInput!) {
      productBundleCreate(input: $input) {
        productBundleOperation { id status }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: bundle.title,
        components: bundle.items.map(({key, option}) => ({
          quantity: 1,
          productId: components[key].id,
          optionSelections: [
            {componentOptionId: components[key].optionId, name: option, values: components[key].values.map(({name}) => name)},
          ],
        })),
      },
    },
  );
  const id = await waitForBundle(check('productBundleCreate', productBundleCreate).productBundleOperation.id);

  const [first, second] = bundle.items.map(({key}) => components[key]);
  const pair = join(dir, `${bundle.handle}.jpg`);
  drawPair(pair, first.images[first.values[1].name].file, second.images[second.values[1].name].file);

  const {productUpdate} = gql(
    `mutation Update($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) {
        product { variants(first: 50) { nodes { id } } }
        userErrors { field message }
      }
    }`,
    {
      product: {
        id,
        handle: bundle.handle,
        status: 'ACTIVE',
        vendor: 'Solvane',
        tags: ['bundle-demo'],
        descriptionHtml: `<p>Pick one of each. ${bundle.items.map(({key}) => components[key].title).join(' + ')}.</p>`,
        metafields: [
          {
            namespace: 'custom',
            key: 'bundle_items',
            type: 'list.product_reference',
            value: JSON.stringify(bundle.items.map(({key}) => components[key].id)),
          },
        ],
      },
      media: [{originalSource: await upload(pair), mediaContentType: 'IMAGE', alt: bundle.title}],
    },
  );
  const variants = check('productUpdate', productUpdate).product.variants.nodes;

  const {productVariantsBulkUpdate} = gql(
    `mutation Price($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
    }`,
    {productId: id, variants: variants.map((variant) => ({id: variant.id, price: bundle.price, compareAtPrice: bundle.compareAt ?? null}))},
  );
  check('productVariantsBulkUpdate', productVariantsBulkUpdate);

  publish(id);
  for (const collection of bundle.collections) {
    const {collectionAddProducts} = gql(
      `mutation Add($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } }
      }`,
      {id: collection, productIds: [id]},
    );
    check('collectionAddProducts', collectionAddProducts);
  }
  console.log(`bundle ${bundle.title}: ${id}, ${variants.length} variants`);
}

const handles = [...Object.values(COMPONENTS), ...BUNDLES].map(({handle}) => `handle:${handle}`).join(' OR ');
const {products} = gql(`query Existing($query: String!) { products(first: 5, query: $query) { nodes { handle } } }`, {query: handles});
if (products.nodes.length > 0) {
  console.error(`Already on the store: ${products.nodes.map(({handle}) => handle).join(', ')}`);
  process.exit(1);
}

const {metafieldDefinitionCreate} = gql(
  `mutation Definition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { code message }
    }
  }`,
  {
    definition: {
      name: 'Bundle items',
      namespace: 'custom',
      key: 'bundle_items',
      description: 'The products in this bundle, in the same order as its options.',
      type: 'list.product_reference',
      ownerType: 'PRODUCT',
      pin: true,
    },
  },
);
if (metafieldDefinitionCreate.userErrors.some(({code}) => code !== 'TAKEN')) check('metafieldDefinitionCreate', metafieldDefinitionCreate);

const components = {};
for (const [key, component] of Object.entries(COMPONENTS)) components[key] = await createComponent(key, component);
for (const bundle of BUNDLES) await createBundle(bundle, components);
