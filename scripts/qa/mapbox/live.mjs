/** Explicit opt-in, bounded real-provider audit. Never saves response content or tokens. */
import fs from 'node:fs';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
const { fetch, AbortSignal } = globalThis;
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(fs.realpathSync('node_modules/dotenv-cli/cli.js'));
const env = { ...require('dotenv').parse(fs.readFileSync('.env')), ...process.env };
if (env.NAGI_MAPBOX_LIVE_QA !== '1')
  throw new Error('Set NAGI_MAPBOX_LIVE_QA=1 for the bounded provider audit.');
const token = env.MAPBOX_ACCESS_TOKEN,
  browser = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (!token || !browser) throw new Error('Missing configured Mapbox tokens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function get(path, params = {}) {
  if (++calls > 55) throw new Error('Audit request cap exceeded');
  await sleep(160);
  const url = new URL('https://api.mapbox.com' + path);
  for (const [k, v] of Object.entries({ ...params, access_token: token }))
    url.searchParams.set(k, v);
  const start = performance.now();
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  return {
    status: res.status,
    ms: Math.round(performance.now() - start),
    data: res.ok ? await res.json() : null,
  };
}
const cases = [
  ['Sensō-ji', 'senso|浅草寺', '139.796,35.714'],
  ['Senso-ji', 'senso|浅草寺', '139.796,35.714'],
  ['浅草寺', 'senso|浅草寺', '139.796,35.714'],
  ['Pokémon Center SHIBUYA', 'pokemon|pokémon|ポケモン', '139.698,35.662'],
  ['Shibuya Parco', 'parco|パルコ', '139.698,35.662'],
  ['渋谷PARCO', 'parco|パルコ', '139.698,35.662'],
  ['Shibuya Sky', 'sky|スカイ', '139.702,35.658'],
  ['Nintendo TOKYO', 'nintendo|任天堂', '139.698,35.662'],
  ['Tokyo Tower', 'tower|東京タワー', '139.745,35.659'],
  ['Shinjuku Gyoen', 'gyoen|新宿御苑', '139.710,35.685'],
  ['Fushimi Inari', 'inari|稲荷', '135.773,34.967'],
  ['Kiyomizu-dera', 'kiyomizu|清水寺', '135.785,34.995'],
  ['Osaka Castle', 'castle|大阪城', '135.526,34.687'],
  ['Empire State Building', 'empire', '-73.986,40.748'],
  ['Tour Eiffel', 'eiffel', '2.294,48.858'],
];
const results = [];
const selected = [];
for (const [query, pattern, proximity] of cases) {
  const language = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query)
    ? 'ja'
    : 'en';
  const result = await get('/search/searchbox/v1/forward', {
    q: query,
    language,
    limit: '5',
    types: 'poi',
    proximity,
  });
  const features = result.data?.features ?? [];
  const matcher = new RegExp(pattern, 'iu');
  const matching = features.find((f) =>
    matcher.test(
      String(f.properties?.name)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, ''),
    ),
  );
  const row = {
    query,
    status: result.status,
    ms: result.ms,
    count: features.length,
    nameMatch: !!matching,
    firstNameMatches:
      !!features[0] &&
      matcher.test(
        String(features[0].properties?.name)
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, ''),
      ),
    id: matching?.properties?.mapbox_id,
  };
  results.push(row);
  // Console is used for the manual relevance review; names are never written to artifacts.
  console.log(
    JSON.stringify({
      query,
      status: row.status,
      count: row.count,
      names: features.slice(0, 3).map((f) => f.properties?.name),
    }),
  );
  if (['浅草寺', 'Pokémon Center SHIBUYA', 'Shibuya Parco'].includes(query) && matching)
    selected.push({ query, id: row.id, language, proximity });
}
const sessions = [];
for (const item of selected) {
  const session = randomUUID();
  const suggest = await get('/search/searchbox/v1/suggest', {
    q: item.query,
    limit: '10',
    language: item.language,
    proximity: item.proximity,
    session_token: session,
  });
  const matched = suggest.data?.suggestions?.some((p) => p.mapbox_id === item.id) ?? false;
  const selectedSuggestion = suggest.data?.suggestions?.[0];
  console.log(
    JSON.stringify({
      query: item.query,
      suggestNames: suggest.data?.suggestions?.slice(0, 3).map((p) => p.name),
    }),
  );
  let retrieve;
  if (selectedSuggestion)
    retrieve = await get(
      '/search/searchbox/v1/retrieve/' + encodeURIComponent(selectedSuggestion.mapbox_id),
      { session_token: session, language: item.language },
    );
  const point = retrieve?.data?.features?.find(
    (f) => f.properties?.mapbox_id === selectedSuggestion?.mapbox_id,
  )?.geometry?.coordinates;
  const reopened = await get('/search/searchbox/v1/forward', {
    q: item.query,
    limit: '10',
    language: item.language,
    proximity: item.proximity,
    types: 'poi,address,place,locality,neighborhood,region,country',
  });
  const forwardReopened =
    reopened.data?.features?.some(
      (f) => f.properties?.mapbox_id === item.id && f.geometry?.coordinates?.length === 2,
    ) ?? false;

  const details = await get('/places/v1/details/retrieve/' + encodeURIComponent(item.id));
  const d = details.data;
  sessions.push({
    query: item.query,
    suggestStatus: suggest.status,
    savedIdMatched: matched,
    forwardReopened,
    suggestCount: suggest.data?.suggestions?.length ?? 0,
    retrieveStatus: retrieve?.status,
    point: !!point,
    detailsStatus: details.status,
    fields: {
      name: !!d?.name,
      address: !!d?.full_address,
      hours: !!d?.opening_hours,
      website: !!d?.website,
      phone: !!d?.phone,
      photos: d?.photos?.length ?? 0,
    },
  });
}
const tile = new URL('https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/0/0/0');
tile.searchParams.set('access_token', browser);
const response = await fetch(tile, {
  headers: { Referer: env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' },
  cache: 'no-store',
  signal: AbortSignal.timeout(10000),
});
await response.arrayBuffer();
const report = {
  at: new Date().toISOString(),
  calls: ++calls,
  results,
  sessions,
  browserTile: {
    status: response.status,
    image: response.headers.get('content-type')?.startsWith('image/'),
  },
  limits:
    'Point-in-time sample; lexical relevance is manually reviewed, not proof of worldwide coverage.',
};
const output = env.NAGI_MAPBOX_QA_OUTPUT || 'artifacts/mapbox-migration/live-validation.json';
fs.mkdirSync(new URL('.', new URL(output, 'file://' + process.cwd() + '/')), {
  recursive: true,
  mode: 0o700,
});
fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ report: output, sessions, browserTile: report.browserTile, calls }));
