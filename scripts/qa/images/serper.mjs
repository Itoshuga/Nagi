/** Opt-in audit: cached checks are free; explicit multi-place audits spend one request per case. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
if (process.env.NAGI_IMAGE_LIVE_QA !== '1')
  throw Error('Set NAGI_IMAGE_LIVE_QA=1 to run the bounded live Serper audit.');
if (
  !process.argv.some((arg) =>
    ['--preview-cached', '--economy-cached', '--all-places'].includes(arg),
  )
)
  throw Error(
    'Use --economy-cached or --preview-cached for zero-provider-call checks. Paid multi-place audits require --all-places explicitly.',
  );
const root = process.cwd();
const require = createRequire(fs.realpathSync('node_modules/dotenv-cli/cli.js'));
const env = require('dotenv').parse(fs.readFileSync('.env'));
for (const [name, value] of Object.entries(env)) process.env[name] ??= value;
const directory = path.join(root, 'artifacts/serper-migration');
fs.mkdirSync(directory, { recursive: true });
const viteRequire = createRequire(
  createRequire(fs.realpathSync('node_modules/vitest/vitest.mjs')).resolve('vite'),
);
const { build } = viteRequire('esbuild');
const output = path.join(root, 'node_modules/.cache/nagi-serper-live.cjs');
await build({
  stdin: {
    contents: `export {serperQueries,serperCandidates,serperImagePage} from './apps/web/src/features/images/serper';export {imageContextSchema} from './apps/web/src/features/images/model';export {imageTarget,imageCacheKey} from './apps/web/src/features/images/server';export {indexImageGallery,readImageGallery} from './apps/web/src/features/images/discovery';export {readDevelopmentPreview,selectDevelopmentPreview} from './apps/web/src/features/images/preview';export {createServiceDatabase} from './packages/database/src/client';`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  tsconfig: 'apps/web/tsconfig.json',
  logLevel: 'silent',
  plugins: [
    {
      name: 'audit',
      setup(b) {
        b.onResolve(
          { filter: /^(server-only|@\/lib\/supabase\/server|@\/features\/trips\/sync-server)$/ },
          (a) => ({ path: a.path, namespace: 'audit' }),
        );
        b.onLoad({ filter: /.*/, namespace: 'audit' }, (a) => ({
          contents:
            a.path === 'server-only'
              ? ''
              : a.path.includes('supabase')
                ? 'export function serviceDatabase(){return globalThis.__nagiImageAuditDb}'
                : 'export class TripRequestError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code}}',
        }));
      },
    },
  ],
});
const api = require(output);
const db = api.createServiceDatabase(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
globalThis.__nagiImageAuditDb = db;
const cases = [
  ['Japan', 'country', 'Japan'],
  ['France', 'country', 'France'],
  ['Kamakura', 'city', 'Japan'],
  ['Tokyo', 'city', 'Japan'],
  ['Kyoto', 'city', 'Japan'],
  ['Paris', 'city', 'France'],
  ['Shibuya', 'neighborhood', 'Japan', 'Tokyo'],
  ['Asakusa', 'neighborhood', 'Japan', 'Tokyo'],
  ['Shinjuku', 'neighborhood', 'Japan', 'Tokyo'],
  ['Sensō-ji', 'entry', 'Japan', 'Tokyo', 'Asakusa'],
  ['Shibuya Parco', 'entry', 'Japan', 'Tokyo', 'Shibuya'],
  ['Pokémon Center SHIBUYA', 'entry', 'Japan', 'Tokyo', 'Shibuya'],
  ['Shibuya Sky', 'entry', 'Japan', 'Tokyo', 'Shibuya'],
  ['Tokyo Tower', 'entry', 'Japan', 'Tokyo'],
];
const reportPath = path.join(directory, 'live-report.json');
const report = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath))
  : { date: new Date().toISOString(), cases: [], persistent: null };
const nativeFetch = globalThis.fetch;
let requests = 0,
  credits = 0;
