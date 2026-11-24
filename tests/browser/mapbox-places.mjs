import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
const { fetch, WebSocket } = globalThis;
const development = process.env.NAGI_IMAGE_DEV_QA === '1';
const previewQA = process.env.NAGI_PREVIEW_UI_QA === '1';
// Synthetic trip and provider, isolated browser profile; production adapter tested separately.
const root = process.cwd(),
  app = path.join(root, 'apps/web'),
  temp = path.join(root, 'node_modules/.cache/nagi-mapbox-ui-test');
fs.mkdirSync(temp, { recursive: true });
const viteRequire = createRequire(
  createRequire(fs.realpathSync('node_modules/vitest/vitest.mjs')).resolve('vite'),
);
const { build } = viteRequire('esbuild');
const ids = {
  trip: '11111111-1111-4111-8111-111111111111',
  parent: '22222222-2222-4222-8222-222222222222',
  day1: '33333333-3333-4333-8333-333333333333',
  day2: '44444444-4444-4444-8444-444444444444',
  viewer: '55555555-5555-4555-8555-555555555555',
  guild: '444444444444444444',
};
const country = { id: '66666666-6666-4666-8666-666666666666', name: 'Japon', slug: 'japon' },
  city = { id: '77777777-7777-4777-8777-777777777777', name: 'Tokyo', slug: 'tokyo' },
  category = {
    id: '88888888-8888-4888-8888-888888888888',
    name: 'Shopping',
    slug: 'shopping',
    color: '#739fd0',
    icon: null,
  };
