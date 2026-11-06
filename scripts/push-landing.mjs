// Pushes the demo landing page to a theme: node scripts/push-landing.mjs <theme id>
// Replaces templates/index.json on that theme, so keep a copy if the home page changed in the editor.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const STORE = 'clark-nguyen.myshopify.com';
const FILES = ['sections/demo-area.liquid', 'templates/index.json'];

const themeId = process.argv[2];
if (!/^\d+$/.test(themeId ?? '')) {
  console.error('Usage: node scripts/push-landing.mjs <theme id>');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'landing-'));
const variableFile = join(dir, 'variables.json');
writeFileSync(
  variableFile,
  JSON.stringify({
    themeId: `gid://shopify/OnlineStoreTheme/${themeId}`,
    files: FILES.map((filename) => ({
      filename,
      body: {type: 'TEXT', value: readFileSync(join('theme', filename), 'utf8')},
    })),
  }),
);

const mutation = `mutation Push($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
  themeFilesUpsert(themeId: $themeId, files: $files) {
    upsertedThemeFiles { filename }
    userErrors { filename code message }
  }
}`;

console.log(
  execFileSync(
    'shopify',
    ['store', 'execute', '-s', STORE, '--allow-mutations', '--no-input', '--json', '-q', mutation, '--variable-file', variableFile],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']},
  ),
);