globalThis.fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  if (new URL(String(input)).hostname === 'google.serper.dev') {
    requests++;
    const body = await response
      .clone()
      .json()
      .catch(() => ({}));
    credits += Number(body.credits ?? 0);
  }
  return response;
};
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
if (process.argv.includes('--economy-cached')) {
  const existing = await db
    .from('image_galleries')
    .select('cache_key,place_source,place_kind,place_id,query_hash')
    .not('searched_at', 'is', null)
    .limit(20);
  const actor = await db.from('profiles').select('id').in('role', ['owner', 'admin']).limit(1);
  if (existing.error || !existing.data?.length || !actor.data?.[0])
    throw Error('Previously indexed places and an administrator are required.');
  const scope = { db, actor: actor.data[0].id, admin: true };
  let appChecks = 0;
  for (const gallery of existing.data) {
    const reserved = await db.rpc('reserve_image_discovery', {
      p_actor: scope.actor,
      p_key: gallery.cache_key,
      p_query_hash: gallery.query_hash,
      p_pages: 50,
      p_total_pages: 100,
      p_continue: true,
      p_refresh: true,
    });
    if (reserved.error || reserved.data?.lease)
      throw Error('A cached place unexpectedly reserved another paid page.');
    if (gallery.place_source === 'nagi') {
      const ref = { source: 'nagi', kind: gallery.place_kind, id: gallery.place_id };
      const target = await api.imageTarget(scope, ref);
      await api.indexImageGallery(scope, ref, target, { automatic: true });
      await api.indexImageGallery(scope, ref, target, { continue: true });
      await api.indexImageGallery(scope, ref, target, { refresh: true });
      const first = await api.readImageGallery(scope, ref);
      const next = await api.readImageGallery(scope, ref, 24);
      const choices = (data) => [...data.items, ...(data.fallbacks ?? [])].map((item) => item.id);
      if (
        choices(first).length > 10 ||
        choices(next).length > 10 ||
        first.hasMore ||
        next.hasMore ||
        next.offset !== 0 ||
        JSON.stringify(choices(first)) !== JSON.stringify(choices(next))
      )
        throw Error('A legacy gallery exposed photos outside its fixed ten-photo collection.');
      appChecks++;
    }
  }
  if (requests) throw Error('Cached places unexpectedly called Serper');
  const result = {
    date: new Date().toISOString(),
    cachedGalleries: existing.data.length,
    applicationChecks: appChecks,
    legacyRefreshAndContinuationChecks: existing.data.length,
    serperRequests: requests,
    credits,
  };
  fs.mkdirSync('artifacts/serper-economy', { recursive: true });
  fs.writeFileSync('artifacts/serper-economy/cached-report.json', JSON.stringify(result, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(result));
  process.exit(0);
}
if (process.argv.includes('--preview-cached')) {
  const cities = await db.from('cities').select('id').ilike('name', 'Tokyo').limit(1);
  const profiles = await db.from('profiles').select('id').in('role', ['owner', 'admin']).limit(1);
  if (!cities.data?.[0] || !profiles.data?.[0])
    throw Error('The existing Tokyo and administrator are required.');
  const ref = { source: 'nagi', kind: 'city', id: cities.data[0].id },
    scope = { db, actor: profiles.data[0].id, admin: true };
  const previousNode = process.env.NODE_ENV,
    previousFlag = process.env.NAGI_IMAGE_PREVIEW_UNVERIFIED;
  try {
    process.env.NODE_ENV = 'development';
    process.env.NAGI_IMAGE_PREVIEW_UNVERIFIED = 'true';
    const gallery = await api.readImageGallery(scope, ref);
    const preview = await api.readDevelopmentPreview(scope, ref);
    if (
      !gallery.previewEnabled ||
      !gallery.items.some((item) => item.preview?.rightsStatus === 'unknown') ||
      !preview?.photos.length
    )
      throw Error('Unknown cached photographs did not become development previews.');
    if (await api.readDevelopmentPreview({ ...scope, admin: false }, ref))
      throw Error('Non-administrator preview leak');
    process.env.NODE_ENV = 'production';
    if (await api.readDevelopmentPreview(scope, ref)) throw Error('Production preview leak');
    const production = await api.readImageGallery(scope, ref);
    if (production.previewEnabled || production.items.some((item) => item.preview))
      throw Error('Production gallery preview leak');
    let denied = false;
    try {
      await api.selectDevelopmentPreview(scope, ref, 'manual', gallery.items[0].id, 0);
    } catch (error) {
      if (error.status === 403) denied = true;
      else throw error;
    }
    if (!denied || requests) throw Error('Production write or unnecessary Serper request');
    const result = {
      date: new Date().toISOString(),
      place: 'Tokyo',
      cachedReferences: gallery.total,
      pageSize: gallery.items.length,
      previewCandidates: preview.photos.length,
      productionDenied: denied,
      nonAdminDenied: true,
      serperRequests: requests,
      credits,
      noSelectionChanged: true,
    };
    fs.writeFileSync(path.join(directory, 'preview-report.json'), JSON.stringify(result, null, 2), {
      mode: 0o600,
    });
    console.log(JSON.stringify(result));
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;
    if (previousFlag === undefined) delete process.env.NAGI_IMAGE_PREVIEW_UNVERIFIED;
    else process.env.NAGI_IMAGE_PREVIEW_UNVERIFIED = previousFlag;
  }
  process.exit(0);
}
for (const [name, kind, country, city, neighborhood] of cases) {
  if (report.cases.some((row) => row.name === name)) continue;
  const context = api.imageContextSchema.parse({
    name,
    country,
    city,
    neighborhood,
    language: 'en',
  });
  let query = api.serperQueries(context, kind)[0];
  const start = performance.now();
  let raw, persisted;
  if (name === 'Kamakura' && fs.existsSync(path.join(directory, 'probe-page-1.json'))) {
    raw = JSON.parse(fs.readFileSync(path.join(directory, 'probe-page-1.json')));
  } else if (name === 'Tokyo') {
    const cities = await db.from('cities').select('id,name').ilike('name', 'Tokyo').limit(1);
    const profiles = await db.from('profiles').select('id').in('role', ['owner', 'admin']).limit(1);
    if (cities.error || profiles.error || !cities.data?.[0] || !profiles.data?.[0])
      throw Error(
        'Audit requires the existing Tokyo and administrator; no synthetic catalog data is created.',
      );
    const ref = { source: 'nagi', kind: 'city', id: cities.data[0].id };
    const scope = { db, admin: true, actor: profiles.data[0].id };
    const target = await api.imageTarget(scope, ref);
    query = api.serperQueries(target.context, kind)[0];
    const before = requests;
    await api.indexImageGallery(scope, ref, target, { automatic: true });
    const indexed = requests - before;
    const first = await api.readImageGallery(scope, ref);
    const next = await api.readImageGallery(scope, ref, 24);
    await api.indexImageGallery(scope, ref, target, { automatic: true });
    const reread = await api.readImageGallery(scope, ref);
    if (requests - before !== indexed) throw Error('Cached gallery unexpectedly called Serper');
    if (first.total !== reread.total || first.items.length !== 24 || next.items.length !== 24)
      throw Error('Persistent gallery pagination failed');
    const stored = await db
      .from('image_galleries')
      .select('pages,credits,state')
      .eq('cache_key', api.imageCacheKey(ref))
      .single();
    if (stored.error) throw Error('Cannot read persistent gallery summary');
    persisted = {
      total: first.total,
      firstPage: first.items.length,
      nextPage: next.items.length,
      indexCalls: indexed,
      cachedCalls: requests - before - indexed,
      ...stored.data,
    };
    report.persistent = persisted;
    raw = { images: first.items.map((row) => row.metadata), credits: stored.data.credits };
  } else {
    raw = await api.serperImagePage(query, 1);
    fs.writeFileSync(
      path.join(directory, `live-${report.cases.length}.json`),
      JSON.stringify(raw, null, 2),
      { mode: 0o600 },
    );
  }
  const candidates = api.serperCandidates(raw, 'audit-' + name, context, kind);
  const row = {
    name,
    kind,
    query,
    rawCount: persisted?.total ?? raw.images.length,
    safeUnique: persisted?.total ?? candidates.length,
    credits: raw.credits ?? null,
    ms: Math.round(performance.now() - start),
    persisted: !!persisted,
  };
  report.cases.push(row);
  save();
  console.log(JSON.stringify(row));
}
report.thisRun = { requests, credits };
report.priorProbe = { requests: 2, credits: 4 };
report.totalObservedCredits =
  report.cases.reduce((sum, row) => sum + Number(row.credits ?? 0), 0) + 2;
save();
console.log(
  JSON.stringify({
    cases: report.cases.length,
    persistent: report.persistent,
    thisRun: report.thisRun,
    totalObservedCredits: report.totalObservedCredits,
  }),
);