const catalog = ['PARCO', 'Nintendo', 'Pokémon Center', 'SEGA'].map((title, i) => ({
  id: `99999999-9999-4999-8999-${String(i + 1).padStart(12, '0')}`,
  title,
  slug: 'entry-' + i,
  summary: 'Une étape de votre visite.',
  published: true,
  updated_at: '2026-11-19T12:00:00Z',
  cover_image_url: null,
  latitude: 35.66,
  longitude: 139.7,
  country,
  city,
  neighborhood: null,
  category,
}));
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ImagePicker} from './src/features/images/components';import {PlaceImage} from './src/features/integrations/mapbox/place-image';import {TripWorkbench} from './src/features/trips/workbench';import {optimisticTripChange} from './src/features/trips/mutation-model';
const ids=${JSON.stringify(ids)},catalog=${JSON.stringify(catalog)},now='2026-11-19T12:00:00Z';
const rootItem={source:"nagi",external_place_id:null,external_query:null,needs_place_relink:false,custom_title:null,custom_location:null,custom_latitude:null,custom_longitude:null,calendar_color:null,id:ids.parent,trip_id:ids.trip,trip_day_id:ids.day1,entry_id:catalog[0].id,entry:catalog[0],added_by:ids.viewer,notes:'Rendez-vous à l’entrée',sort_order:1024,start_time:'14:00',end_time:null,estimated_duration_minutes:120,version:0,created_at:now,updated_at:now,stops:[]};
if(location.search.includes('full')||location.search.includes('group')||location.search.includes('moves'))rootItem.stops=catalog.slice(1).map((entry,i)=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0'),trip_item_id:ids.parent,entry_id:entry.id,entry,added_by:ids.viewer,notes:'À retrouver au 6e étage',duration_minutes:40,sort_order:(i+1)*1024,version:0,created_at:now,updated_at:now}));
const extra=location.search.includes('moves')?[{...rootItem,id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',entry:{...catalog[0],title:'Musée'},notes:'Autre visite',start_time:'17:00',estimated_duration_minutes:60,sort_order:2048,stops:[]}]:location.search.includes('drag')||location.search.includes('group')?[{...rootItem,id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',entry_id:catalog[1].id,entry:catalog[1],notes:'Billet réservé · étage 6',start_time:'15:00',estimated_duration_minutes:40,sort_order:2048,stops:[]}]:[];window.__changes=[];window.__plan={id:ids.trip,guild_id:ids.guild,title:'Tokyo, à notre rythme',description:'',cover_image_url:null,created_by:ids.viewer,created_at:now,updated_at:now,start_date:'2027-07-12',end_date:'2027-07-13',status:'planned',collaboration_mode:'all_members',timezone:'Asia/Tokyo',destination_country_id:catalog[0].country.id,destination:{...catalog[0].country,iso_code:'JP',is_published:true,cover_image_url:null},version:0,items:[rootItem,...extra],days:[{id:ids.day1,trip_id:ids.trip,day_number:1,title:'Shibuya',date:'2027-07-12',sort_order:0,created_at:now,updated_at:now},{id:ids.day2,trip_id:ids.trip,day_number:2,title:'Tokyo',date:'2027-07-13',sort_order:1,created_at:now,updated_at:now}],organizers:[{user_id:ids.viewer}],people:[{id:ids.viewer,username:'iris',display_name:'Iris Martin',avatar_url:null}],connections:[]};
window.__edit=async(version,change,entry)=>{window.__changes.push(change);if(window.__failNext){window.__failNext=false;return {ok:false,error:'Échec simulé'}}const plan=optimisticTripChange(window.__plan,change,ids.viewer,entry??catalog.find(e=>e.id===change.data.entry));window.__plan={...plan,version:plan.version+1};window.__updatePlan(window.__plan);return {ok:true,version:window.__plan.version}};
window.__searches=[];window.__externalRequests=[];window.__imageRequests=[];const originalFetch=window.fetch;window.fetch=function(url,options){if(String(url).endsWith('/external')&&options?.body)window.__externalRequests.push(JSON.parse(options.body));if(String(url).endsWith('/images')&&options?.body)window.__imageRequests.push(JSON.parse(options.body));return Reflect.apply(originalFetch,this,[url,options])};
function App(){const[plan,setPlan]=useState(window.__plan);window.__updatePlan=setPlan;return <div className="nagi-space"><main className="app-container app-content py-10"><TripWorkbench guild={ids.guild} plan={plan} viewerId={ids.viewer} categories={[catalog[0].category]} canEdit canManage initialDay={ids.day1}/></main></div>}
function Fixture(){const id=location.search.includes('economy-busy')?'economy-busy':location.search.includes('economy-failed')?'economy-failed':'economy-cold';const reference={source:'nagi',kind:'city',id};return location.search.includes('economy-')?<div className="nagi-space p-10"><div data-economy-cover><PlaceImage photoReference={reference} className="h-24 w-40"/></div><ImagePicker reference={reference}/></div>:<App/>}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const actions = `export async function editTrip(g,t,v,c){return window.__edit(v,c)}export async function removeTrip(){return {error:''}}export async function archivePlannedTrip(){return {ok:true,version:0}}export async function tripPlaceOptions(){return []}export async function editableTripOptions(){return []}export async function tripCatalogSearch(){return {rows:[],hasMore:false}}export async function tripRelatedPlaces(){return []}export async function createPlannedTrip(){return {error:''}}`;
await build({
  stdin: {
    contents: development
      ? entry.replace(
          'render(<Fixture/>)',
          'render(<React.StrictMode><Fixture/></React.StrictMode>)',
        )
      : entry,
    loader: 'tsx',
    resolveDir: app,
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  loader: { '.png': 'dataurl' },
  jsx: 'automatic',
  outfile: path.join(temp, 'preview.js'),
  logLevel: 'silent',
  define: {
    'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production'),
    'process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN': JSON.stringify('test-public-mapbox-token'),
  },
  plugins: [
    {
      name: 'fixture',
      setup(b) {
        b.onResolve({ filter: /^next\/(link|image|navigation|dynamic)$/ }, (a) => ({
          path: a.path,
          namespace: 'next',
        }));
        b.onLoad({ filter: /.*/, namespace: 'next' }, (a) => ({
          contents: a.path.endsWith('link')
            ? `import React,{forwardRef} from 'react';export default forwardRef(function Link({href,children,prefetch,...props},ref){return <a ref={ref} href={href} {...props}>{children}</a>})`
            : a.path.endsWith('image')
              ? `import React from 'react';export default function Image({unoptimized,priority,fill,...props}){return <img {...props}/>} `
              : a.path.endsWith('dynamic')
                ? `import React from 'react';export default function dynamic(loader,options={}){const C=React.lazy(async()=>{const m=await loader();return {default:m.default??m}});return props=><React.Suspense fallback={options.loading?.()}><C {...props}/></React.Suspense>}`
                : `const router={refresh(){},push(){},replace(){},prefetch(){}};export function useRouter(){return router}export function usePathname(){return location.pathname}`,
          loader: 'tsx',
          resolveDir: app,
        }));
        b.onResolve({ filter: /^\.\/use-trip-mutations$/ }, () => ({
          path: 'queue',
          namespace: 'fixture',
        }));
        b.onResolve({ filter: /^\.\/calendar-color-actions$/ }, () => ({
          path: 'colors',
          namespace: 'fixture',
        }));
        b.onResolve({ filter: /^\.\/actions$/ }, (a) =>
          /features[\\/]trips[\\/]/.test(a.importer)
            ? { path: 'actions', namespace: 'fixture' }
            : undefined,
        );
        b.onResolve({ filter: /^\.\/live$/ }, (a) =>
          a.importer.includes('trips') ? { path: 'live', namespace: 'fixture' } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          contents:
            a.path === 'colors'
              ? "export async function listCalendarColors(){return {ok:true,data:[]}}export async function addCalendarColor(){return {ok:false,error:'fixture'}}export async function removeCalendarColor(){return {ok:true}}"
              : a.path === 'queue'
                ? "export function useTripMutations(g,plan){return {state:{plan,canEdit:true,canManage:true,pending:0,failed:false,error:'',online:true,connected:true,revoked:false},queue:{enqueue:(c,v,e)=>window.__edit(v,c,e),retry(){},clearError(){}}}}"
                : a.path === 'live'
                  ? 'export function useTripLive(){}'
                  : actions,
          loader: 'js',
        }));
        b.onResolve({ filter: /^@\// }, (a) => {
          const base = path.join(app, 'src', a.path.slice(2));
          const suffix = ['.tsx', '.ts', '.js', '/index.tsx', '/index.ts'].find((s) =>
            fs.existsSync(base + s),
          );
          return { path: base + (suffix ?? '') };
        });
      },
    },
  ],
});
const staticRoot = path.join(app, process.env.NAGI_QA_DIST_DIR ?? '.next', 'static');
const styles = fs
  .readdirSync(staticRoot, { recursive: true })
  .filter(
    (x) =>
      x.endsWith('.css') &&
      !fs.readFileSync(path.join(staticRoot, x), 'utf8').includes('.trip-workspace'),
  )
  .map((x) => `<link rel="stylesheet" href="/_next/static/${x.replaceAll('\\', '/')}">`)
  .join('');
