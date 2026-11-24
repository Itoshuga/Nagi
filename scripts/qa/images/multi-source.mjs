/** Explicitly enabled, bounded provider audit. No database access or restricted photo URL persistence. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, URL } from 'node:url';
import { performance } from 'node:perf_hooks';
const { AbortSignal } = globalThis;
if (process.env.NAGI_IMAGE_LIVE_QA !== '1')
  throw Error('Set NAGI_IMAGE_LIVE_QA=1 to run the bounded, read-only audit.');
const root = process.cwd();
const reportDirectory =
  process.env.NAGI_QA_OUTPUT ?? path.join(root, 'artifacts/image-resolver-v2');
fs.mkdirSync(reportDirectory, { recursive: true });
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
const require = createRequire(fs.realpathSync('node_modules/dotenv-cli/cli.js'));
const env = require('dotenv').parse(fs.readFileSync('.env'));
for (const key of [
  'WIKIMEDIA_CONTACT_EMAIL',
  'NAGI_IMAGE_USER_AGENT',
  'NAGI_PRIVACY_CONTACT',
  'NAGI_OPENVERSE_CLIENT_ID',
  'NAGI_OPENVERSE_CLIENT_SECRET',
  'MAPBOX_ACCESS_TOKEN',
])
  if (env[key]) process.env[key] = env[key];
const viteRequire = createRequire(
  createRequire(fs.realpathSync('node_modules/vitest/vitest.mjs')).resolve('vite'),
);
const { build } = viteRequire('esbuild');
const output = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'nagi-image-resolver-v2-')),
  'providers.mjs',
);
await build({
  stdin: {
    contents: `export {resolveImages} from './apps/web/src/features/images/providers';export {mapboxPhotoCandidates} from './apps/web/src/features/images/provider-photos';export {mapboxSearchPlaces} from './apps/web/src/features/integrations/mapbox/model';export {matchPlaceName} from './apps/web/src/features/images/matching';`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  tsconfig: 'apps/web/tsconfig.json',
  logLevel: 'silent',
  plugins: [
    {
      name: 'read-only-audit',
      setup(b) {
        b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/server)$/ }, (a) => ({
          path: a.path,
          namespace: 'audit',
        }));
        b.onLoad({ filter: /.*/, namespace: 'audit' }, (a) => ({
          contents:
            a.path === 'server-only'
              ? ''
              : 'export function serviceDatabase(){throw Error("Audit forbids database access")}',
        }));
      },
    },
  ],
});
const { resolveImages, mapboxPhotoCandidates, mapboxSearchPlaces, matchPlaceName } = await import(
  pathToFileURL(output)
);
const cases = [
  ['Sensō-ji', 'Tokyo', 'Japan', 35.7148, 139.7967, 'temple'],
  ['Tokyo Tower', 'Tokyo', 'Japan', 35.6586, 139.7454, 'monument'],
  ['Shibuya Parco', 'Tokyo', 'Japan', 35.6621, 139.6986, 'shopping_mall'],
  ['Pokémon Center SHIBUYA', 'Tokyo', 'Japan', 35.6621, 139.6986, 'shop'],
  ['Nintendo TOKYO', 'Tokyo', 'Japan', 35.6621, 139.6986, 'shop'],
  ['Shibuya Sky', 'Tokyo', 'Japan', 35.6585, 139.7022, 'tourist_attraction'],
  ['Shinjuku Gyoen', 'Tokyo', 'Japan', 35.6852, 139.7103, 'park'],
  ['Fushimi Inari', 'Kyoto', 'Japan', 34.9671, 135.7727, 'temple'],
  ['Kiyomizu-dera', 'Kyoto', 'Japan', 34.9949, 135.785, 'temple'],
  ['Tour Eiffel', 'Paris', 'France', 48.8584, 2.2945, 'monument'],
  ['Musée du Louvre', 'Paris', 'France', 48.8606, 2.3376, 'museum'],
  ['Château de Versailles', 'Versailles', 'France', 48.8049, 2.1204, 'monument'],
  ['Le Petit Cler', 'Paris', 'France', 48.8569, 2.3065, 'restaurant'],
  ['Les Fleurs', 'Paris', 'France', 48.8537, 2.3753, 'shop'],
];
const nativeFetch = globalThis.fetch;
const calls = { search: 0, details: 0, returnedRecords: 0, open: 0, openverse: 0 };
const allowed = new Set([
  'api.mapbox.com',
  'www.wikidata.org',
  'commons.wikimedia.org',
  'fr.wikipedia.org',
  'en.wikipedia.org',
  'ja.wikipedia.org',
  'api.openverse.org',
]);
globalThis.fetch = async (...args) => {
  const url = new URL(String(args[0]));
  if (!allowed.has(url.hostname)) throw Error('Audit endpoint rejected');
  if (url.hostname === 'api.mapbox.com') {
    if (url.pathname.includes('/places/')) {
      if (++calls.details > 14) throw Error('Details audit cap');
    } else {
      if (++calls.search > 14) throw Error('Search audit cap');
    }
  } else {
    if (++calls.open > 150) throw Error('Open provider audit cap');
    if (url.hostname === 'api.openverse.org') calls.openverse++;
  }
  return nativeFetch(...args);
};
let openverseAllowed = 1;
const results = [];
for (const [name, city, country, latitude, longitude, category] of cases.filter(
  (row) => !only || row[0] === only,
)) {
  const context = {
    name,
    city,
    country,
    latitude,
    longitude,
    category,
    language: 'fr',
    aliases: [],
  };
  const row = { name, city };
  const start = performance.now();
  if (process.env.MAPBOX_ACCESS_TOKEN && !process.argv.includes('--open-only')) {
    const mbStart = performance.now();
    try {
      const url = new URL('https://api.mapbox.com/search/searchbox/v1/forward');
      Object.entries({
        q: name + ' ' + city,
        language: 'en',
        types: 'poi',
        limit: '6',
        proximity: longitude + ',' + latitude,
        access_token: process.env.MAPBOX_ACCESS_TOKEN,
      }).forEach(([k, v]) => url.searchParams.set(k, v));
      const response = await globalThis.fetch(url, {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        row.mapbox = { searchStatus: response.status };
      } else {
        const places = mapboxSearchPlaces(await response.json(), 'forward', name);
        const place = places.find((p) => matchPlaceName(context, p.title).rank >= 2);
        if (!place) row.mapbox = { searchStatus: 200, matched: false };
        else {
          const details = new URL(
            'https://api.mapbox.com/places/v1/details/retrieve/' + encodeURIComponent(place.id),
          );
          details.searchParams.set('access_token', process.env.MAPBOX_ACCESS_TOKEN);
          const data = await globalThis.fetch(details, {
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.timeout(7000),
          });
          if (!data.ok) {
            await data.body?.cancel();
            row.mapbox = { searchStatus: 200, matched: true, detailsStatus: data.status };
          } else {
            const raw = await data.json();
            calls.returnedRecords++;
            const photos = Array.isArray(raw.photos) ? raw.photos : [];
            const checked = mapboxPhotoCandidates(raw, place.id, context);
            row.mapbox = {
              searchStatus: 200,
              matched: true,
              detailsStatus: 200,
              photos: photos.length,
              withoutDimensions: photos.filter((p) => !p.width || !p.height).length,
              display: checked.reason,
            };
          }
        }
      }
    } catch {
      row.mapbox = { error: 'network-or-response' };
    }
    row.mapbox.ms = Math.round(performance.now() - mbStart);
  }
  const before = calls.open;
  const openStart = performance.now();
  try {
    const result = await resolveImages(context, { openverse: async () => openverseAllowed-- > 0 });
    row.open = {
      ms: Math.round(performance.now() - openStart),
      requests: calls.open - before,
      confidence: result.confidence,
      selected: result.selected?.sourceId ?? null,
      source: result.selected?.provider ?? null,
      license: result.selected?.license ?? null,
      attribution: !!result.selected?.attribution,
      candidates: result.candidates.length,
      candidateFiles: result.candidates.map((photo) => photo.sourceId),
      reasons: result.reasons,
    };
  } catch (error) {
    row.open = {
      ms: Math.round(performance.now() - openStart),
      requests: calls.open - before,
      error: error.code ?? 'network',
    };
  }
  row.ms = Math.round(performance.now() - start);
  results.push(row);
  console.log(JSON.stringify(row));
  fs.writeFileSync(
    path.join(reportDirectory, 'live-audit.json'),
    JSON.stringify(
      {
        mode: 'real provider metadata; no database access or provider photo URL persistence',
        calls,
        results,
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ calls, places: results.length }));
