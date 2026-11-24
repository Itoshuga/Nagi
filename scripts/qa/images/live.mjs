/** Explicit, bounded read-only provider audit; no Mapbox calls or database writes. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
const require = createRequire(fs.realpathSync('node_modules/dotenv-cli/cli.js'));
const env = require('dotenv').parse(fs.readFileSync('.env'));
if (process.env.NAGI_IMAGE_LIVE_QA !== '1')
  throw new Error('Set NAGI_IMAGE_LIVE_QA=1 to run the bounded provider audit.');
for (const key of [
  'NAGI_IMAGE_USER_AGENT',
  'WIKIMEDIA_CONTACT_EMAIL',
  'NAGI_PRIVACY_CONTACT',
  'NAGI_OPENVERSE_CLIENT_ID',
  'NAGI_OPENVERSE_CLIENT_SECRET',
])
  if (env[key]) process.env[key] ??= env[key];
const viteRequire = createRequire(
  createRequire(fs.realpathSync('node_modules/vitest/vitest.mjs')).resolve('vite'),
);
const { build } = viteRequire('esbuild');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nagi-image-audit-'));
const output = path.join(folder, 'providers.mjs');
await build({
  entryPoints: ['apps/web/src/features/images/providers.ts'],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'server-only-audit',
      setup(build) {
        build.onResolve({ filter: /^server-only$/ }, () => ({
          path: 'server-only',
          namespace: 'empty',
        }));
        build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }));
      },
    },
  ],
});
const { resolveImages } = await import(pathToFileURL(output).href);
const cases = [
  ['Sensō-ji', 'Tokyo', 'Japan', 35.7148, 139.7967, 'temple'],
  ['Tokyo Tower', 'Tokyo', 'Japan', 35.6586, 139.7454, 'monument'],
  ['Shibuya Crossing', 'Tokyo', 'Japan', 35.6595, 139.7005, 'tourist_attraction'],
  ['Shibuya Parco', 'Tokyo', 'Japan', 35.6621, 139.6986, 'shopping_mall'],
  ['Pokémon Center SHIBUYA', 'Tokyo', 'Japan', 35.6621, 139.6986, 'shop'],
  ['Shinjuku Gyoen', 'Tokyo', 'Japan', 35.6852, 139.7103, 'park'],
  ['Musée du Louvre', 'Paris', 'France', 48.8606, 2.3376, 'museum'],
  ['Tour Eiffel', 'Paris', 'France', 48.8584, 2.2945, 'monument'],
  ['Unknown neighbourhood shop Nagi 7z9x', 'Tokyo', 'Japan', 35.66, 139.7, 'shop'],
  ['Sensō-ji', 'Paris', 'France', 48.85, 2.35, 'temple'],
];
let requests = 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  if (++requests > 65) throw new Error('Audit request cap exceeded');
  return nativeFetch(...args);
};
const results = [];
const suggestions = process.argv.includes('--suggestions');
const variants = process.argv.includes('--variants');
for (const [name, city, country, latitude, longitude, category] of suggestions
  ? [cases[0], cases[3], cases[4]]
  : variants
    ? [
        ['PARCO Shibuya', 'Tokyo', 'Japan', 35.6621, 139.6986, 'shopping_mall'],
        ['Louvre Museum Paris', 'Paris', 'France', 48.8606, 2.3376, 'museum'],
        ['Shinjuku Gyoen National Garden', 'Tokyo', 'Japan', 35.6852, 139.7103, 'park'],
        cases[7],
      ]
    : cases) {
  const start = performance.now(),
    before = requests;
  try {
    const result = await resolveImages(
      {
        name,
        aliases: [],
        city,
        country,
        ...(suggestions ? {} : { latitude, longitude }),
        category,
        language: 'fr',
      },
      { openverse: async () => false },
    );
    results.push({
      name,
      city,
      ms: Math.round(performance.now() - start),
      requests: requests - before,
      confidence: result.confidence,
      selected: result.selected?.sourceId ?? null,
      license: result.selected?.license ?? null,
      candidates: result.candidates.length,
      reasons: result.reasons,
    });
  } catch (error) {
    results.push({
      name,
      city,
      ms: Math.round(performance.now() - start),
      requests: requests - before,
      error: error.code ?? 'network',
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.log(
  JSON.stringify(
    {
      mode: suggestions ? 'suggestions-without-coordinates' : 'resolved-with-coordinates',
      requests,
      results,
    },
    null,
    2,
  ),
);