const html = `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<link rel="stylesheet" href="/preview.css"></head><body class="font-sans"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>`;
const photo = {
  id: 'abcdef00-0000-4000-8000-000000000001',
  provider: 'wikimedia',
  sourceId: 'Sensoji.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sensoji.jpg',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Sensoji.jpg',
  thumbnailUrl:
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Sensoji.jpg/330px-Sensoji.jpg',
  previewUrl:
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Sensoji.jpg/960px-Sensoji.jpg',
  title: 'Sensō-ji',
  creator: 'Test Photographer',
  license: 'CC BY-SA',
  licenseVersion: '4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Sensō-ji · Test Photographer · CC BY-SA 4.0',
  width: 2400,
  height: 1600,
  verifiedAt: new Date().toISOString(),
};
const imageChoices = new Map();
const previewChoices = new Map();
const discovered = Array.from({ length: 80 }, (_, index) => ({
  id: 'efefefef-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
  metadata: {
    title: 'Vue du lieu ' + index,
    imageUrl: 'https://photos.example.org/venue-' + index + '.jpg',
    thumbnailUrl: 'https://photos.example.org/thumb-' + index + '.jpg',
    source: 'Venue photographer',
    link: 'https://venue.example.org/photos/' + index,
    imageWidth: 1200,
    imageHeight: 800,
  },
  rightsStatus: index === 1 ? 'permission_granted' : 'unknown',
  availability: 'unknown',
  excluded: false,
  sources: [],
}));
function discoveredPhoto(item) {
  return {
    id: item.id,
    provider: 'serper',
    sourceId: 'serper:' + item.id,
    sourceUrl: item.metadata.link,
    imageUrl: item.metadata.imageUrl,
    thumbnailUrl: item.metadata.thumbnailUrl,
    previewUrl: item.metadata.imageUrl,
    title: item.metadata.title,
    attribution: 'Venue owner · Permission verified',
    rightsStatus: item.rightsStatus,
    usageRights: 'permission-granted',
    verifiedAt: new Date().toISOString(),
  };
}
function previewPhoto(item) {
  return {
    ...discoveredPhoto(item),
    usageRights: 'development-preview',
    verifiedAt: undefined,
    attribution: 'Venue photographer · Preview',
  };
}
let indexedPages = 1;
const economyCalls = new Map();
const economyReads = new Map();
function galleryResponse(body) {
  const filtered = discovered
    .slice(0, 10)
    .filter((item) =>
      item.metadata.title.toLowerCase().includes((body.filter ?? '').toLowerCase()),
    );
  return {
    items: filtered.map((item) => ({
      ...item,
      ...(previewQA ? { preview: previewPhoto(item) } : {}),
      ...(['permission_granted', 'open_license'].includes(item.rightsStatus)
        ? { photo: discoveredPhoto(item) }
        : {}),
    })),
    total: filtered.length,
    offset: 0,
    hasMore: false,
    state: 'complete',
    stopReason: 'economy_limit',
    pages: indexedPages,
    credits: indexedPages * 2,
    canReview: true,
    searchEnabled: false,
    searchSize: 10,
    ...(previewQA ? { previewEnabled: true } : {}),
    fallbacks: [],
  };
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.endsWith('/images')) {
    res.setHeader('Content-Type', 'application/json');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw),
      key = body.reference.visit ?? body.reference.id;
    const eligible = body.reference.source === 'mapbox' && body.reference.id !== 'mapbox-two';
    if (body.reference.id.startsWith('economy-')) {
      const id = body.reference.id,
        count = economyCalls.get(id) ?? 0;
      if (body.operation === 'read' || body.operation === 'resolve') {
        const waiting = id === 'economy-busy' && count > 0 && !(economyReads.get(id) ?? 0);
        const selected =
          count > 0 && !waiting
            ? previewQA
              ? previewPhoto(discovered[0])
              : discoveredPhoto(discovered[1])
            : null;
        res.end(
          JSON.stringify({
            selected,
            candidates: selected ? [selected] : [],
            confidence: selected ? 'high' : 'none',
            reasons: waiting ? ['serper:waiting'] : [],
            status: waiting ? 'pending' : 'ready',
            retryAfter: waiting ? 1 : undefined,
          }),
        );
        return;
      }
      if (body.operation === 'index') economyCalls.set(id, count + 1);
      else if (body.operation === 'gallery' && count)
        economyReads.set(id, (economyReads.get(id) ?? 0) + 1);
      const loaded = (economyCalls.get(id) ?? 0) > 0,
        busy = id === 'economy-busy' && loaded && !(economyReads.get(id) ?? 0);
      const data = galleryResponse(body);
      data.items = loaded && !busy ? data.items.slice(0, 10) : [];
      data.total = loaded && !busy ? 10 : 0;
      data.hasMore = false;
      data.pages = loaded ? 1 : 0;
      data.credits = loaded ? 1 : 0;
      data.searchEnabled = !loaded && id !== 'economy-failed';
      data.state = busy
        ? 'indexing'
        : loaded
          ? body.operation === 'index'
            ? 'more'
            : 'complete'
          : 'idle';
      if (!loaded && id === 'economy-failed') {
        data.state = 'unavailable';
        data.searchIssue = 'La recherche unique n’a pas abouti.';
      }
      res.end(JSON.stringify(data));
      return;
    }
    if (body.operation === 'gallery') {
      res.end(JSON.stringify(galleryResponse(body)));
      return;
    }
    if (body.operation === 'index') {
      indexedPages++;
      res.end(JSON.stringify(galleryResponse(body)));
      return;
    }
    if (body.operation === 'review') {
      const item = discovered.find((item) => item.id === body.image);
      if (item) {
        item.rightsStatus = body.rights;
        item.excluded = body.excluded;
        item.creator = body.creator;
        item.evidence = body.evidence;
      }
      res.end(JSON.stringify(galleryResponse(body)));
      return;
    }
    const previous = imageChoices.get(key) ?? { mode: 'automatic', revision: 0 };
    const previousPreview = previewChoices.get(key) ?? { mode: 'automatic', revision: 0 };
    if (body.operation === 'preview')
      previewChoices.set(key, {
        mode: body.mode,
        image: body.image,
        revision: previousPreview.revision + 1,
      });
    if (body.operation === 'select')
      imageChoices.set(key, {
        mode: body.mode,
        image: body.image,
        revision: previous.revision + 1,
      });
    const state = imageChoices.get(key) ?? previous;
    let selected =
      state.mode === 'fallback'
        ? null
        : state.mode === 'manual' && state.image !== photo.id
          ? discoveredPhoto(discovered.find((item) => item.id === state.image))
          : eligible
            ? photo
            : null;
    const previewState = previewChoices.get(key) ?? previousPreview;
    if (previewQA && previewState.mode === 'fallback') selected = null;
    else if (previewQA && previewState.mode === 'manual')
      selected =
        previewState.image === photo.id
          ? photo
          : previewPhoto(discovered.find((item) => item.id === previewState.image));
    res.end(
      JSON.stringify({
        selected,
        candidates: eligible ? [photo] : [],
        confidence: eligible ? 'high' : 'none',
        reasons: [],
        status: 'ready',
        ...state,
        ...(previewQA
          ? {
              previewEnabled: true,
              previewRevision: previewState.revision,
              previewMode: previewState.mode,
              mode: previewState.mode === 'published' ? state.mode : previewState.mode,
              coverHidden: previewState.mode === 'fallback',
            }
          : {}),
      }),
    );
    return;
  }
  if (u.pathname.endsWith('/external')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') {
      await new Promise((r) => setTimeout(r, 150));
      res.end(
        JSON.stringify({ available: true, mapAvailable: true, minCharacters: 3, photos: false }),
      );
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const places = ['one', 'two'].map((id, i) => ({
      source: 'mapbox',
      id: 'mapbox-' + id,
      title: i ? 'Tokyo Museum' : 'Sensō-ji',
      category: i ? 'Musée' : 'Temple',
      locationLabel: 'Asakusa · Tokyo',
      featureType: 'poi',
      query: body.query,
      proof: 'signed-' + id,
      imageProof: 'image-context-' + id,
    }));
    if (body.operation === 'search') {
      if (body.query === 'Quota') {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: 'Quota atteint' }));
        return;
      }
      res.end(
        JSON.stringify({
          places:
            body.query === 'Missing'
              ? []
              : places.map((p) =>
                  body.kind === 'forward'
                    ? { ...p, coordinates: { latitude: 35.714, longitude: 139.796 } }
                    : p,
                ),
          timing: { providerMs: 40 },
        }),
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
    if (body.query === 'ResolutionFail') {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'Localisation indisponible' }));
      return;
    }
    const base = places.find((p) => p.id === body.placeId) ?? places[0];
    res.end(
      JSON.stringify({
        place: {
          ...base,
          coordinates: { latitude: 35.714, longitude: 139.796 },
          ...(body.operation === 'details'
            ? {
                address: 'Asakusa, Tokyo',
                website: 'https://example.test',
                openingHours: '09:00–17:00',
              }
            : {}),
        },
      }),
    );
    return;
  }
  if (u.pathname.endsWith('/places')) {
    res.setHeader('Content-Type', 'application/json');
    if (u.searchParams.get('mode') === 'detail') {
      const entry = catalog.find((e) => e.id === u.searchParams.get('entry'));
      res.end(
        JSON.stringify({
          entry: { ...entry, description: '', custom_values: {}, category_id: category.id },
          fields: [],
          relations: [],
        }),
      );
    } else {
      const rows = catalog
        .slice(1)
        .filter((e) =>
          e.title
            .toLocaleLowerCase('fr')
            .includes((u.searchParams.get('q') ?? '').toLocaleLowerCase('fr')),
        );
      res.end(
        JSON.stringify({
          rows,
          hasMore: false,
          suggested: true,
          links: rows.map((entry) => ({
            entry,
            from: 'PARCO',
            fromId: catalog[0].id,
            label: 'Contient',
          })),
        }),
      );
    }
    return;
  }
  let f;
  if (u.pathname.startsWith('/_next/static/')) f = path.join(staticRoot, u.pathname.slice(14));
  else if (u.pathname === '/mapbox-logo.svg') f = path.join(app, 'public/mapbox-logo.svg');
  else if (u.pathname === '/preview.js' || u.pathname === '/preview.css')
    f = path.join(temp, u.pathname.slice(1));
  if (f && fs.existsSync(f)) {
    res.setHeader(
      'Content-Type',
      f.endsWith('.css')
        ? 'text/css'
        : f.endsWith('.svg')
          ? 'image/svg+xml'
          : f.endsWith('.js')
            ? 'text/javascript'
            : 'application/octet-stream',
    );
    res.end(fs.readFileSync(f));
  } else if (u.pathname === '/favicon.ico') {
    res.statusCode = 204;
    res.end();
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://localhost:' + server.address().port,
  profile = fs.mkdtempSync(path.join(temp, 'browser-'));
const executable =
  process.env.NAGI_TEST_BROWSER ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(executable)) throw Error('Set NAGI_TEST_BROWSER to a Chromium executable');
