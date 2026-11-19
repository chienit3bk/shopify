// Creates or updates the "Mystery box draw" Shopify Flow workflow through the Admin API (unstable):
//   node scripts/flow/mystery-draw-workflow.mjs <store> [workflow gid] [--activate]
// Order paid → Run code (scripts/flow/mystery-draw.js) → has a box? → order metafield custom.mystery_draw
// → for each draw: metaobjectCreate (public feed entry, type mystery_draw).
// Needs scripts/setup-mystery-box.graphql first, and `shopify store auth` with write_automations.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const [store, existingId, ...flags] = process.argv.slice(2);
if (!store?.endsWith('.myshopify.com')) {
  console.error('Usage: node scripts/flow/mystery-draw-workflow.mjs <store>.myshopify.com [workflow gid] [--activate]');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'mystery-flow-'));

export const INPUT_QUERY = `query {
  order {
    processedAt
    createdAt
    customer { firstName }
    billingAddress { firstName }
    shippingAddress { firstName }
    lineItems { quantity product { id mysteryPrizes { value } } }
  }
}`;

export const OUTPUT_SCHEMA = `type Output {
  count: Int!
  draws: [Draw!]!
  json: String!
  error: String!
}

type Draw {
  buyer: String!
  prize: String!
  prizeHandle: String!
  tier: String!
  odds: Float!
  drawnAt: String!
  roll: Float!
}`;

// Inside the loop, Flow names the current item after the list: runCode.draws → drawsForeachitem.
const ITEM = 'drawsForeachitem';
const feedEntry = {
  metaobject: {
    type: 'mystery_draw',
    fields: [
      ['buyer', 'buyer'],
      ['prize', 'prize'],
      ['prize_handle', 'prizeHandle'],
      ['tier', 'tier'],
      ['odds', 'odds'],
      ['drawn_at', 'drawnAt'],
    ].map(([key, field]) => ({key, value: `{{${ITEM}.${field}}}`})),
  },
};

const step = (step_id, task_id, task_version, task_type, values) => ({
  step_id,
  task_id,
  task_version,
  task_type,
  config_field_values: Object.entries(values).map(([config_field_id, value]) => ({config_field_id, value})),
});

const configuration = {
  __metadata: {version: 0.1},
  root: {
    steps: [
      step('order_paid', 'shopify::admin::order_paid', '0.1', 'TRIGGER', {}),
      step('draw_prizes', 'shopify::flow::run_code', '0.1', 'ACTION', {
        input: INPUT_QUERY,
        script: readFileSync(join(here, 'mystery-draw.js'), 'utf8'),
        output_schema: OUTPUT_SCHEMA,
      }),
      step('has_boxes', 'shopify::flow::condition', '0.1', 'CONDITION', {condition: '(runCode.count > 0)'}),
      step('save_draw_on_order', 'shopify::admin::add_order_metafield', '1.0', 'ACTION', {
        order_id: 'order.id',
        metafield: JSON.stringify({namespace: 'custom', key: 'mystery_draw', type: 'json'}),
        value: '{{runCode.json}}',
      }),
      step('each_draw', 'shopify::flow::foreach', '0.1', 'FOREACH', {listpath: 'runCode.draws'}),
      step('add_feed_entry', 'shopify::admin::admin_api_operation', '0.1', 'ACTION', {
        api_call: JSON.stringify({name: 'metaobjectCreate', blob: JSON.stringify(feedEntry)}),
      }),
    ],
    links: [
      ['order_paid', 'output', 'draw_prizes'],
      ['draw_prizes', 'output', 'has_boxes'],
      ['has_boxes', 'true', 'save_draw_on_order'],
      ['save_draw_on_order', 'output', 'each_draw'],
      ['each_draw', 'loop_body', 'add_feed_entry'],
    ].map(([from_step_id, from_port_id, to_step_id]) => ({from_step_id, from_port_id, to_step_id, to_port_id: 'input'})),
    patched_fields: [
      {
        field: 'metafield',
        arguments: {namespace: 'custom', key: 'mystery_prizes'},
        handle: 'mysteryPrizes',
        patched_type: 'PRODUCT',
        merchant_configured: true,
      },
    ],
  },
};

function gql(query, variables, mutation = false) {
  const variableFile = join(dir, 'variables.json');
  writeFileSync(variableFile, JSON.stringify(variables));
  const args = ['store', 'execute', '-s', store, '--version', 'unstable', '--no-input', '--json', '-q', query, '--variable-file', variableFile];
  if (mutation) args.push('--allow-mutations');
  const output = execFileSync('shopify', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']});
  // Progress lines come first; the result is the last JSON document.
  const parsed = JSON.parse(output.slice(output.search(/^\{$/m)));
  return parsed.data ?? parsed;
}

const FIELDS = 'id version activeVersion validationErrors { code message stepId configFieldId }';
const name = 'Mystery box draw';
let workflow;
if (existingId) {
  const {automationWorkflow: current} = gql(`query ($id: ID!) { automationWorkflow(id: $id) { version } }`, {id: existingId});
  const result = gql(
    `mutation ($id: ID!, $version: String!, $name: String!, $configuration: JSON!) {
      automationWorkflowUpdate(id: $id, version: $version, name: $name, configuration: $configuration) {
        automationWorkflow { ${FIELDS} } userErrors { field message code } } }`,
    {id: existingId, version: current.version, name, configuration},
    true,
  ).automationWorkflowUpdate;
  workflow = result.automationWorkflow;
  if (result.userErrors.length) console.error(JSON.stringify(result.userErrors, null, 2));
} else {
  const result = gql(
    `mutation ($name: String!, $configuration: JSON!) {
      automationWorkflowCreate(name: $name, configuration: $configuration) {
        automationWorkflow { ${FIELDS} } userErrors { field message code } } }`,
    {name, configuration},
    true,
  ).automationWorkflowCreate;
  workflow = result.automationWorkflow;
  if (result.userErrors.length) console.error(JSON.stringify(result.userErrors, null, 2));
}
console.log(JSON.stringify(workflow, null, 2));

if (flags.includes('--activate') && workflow && workflow.validationErrors.length === 0) {
  const result = gql(
    `mutation ($id: ID!, $version: String!) { automationWorkflowActivate(id: $id, version: $version) {
      automationWorkflow { id version activeVersion } userErrors { field message code } } }`,
    {id: workflow.id, version: workflow.version},
    true,
  );
  console.log(JSON.stringify(result.automationWorkflowActivate, null, 2));
}