const browser = spawn(
  executable,
  [
    '--headless',
    '--disable-gpu',
    '--mute-audio',
    '--no-first-run',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let ws;
const pending = new Map();
let seq = 0;
const errors = [],
  requests = [];
let pages = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; !fs.existsSync(path.join(profile, 'DevToolsActivePort')) && i < 100; i++)
    await sleep(100);
  const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const target = await (
    await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const x = JSON.parse(e.data);
    if (x.id) {
      const p = pending.get(x.id);
      pending.delete(x.id);
      if (x.error) p.reject(x.error);
      else p.resolve(x.result);
    }
    if (x.method === 'Network.requestWillBeSent') {
      const u = new URL(x.params.request.url);
      requests.push(u.origin + u.pathname);
    }
    if (x.method === 'Runtime.exceptionThrown')
      errors.push(
        x.params.exceptionDetails.exception?.description ?? x.params.exceptionDetails.text,
      );
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const assert = (v, m) => {
    if (!v) throw Error(m);
  };
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  async function wait(expression, maxMs = 6400) {
    for (let i = 0; i < Math.ceil(maxMs / 80); i++) {
      if (await ev(expression)) return;
      await sleep(80);
    }
    throw Error(
      'Timeout: ' +
        expression +
        '; state=' +
        JSON.stringify(
          await ev(
            '({changes:window.__changes,error:document.querySelector(".trip-workspace-error")?.textContent,panel:document.querySelector(".trip-context-panel")?.textContent,sorting:!!document.querySelector(".is-catalog-dragging"),external:document.querySelector(".trip-mapbox-search")?.textContent})',
          ),
        ) +
        '; errors=' +
        errors.join(';'),
    );
  }
  async function click(selector) {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await ev(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    // Let anchored menus reposition after scrolling before reading hit coordinates.
    await sleep(80);
    const r = await ev(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`,
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...r });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...r,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...r,
      button: 'left',
      clickCount: 1,
    });
    await sleep(100);
  }
  async function textClick(text, scope = 'document') {
    await wait(
      `!![...${scope}.querySelectorAll('button,[role=menuitem]')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length)`,
    );
    const selector = await ev(
      `(()=>{const e=[...${scope}.querySelectorAll('button,[role=menuitem]')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)return null;e.setAttribute('data-qa-click','target');return '[data-qa-click="target"]'})()`,
    );
    if (!selector) throw Error('Missing button ' + text);
    await click(selector);
    await ev(
      `document.querySelector('[data-qa-click="target"]')?.removeAttribute('data-qa-click')`,
    );
  }
  async function fill(selector, value) {
    await ev(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await sleep(50);
  }
  async function nav(width = 1280, full = false) {
    pages++;
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await send('Page.navigate', {
      url:
        base +
        '/app/' +
        ids.guild +
        '/trips/' +
        ids.trip +
        (full ? '?fixture=' + (typeof full === 'string' ? full : 'full') : ''),
    });
    await wait('!!document.querySelector(".trip-step")');
    await sleep(200);
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'), 'page overflow ' + width);
  }

  async function drag(source, target, position = 'centre', release = true) {
    const point = async (selector, pos) =>
      ev(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+(${pos === 'edge' ? '2' : 'b.height/2'})}})()`,
      );
    const from = await point(source, 'centre');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...from,
      button: 'left',
      clickCount: 1,
    });
    await sleep(230);
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + 8,
      y: from.y,
      buttons: 1,
    });
    await sleep(200);
    const to = await point(target, position);
    for (let i = 1; i <= 8; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: from.x + ((to.x - from.x) * i) / 8,
        y: from.y + ((to.y - from.y) * i) / 8,
        buttons: 1,
      });
      await sleep(30);
    }
    if (release) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...to,
        button: 'left',
        clickCount: 1,
      });
      await sleep(200);
    }
    return to;
  }

  await send('Fetch.enable', {
    patterns: [
      { urlPattern: 'https://api.mapbox.com/styles/*' },
      { urlPattern: 'https://thumb.wikimedia.org/*' },
      { urlPattern: 'https://photos.example.org/*' },
    ],
  });
  ws.addEventListener('message', (e) => {
    const x = JSON.parse(e.data);
    if (x.method === 'Fetch.requestPaused')
      void send('Fetch.fulfillRequest', {
        requestId: x.params.requestId,
        responseCode: previewQA && x.params.request.url.endsWith('/venue-0.jpg') ? 404 : 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body:
          previewQA && x.params.request.url.endsWith('/venue-0.jpg')
            ? ''
            : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=',
      });
  });
  async function screenshot(name) {
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(temp, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  const card = '.trip-external-result-list li:first-child [data-external-place-card]';
  async function openSearch(query = 'Sensō-ji') {
    await click('[aria-label="Explorer le catalogue"]');
    await wait('!!document.querySelector(".trip-source-tabs")');
    await fill('[aria-label="Rechercher un lieu"]', query);
    await textClick('Mapbox', 'document.querySelector(".trip-source-tabs")');
    await wait('document.querySelectorAll("[data-external-place-card]").length===2');
  }
  async function key(key, code = key) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  }
  await nav();
  await click('[aria-label="Explorer le catalogue"]');
  await fill('[aria-label="Rechercher un lieu"]', 'Sensō-ji');
  await sleep(400);
  assert(
    await ev('!!document.querySelector(".trip-step-photo [data-place-placeholder=shop]")'),
    'a venue without a verified photo has a category pictogram',
  );
  assert(await ev('window.__externalRequests.length===0'), 'inactive Mapbox makes no searches');
  const started = performance.now();
  await textClick('Mapbox', 'document.querySelector(".trip-source-tabs")');
  await wait('document.querySelectorAll("[data-external-place-card]").length===2');
  const searchMs = Math.round(performance.now() - started);
  assert(
    await ev(
      '[...document.querySelectorAll("[data-external-place-card]")].every(card=>card.querySelector("img,[data-place-placeholder]"))',
    ),
    'every visible result has a photo or a category pictogram',
  );
  await wait('!!document.querySelector("[data-external-place-card] img")');
  assert(
    await ev(
      '!!document.querySelector(".trip-external-result-list li:nth-child(2) [data-place-placeholder=museum]")',
    ),
    'a Mapbox museum without a photo retains its museum pictogram',
  );
  assert(await ev('window.__changes.length===0'), 'photo loading does not save the planner');
  await screenshot('catalog-desktop');
  assert(
    await ev('window.__externalRequests.every(r=>r.operation!=="details")'),
    'no per-result details',
  );
  await click('[aria-label="Rechercher un lieu"]');
  await key('ArrowDown');
  assert(
    await ev('document.activeElement.hasAttribute("data-external-place-card")'),
    'keyboard reaches result',
  );
  await key('ArrowDown');
  assert(
    await ev('document.activeElement===document.querySelectorAll("[data-external-place-card]")[1]'),
    'keyboard advances',
  );
  await drag(card, '.trip-timeline-end');
  await wait('window.__plan.items.some(i=>i.source==="mapbox")');
  assert(
    await ev(
      '[...document.querySelectorAll("[data-activity-id] .trip-step-copy")].some(e=>e.textContent.includes("Sensō-ji"))',
    ),
    'native title after insertion',
  );
  const first = await ev('window.__plan.items.find(i=>i.source==="mapbox").id');
  await drag(card, '.trip-timeline-end');
  await wait('window.__plan.items.filter(i=>i.source==="mapbox").length===2');
  assert(
    await ev('new Set(window.__plan.items.map(i=>i.id)).size===window.__plan.items.length'),
    'independent repeated occurrences',
  );
  await drag(card, '[aria-label="Détails de PARCO"]');
  await wait('window.__plan.items[0].stops.length===1');
  assert(await ev('window.__plan.items[0].stops[0].source==="mapbox"'), 'nested Mapbox stop');
  const beforeViews = await ev('window.__externalRequests.length');
  await textClick('Calendrier');
  await wait('!!document.querySelector(".trip-calendar")');
  await drag(card, '[data-slot-minute="870"]');
  await wait(
    'window.__changes.at(-1).operation==="add_place"&&window.__changes.at(-1).data.start_time',
  );
  assert(
    await ev('window.__changes.at(-1).data.start_time==="14:45"'),
    'calendar drop preserves snapping',
  );
  await wait('document.querySelector(".trip-calendar").textContent.includes("Sensō-ji")');
  await screenshot('calendar-mapbox');
  await textClick('Carte');
  await wait('!!document.querySelector(".leaflet-map-pane")');
  await wait('document.querySelector(".trip-map-place-list").textContent.includes("Sensō-ji")');
  assert(
    await ev(
      '!!document.querySelector(".trip-mapbox-logo")&&!!document.querySelector(".leaflet-control-attribution a")',
    ),
    'map attribution and logo',
  );
  await textClick('Itinéraire');
  await wait('!!document.querySelector(".trip-timeline")');
  assert(
    (await ev('window.__externalRequests.length')) === beforeViews,
    'view switches reuse active presentation',
  );
  await ev(
    `window.__edit(window.__plan.version,{operation:'color_item',data:{id:${JSON.stringify(first)},color:'#AABBCC'}})`,
  );
  assert(
    (await ev('window.__externalRequests.length')) === beforeViews,
    'color changes make no provider calls',
  );
  await click(card);
  await wait('!!document.querySelector(".trip-external-facts a")');
  assert(
    await ev('document.querySelector(".trip-detail-content").textContent.includes("Sensō-ji")'),
    'details show real native title',
  );
  assert(
    await ev('window.__externalRequests.filter(r=>r.operation==="details").length===1'),
    'one optional Details call',
  );
  await wait('!![...document.querySelectorAll("button")].find(b=>b.textContent==="Crédits photo")');
  await textClick('Crédits photo');
  await wait('document.querySelector("[role=dialog]").textContent.includes("Test Photographer")');
  assert(
    await ev('document.querySelector("[role=dialog]").textContent.includes("recadrée")'),
    'actual credits include cropping',
  );
  await key('Escape');
  await click(`[data-activity-id="${first}"] .trip-step-main`);
  await textClick('Modifier la photo');
  await wait('!!document.querySelector("[role=dialog]")');
  const beforeChoice = await ev('window.__changes.length');
  await textClick('Utiliser le pictogramme');
  await wait('!document.querySelector("[role=dialog]")');
  assert(
    (await ev('window.__changes.length')) === beforeChoice,
    'photo override does not save planner',
  );
  assert(
    await ev(
      '!!document.querySelector(' +
        JSON.stringify(
          `[data-activity-id="${first}"] .trip-step-main [data-place-placeholder=landmark]`,
        ) +
        ')',
    ),
    'occurrence fallback uses the venue category pictogram',
  );
  await screenshot('place-pictogram');
  await textClick('Modifier la photo');
  await click('[aria-label="Sélectionner Vue du lieu 1"]');
  await textClick('Choisir');
  await wait('!document.querySelector("[role=dialog]")');
  await wait(
    '!!document.querySelector(' +
      JSON.stringify(`[data-activity-id="${first}"] .trip-step-main img`) +
      ')',
  );
  assert(
    (await ev('window.__changes.length')) === beforeChoice,
    'manual selection remains a presentation mutation',
  );
  await textClick('Modifier la photo');
  const beforeIndex = await ev('window.__imageRequests.filter(r=>r.operation==="index").length');
  await wait('document.querySelectorAll("[data-image-candidate]").length===10');
  await screenshot('serper-gallery-desktop');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(100);
  assert(
    await ev(
      'document.documentElement.scrollWidth<=390 && document.querySelector("[role=dialog]").getBoundingClientRect().width<=390',
    ),
    'the photo gallery fits a mobile viewport',
  );
  await screenshot('serper-gallery-mobile');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await fill('[aria-label="Rechercher parmi les photographies"]', 'Vue du lieu 79');
  await wait('document.querySelectorAll("[data-image-candidate]").length===0');
  await fill('[aria-label="Rechercher parmi les photographies"]', 'Vue du lieu 9');
  await wait('document.querySelectorAll("[data-image-candidate]").length===1');
  await fill('[aria-label="Rechercher parmi les photographies"]', '');
  await wait('document.querySelectorAll("[data-image-candidate]").length===10');
  assert(
    await ev(
      '![...document.querySelectorAll("button")].some(b=>["Suivant","Précédent"].includes(b.textContent.trim()))',
    ),
    'a legacy collection exposes only the same ten choices',
  );
  await click('[aria-label="Sélectionner Vue du lieu 0"]');
  if (previewQA) {
    await wait(
      `document.querySelector('[aria-label="Informations de la photographie"] img')?.src.includes("thumb-0.jpg")`,
    );
    assert(
      await ev(
        '![...document.querySelectorAll("button")].find(b=>b.textContent==="Choisir").disabled',
      ),
      'unknown rights are selectable in the private development preview',
    );
    assert(
      !(await ev('!!document.querySelector("#photo-rights")')),
      'preview never requires the publication review form',
    );
    await screenshot('serper-development-preview');
  } else {
    assert(
      await ev(
        '[...document.querySelectorAll("button")].find(b=>b.textContent==="Choisir").disabled',
      ),
      'unknown rights cannot publish a cover',
    );
    await fill('#photo-rights', 'permission_granted');
    await fill('#photo-creator', 'Fixture owner');
    await fill('#photo-evidence', 'Written permission for the Nagi cover');
    await textClick('Enregistrer la vérification');
    await wait(
      '![...document.querySelectorAll("button")].find(b=>b.textContent==="Choisir").disabled',
    );
    await screenshot('serper-gallery-review');
  }
  await textClick('Choisir');
  await wait('!document.querySelector("[role=dialog]")');
  await wait(
    'document.querySelector(".trip-detail-photo img")?.src.includes("photos.example.org")',
  );
  assert(
    (await ev('window.__imageRequests.filter(r=>r.operation==="index").length')) === beforeIndex,
    'browsing and selecting cached photographs never calls paid discovery',
  );
  assert(
    (await ev('window.__changes.length')) === beforeChoice,
    'a Serper cover never saves the planner',
  );
  await textClick('Crédits photo');
  assert(
    await ev(
      previewQA
        ? 'document.querySelector("[role=dialog]").textContent.includes("Droits : À vérifier")'
        : 'document.querySelector("[role=dialog]").textContent.includes("Autorisation de publication vérifiée")',
    ),
    'published Serper credits preserve permission provenance',
  );
  await screenshot('serper-photo-credits');
  await key('Escape');
  if (previewQA) {
    assert(
      imageChoices.size === 0,
      'development selections do not change public cover assignments',
    );
    assert(
      discovered[0].rightsStatus === 'unknown',
      'previewing never fabricates a permission or licence',
    );
    await textClick('Modifier la photo');
    await textClick('Couverture publiée');
    await wait('!document.querySelector("[role=dialog]")');
    await wait(
      'document.querySelector(".trip-detail-photo img")?.src.includes("thumb.wikimedia.org")',
    );
    assert(
      imageChoices.size === 0,
      'restoring the published cover remains a private preview action',
    );
  }
  for (const width of [834, 390, 320]) {
    await nav(width);
    await openSearch();
    await screenshot('catalog-' + width);
    assert(
      await ev('document.documentElement.scrollWidth<=innerWidth'),
      'responsive source picker ' + width,
    );
    await click('.trip-external-result-list li:first-child .trip-catalog-action');
    await wait('!!document.querySelector(".trip-catalog-destination")');
    await fill('[aria-label="Destination de la visite"]', ids.day2);
    await textClick('Ajouter au voyage', 'document.querySelector(".trip-catalog-destination")');
    await wait('window.__plan.items.some(i=>i.source==="mapbox")');
    assert(
      (await ev('window.__plan.items.at(-1).trip_day_id')) === ids.day2,
      'menu inserts in chosen day ' + width,
    );
  }
  await nav();
  await click('[aria-label="Explorer le catalogue"]');
  await fill('[aria-label="Rechercher un lieu"]', 'Tokyo');
  await textClick('Mapbox', 'document.querySelector(".trip-source-tabs")');
  await click('[aria-label="Rechercher un lieu"]');
  await key('Enter');
  await wait('document.querySelectorAll("[data-external-place-card]").length===2');
  await sleep(400);
  assert(
    await ev('window.__externalRequests.length===1&&window.__externalRequests[0].kind==="forward"'),
    'explicit search during initialization is not overwritten by suggest',
  );
  await nav();
  await openSearch('ResolutionFail');
  await drag(card, '.trip-timeline-end');
  await wait(
    'document.querySelector(".trip-mapbox-search").textContent.includes("Localisation indisponible")',
  );
  assert(await ev('window.__plan.items.length===1'), 'failed resolution creates no occurrence');
  await fill('[aria-label="Rechercher un lieu"]', 'Missing');
  await wait('document.querySelector(".trip-mapbox-search").textContent.includes("Aucun lieu")');
  await fill('[aria-label="Rechercher un lieu"]', 'Quota');
  await wait('document.querySelector(".trip-mapbox-search").textContent.includes("Quota atteint")');
  const providerRequests = await ev('window.__externalRequests.length');
  for (const id of ['economy-cold', 'economy-busy']) {
    pages++;
    await send('Page.navigate', { url: base + '/?' + id });
    await wait('document.readyState==="complete"');
    await textClick('Modifier la photo');
    await wait('document.querySelectorAll("[data-image-candidate]").length===10');
    await sleep(250);
    assert(
      economyCalls.get(id) === 1,
      'a new place makes exactly one indexing request, including an in-flight lease',
    );
    assert(
      await ev('window.__imageRequests.filter(r=>r.operation==="index").length===1'),
      'waiting uses database reads and never another index request',
    );
    assert(
      await ev(
        '![...document.querySelectorAll("button")].some(b=>b.textContent.includes("Charger davantage"))',
      ),
      'the gallery cannot buy additional pages',
    );
    assert(
      await ev(
        '![...document.querySelectorAll("button")].some(b=>/Forcer|Actualiser|Rechercher des photos/.test(b.textContent))',
      ),
      'there is no way to buy a reload',
    );
    await key('Escape');
    await textClick('Modifier la photo');
    await wait('document.querySelectorAll("[data-image-candidate]").length===10');
    assert(economyCalls.get(id) === 1, 'reopening ten cached photos costs no additional request');
    await wait(
      'document.querySelector("[data-economy-cover] img")?.src.includes("photos.example.org")',
    );
    await screenshot(id);
    await key('Escape');
  }
  pages++;
  await send('Page.navigate', { url: base + '/?economy-failed' });
  await wait('document.readyState==="complete"');
  await textClick('Modifier la photo');
  await wait('document.querySelector("[role=dialog]")?.textContent.includes("unique")');
  assert(!economyCalls.get('economy-failed'), 'a failed attempt is not billed again automatically');
  assert(
    await ev(
      '![...document.querySelectorAll("button")].some(b=>/Forcer|Actualiser|Rechercher des photos/.test(b.textContent))',
    ),
    'a failed permanent attempt has no paid retry control',
  );
  await key('Escape');
  await textClick('Modifier la photo');
  await wait('document.querySelector("[role=dialog]")?.textContent.includes("unique")');
  assert(
    !economyCalls.get('economy-failed'),
    'reopening a failed attempt cannot buy another search',
  );
  await screenshot('economy-permanent');
  await key('Escape');
  assert(errors.length === 0, 'runtime errors: ' + errors.join(';'));
  assert(
    !requests.some((u) =>
      /maps.googleapis.com|places.googleapis.com|maps\/api\/js|placewidgets.googleapis.com/.test(u),
    ),
    'no Google SDK or API request',
  );
  const report = {
    mode: 'mocked Mapbox transport, real Nagi React and DnD',
    searchMs,
    pages,
    providerRequests,
    runtimeErrors: errors,
    googleRequests: 0,
    passed: true,
    developmentPreview: previewQA,
    economyCases: 3,
  };
  console.log(JSON.stringify(report));
  fs.writeFileSync(path.join(temp, 'report.json'), JSON.stringify(report, null, 2));
} finally {
  ws?.close();
  browser.kill();
  server.close();
}
