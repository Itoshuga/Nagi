import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { Buffer } from 'node:buffer';
const { fetch, WebSocket } = globalThis;
// Synthetic trip, isolated browser profile, no user session. Real Google is opt-in.
const real = process.env.NAGI_GOOGLE_REAL_QA === '1';
const require = createRequire(fs.realpathSync('node_modules/dotenv-cli/cli.js')),
  env = real ? require('dotenv').parse(fs.readFileSync('.env')) : {};
let providerCalls = 0;
const root = process.cwd(),
  app = path.join(root, 'apps/web'),
  temp = path.join(root, 'node_modules/.cache/nagi-google-ui-test');
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
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TripWorkbench} from './src/features/trips/workbench';import {optimisticTripChange} from './src/features/trips/mutation-model';
const ids=${JSON.stringify(ids)},catalog=${JSON.stringify(catalog)},now='2026-11-19T12:00:00Z';
const rootItem={source:"nagi",google_place_id:null,custom_title:null,custom_location:null,custom_latitude:null,custom_longitude:null,calendar_color:null,id:ids.parent,trip_id:ids.trip,trip_day_id:ids.day1,entry_id:catalog[0].id,entry:catalog[0],added_by:ids.viewer,notes:'Rendez-vous à l’entrée',sort_order:1024,start_time:'14:00',end_time:null,estimated_duration_minutes:120,version:0,created_at:now,updated_at:now,stops:[]};
if(location.search.includes('full')||location.search.includes('group')||location.search.includes('moves'))rootItem.stops=catalog.slice(1).map((entry,i)=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0'),trip_item_id:ids.parent,entry_id:entry.id,entry,added_by:ids.viewer,notes:'À retrouver au 6e étage',duration_minutes:40,sort_order:(i+1)*1024,version:0,created_at:now,updated_at:now}));
const extra=location.search.includes('moves')?[{...rootItem,id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',entry:{...catalog[0],title:'Musée'},notes:'Autre visite',start_time:'17:00',estimated_duration_minutes:60,sort_order:2048,stops:[]}]:location.search.includes('drag')||location.search.includes('group')?[{...rootItem,id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',entry_id:catalog[1].id,entry:catalog[1],notes:'Billet réservé · étage 6',start_time:'15:00',estimated_duration_minutes:40,sort_order:2048,stops:[]}]:[];window.__changes=[];window.__plan={id:ids.trip,guild_id:ids.guild,title:'Tokyo, à notre rythme',description:'',cover_image_url:null,created_by:ids.viewer,created_at:now,updated_at:now,start_date:'2027-07-12',end_date:'2027-07-13',status:'planned',collaboration_mode:'all_members',timezone:'Asia/Tokyo',destination_country_id:catalog[0].country.id,destination:{...catalog[0].country,iso_code:'JP',is_published:true,cover_image_url:null},version:0,items:[rootItem,...extra],days:[{id:ids.day1,trip_id:ids.trip,day_number:1,title:'Shibuya',date:'2027-07-12',sort_order:0,created_at:now,updated_at:now},{id:ids.day2,trip_id:ids.trip,day_number:2,title:'Tokyo',date:'2027-07-13',sort_order:1,created_at:now,updated_at:now}],organizers:[{user_id:ids.viewer}],people:[{id:ids.viewer,username:'iris',display_name:'Iris Martin',avatar_url:null}],connections:[]};
window.__edit=async(version,change,entry)=>{window.__changes.push(change);if(window.__failNext){window.__failNext=false;return {ok:false,error:'Échec simulé'}}const plan=optimisticTripChange(window.__plan,change,ids.viewer,entry??catalog.find(e=>e.id===change.data.entry));window.__plan={...plan,version:plan.version+1};window.__updatePlan(window.__plan);return {ok:true,version:window.__plan.version}};
window.__searches=[];window.__externalRequests=[];const originalFetch=window.fetch;window.fetch=(url,options)=>{if(String(url).endsWith('/external')&&options?.body)window.__externalRequests.push(JSON.parse(options.body));return originalFetch(url,options)};
${real ? '' : `window.google={maps:{importLibrary:async()=>{}}};for(const tag of ['gmp-place-details','gmp-place-details-compact','gmp-advanced-place-details-compact'])customElements.define(tag,class extends HTMLElement{connectedCallback(){if(!this.dataset.fixture){this.dataset.fixture='1';const shadow=this.attachShadow({mode:'open'});shadow.innerHTML='<style>:host{display:block;width:100%;contain:inline-size;min-height:64px}</style><slot></slot><span>Sensō-ji · Temple · Google</span>';if(window.__widgetMode!=='silent')setTimeout(()=>this.dispatchEvent(new Event('gmp-load')),10);}}});`}

function App(){const[plan,setPlan]=useState(window.__plan);window.__updatePlan=setPlan;return <div className="nagi-space"><main className="app-container app-content py-10"><TripWorkbench guild={ids.guild} plan={plan} viewerId={ids.viewer} categories={[catalog[0].category]} canEdit canManage initialDay={ids.day1}/></main></div>}createRoot(document.getElementById('root')).render(<App/>);`;
const actions = `export async function editTrip(g,t,v,c){return window.__edit(v,c)}export async function removeTrip(){return {error:''}}export async function archivePlannedTrip(){return {ok:true,version:0}}export async function tripPlaceOptions(){return []}export async function editableTripOptions(){return []}export async function tripCatalogSearch(){return {rows:[],hasMore:false}}export async function tripRelatedPlaces(){return []}export async function createPlannedTrip(){return {error:''}}`;
await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: app },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  loader: { '.png': 'dataurl' },
  jsx: 'automatic',
  outfile: path.join(temp, 'preview.js'),
  logLevel: 'silent',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY': JSON.stringify(
      real ? env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY : 'test-browser-public-key',
    ),
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
const staticRoot = path.join(app, '.next/static');
const styles = fs
  .readdirSync(staticRoot, { recursive: true })
  .filter(
    (x) =>
      x.endsWith('.css') &&
      !fs.readFileSync(path.join(staticRoot, x), 'utf8').includes('.trip-google-place'),
  )
  .map((x) => `<link rel="stylesheet" href="/_next/static/${x.replaceAll('\\', '/')}">`)
  .join('');
const html = `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<link rel="stylesheet" href="/preview.css"></head><body class="font-sans"><div id="root"></div><script type="module" src="/preview.js"></script></body></html>`;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.endsWith('/external')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') {
      res.end(JSON.stringify({ available: true, minCharacters: 3 }));
      return;
    }
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    if (body.operation === 'search') {
      if (!real) {
        if (body.query === 'Quota') {
          res.statusCode = 429;
          res.end(JSON.stringify({ error: 'Quota atteint' }));
          return;
        }
        res.end(
          JSON.stringify({
            ids: body.query === 'Missing' ? [] : ['google-place-example', 'second-place-example'],
            timing: { providerMs: 40, serverMs: 45 },
          }),
        );
        return;
      }
      if (++providerCalls > 8) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: 'Limite de la recette' }));
        return;
      }
      const auto = body.kind === 'autocomplete',
        before = performance.now();
      const response = await fetch(
        'https://places.googleapis.com/v1/' + (auto ? 'places:autocomplete' : 'places:searchText'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': auto ? 'suggestions.placePrediction.placeId' : 'places.id',
          },
          body: JSON.stringify({
            ...(auto
              ? { input: body.query, sessionToken: body.session }
              : { textQuery: body.query, pageSize: 5 }),
            languageCode: 'fr',
            ...(body.context?.region && { regionCode: body.context.region }),
            ...(body.context?.bias && { locationBias: body.context.bias }),
          }),
        },
      );
      if (!response.ok) {
        res.statusCode = response.status;
        res.end(JSON.stringify({ error: 'Google HTTP ' + response.status }));
        return;
      }
      const data = await response.json(),
        ids = auto
          ? (data.suggestions ?? []).map((s) => s.placePrediction?.placeId).filter(Boolean)
          : (data.places ?? []).map((p) => p.id);
      res.end(
        JSON.stringify({
          ids,
          timing: {
            providerMs: Math.round(performance.now() - before),
            serverMs: Math.round(performance.now() - before),
          },
        }),
      );
      return;
    }
    if (body.operation === 'coordinates') {
      res.end(
        JSON.stringify({
          points: Object.fromEntries(
            body.ids.map((id) => [
              id,
              { latitude: 35.66, longitude: 139.7, expiresAt: Date.now() + 600000 },
            ]),
          ),
        }),
      );
      return;
    }
    res.end(JSON.stringify({ ok: true, points: {} }));
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
  else if (u.pathname === '/preview.js' || u.pathname === '/preview.css')
    f = path.join(temp, u.pathname.slice(1));
  if (f && fs.existsSync(f)) {
    res.setHeader(
      'Content-Type',
      f.endsWith('.css')
        ? 'text/css'
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
await new Promise((r) => server.listen(real ? 3001 : 0, '127.0.0.1', r));
const base = 'http://localhost:' + server.address().port,
  profile = fs.mkdtempSync(path.join(temp, 'browser-'));
const executable =
  process.env.NAGI_TEST_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
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
            '({changes:window.__changes,error:document.querySelector(".trip-workspace-error")?.textContent,panel:document.querySelector(".trip-context-panel")?.textContent,sorting:!!document.querySelector(".is-catalog-dragging"),selected:document.querySelector(".trip-google-selected")?.textContent})',
          ),
        ) +
        '; errors=' +
        errors.join(';'),
    );
  }
  async function click(selector) {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    const r = await ev(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`,
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

  await nav();
  await click('[aria-label="Explorer le catalogue"]');
  await wait('!!document.querySelector(".trip-source-tabs")');
  assert(
    await ev(
      'document.querySelector(".trip-source-tabs").getBoundingClientRect().top-document.querySelector(".trip-picker-search").getBoundingClientRect().bottom>=10',
    ),
    'search and source selector have breathing room',
  );
  await fill('[aria-label="Rechercher un lieu"]', 'Sensō-ji');
  const started = Date.now();
  await textClick('Google Maps', 'document.querySelector(".trip-source-tabs")');
  await wait('document.querySelectorAll(".trip-google-result-list>li").length>0');
  const idsMs = Date.now() - started;
  await wait('!!document.querySelector(".trip-catalog-google-card .is-ready")');
  const firstCardMs = Date.now() - started;
  const resultCount = await ev('document.querySelectorAll(".trip-google-result-list>li").length');
  for (let index = 0; index < resultCount; index++) {
    const row = `.trip-google-result-list>li:nth-child(${index + 1})`;
    await ev(`document.querySelector(${JSON.stringify(row)}).scrollIntoView({block:'nearest'})`);
    await wait(`!!document.querySelector(${JSON.stringify(row + ' .is-ready')})`);
    assert(
      await ev(
        `document.querySelector(${JSON.stringify(row + ' .trip-google-widget')}).getBoundingClientRect().width>=160`,
      ),
      'every result has readable width',
    );
  }
  const allCardsMs = Date.now() - started;
  assert(await ev('!document.querySelector(".trip-google-selected")'), 'no anonymous intermediary');
  assert(await ev('!document.querySelector(".trip-google-filters")'), 'filters collapsed');
  const before = await ev('window.__externalRequests.filter(r=>r.operation==="search").length');
  await ev(
    'document.querySelector(".trip-catalog-google-card").dispatchEvent(new MouseEvent("mousemove",{bubbles:true}))',
  );
  await sleep(300);
  assert(
    (await ev('window.__externalRequests.filter(r=>r.operation==="search").length')) === before,
    'hover makes no request',
  );
  const variants = [];
  if (real) {
    for (const query of ['Senso-ji', '浅草寺']) {
      const at = Date.now();
      await fill('[aria-label="Rechercher un lieu"]', query);
      await wait(
        'window.__externalRequests.filter(r=>r.operation==="search").at(-1).query===' +
          JSON.stringify(query),
      );
      await wait(
        'document.querySelector(".trip-google-search").getAttribute("aria-busy")==="false"',
      );
      await wait('!!document.querySelector(".trip-catalog-google-card .is-ready")');
      variants.push({ query, visibleMs: Date.now() - at });
    }
  }
  await ev(
    'window.__dropRenderMs=null;document.addEventListener("mouseup",()=>{const at=performance.now(),count=document.querySelectorAll("[data-activity-id]").length;const observer=new MutationObserver(()=>{if(document.querySelectorAll("[data-activity-id]").length>count){window.__dropRenderMs=performance.now()-at;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});},{capture:true,once:true})',
  );
  const dropStart = Date.now();
  await drag('.trip-catalog-google-card', '.trip-timeline-end');
  await wait('window.__plan.items.length===2');
  const optimisticRenderMs = await ev('window.__dropRenderMs');
  await wait('!!document.querySelector("[data-activity-id] .trip-google-place.is-ready")');
  assert(
    await ev(
      'document.querySelector("[data-activity-id] .trip-google-place").getBoundingClientRect().width>=160',
    ),
    'added Google card has readable width',
  );
  const dropMs = Date.now() - dropStart;
  assert(
    await ev(
      'window.__changes.at(-1).operation==="add_place"&&window.__plan.items[1].source==="google"',
    ),
    'direct result drop creates visit',
  );
  await drag('.trip-catalog-google-card', '[aria-label="Détails de PARCO"]');
  await wait('window.__plan.items[0].stops.length===1');
  assert(
    await ev('window.__plan.items[0].stops[0].id!==window.__plan.items[1].id'),
    'repeat independent occurrences',
  );
  await wait('!!document.querySelector("[data-stop-id] .trip-google-place.is-ready")');
  assert(
    await ev(
      'document.querySelector("[data-stop-id] .trip-google-place").getBoundingClientRect().width>=160',
    ),
    'nested stop has readable width',
  );
  assert(
    await ev(
      '(()=>{const media=document.querySelector("[data-activity-id] .trip-step-copy gmp-place-media").getBoundingClientRect(),reference=document.querySelector(".trip-step-photo").getBoundingClientRect();return media.width===reference.width&&media.height===reference.height})()',
    ),
    'Google thumbnail matches the Nagi photo frame',
  );
  assert(
    await ev(
      '(()=>{const r=document.querySelector("[data-stop-id] gmp-place-media").getBoundingClientRect();return r.width===40&&r.height===40})()',
    ),
    'stop thumbnail matches the forty-pixel stop frame',
  );
  if (!real) {
    await ev(
      'document.querySelector("[data-activity-id] gmp-place-link").dispatchEvent(new MouseEvent("click",{bubbles:true,composed:true}))',
    );
    assert(
      await ev('!document.querySelector(".trip-detail-content")'),
      'provider corner action does not also open Nagi details',
    );
    await click('[aria-label="Rechercher un lieu"]');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown' });
    assert(
      await ev('document.activeElement.hasAttribute("data-native-google-card")'),
      'keyboard enters Google cards',
    );
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End' });
    assert(
      await ev(
        'document.activeElement===document.querySelectorAll("[data-native-google-card]")[1]',
      ),
      'keyboard moves to last result',
    );
    await textClick('Calendrier');
    await wait('!!document.querySelector(".trip-calendar-column")');
    await drag('.trip-catalog-google-card', '[data-slot-minute="870"]');
    await wait('window.__plan.items.length===3');
    assert(await ev('window.__changes.at(-1).data.start_time==="14:45"'), 'Google calendar clock');
    await wait('!!document.querySelector(".trip-google-calendar-anchor")');
    const countBefore = await ev(
      'window.__externalRequests.filter(r=>r.operation==="search").length',
    );
    await click('[aria-label="Fermer le catalogue"]');
    await sleep(250);
    const googleCalendar = await ev('window.__plan.items.at(-1).id');
    const calendarCopy =
      '[data-calendar-item-id="' + googleCalendar + '"] .trip-calendar-event-copy';
    // A short event starts with a floating title. Making it tall and wide used
    // to detach the observed anchor; the following resize then crashed.
    await ev(
      `window.__calendarTitleParent=document.querySelector(${JSON.stringify(calendarCopy)});window.__calendarTitleParent.style.width='260px';window.__calendarTitleAnchor=window.__calendarTitleParent.querySelector('.trip-google-calendar-anchor');window.__plan={...window.__plan,items:window.__plan.items.map(i=>i.id===${JSON.stringify(googleCalendar)}?{...i,estimated_duration_minutes:180}:i)};window.__updatePlan(window.__plan)`,
    );
    await wait('!!window.__calendarTitleParent.querySelector(".trip-google-calendar-inline")');
    assert(
      await ev('window.__calendarTitleAnchor.isConnected'),
      'calendar anchor stays mounted when the title becomes inline',
    );
    for (const width of [120, 260, 120, 260]) {
      await ev(`window.__calendarTitleParent.style.width='${width}px'`);
      await wait(
        `!!window.__calendarTitleParent.querySelector('${width < 180 ? '.trip-google-calendar-anchor' : '.trip-google-calendar-inline'}')`,
      );
    }
    // Resize and immediately leave the calendar to exercise pending observer work.
    await ev("window.__calendarTitleParent.style.width='120px'");
    await textClick('Itinéraire');
    await ev("window.__calendarTitleParent.style.width='260px'");
    await textClick('Calendrier');
    await wait('!!document.querySelector(".trip-calendar-column")');
    await click('[data-calendar-item-id="' + googleCalendar + '"] .trip-calendar-event-copy');
    await wait('!!document.querySelector(".trip-detail-content .is-detail")');
    assert(
      await ev('!document.querySelector(".trip-detail-content h3")'),
      'no anonymous Google title in details',
    );
    assert(
      await ev('!document.querySelector(".trip-detail-content .trip-google-place>a")'),
      'no duplicate Nagi Maps link',
    );
    await click('[aria-label="Fermer les détails"]');
    await sleep(250);
    await textClick('Itinéraire');
    assert(
      (await ev('window.__externalRequests.filter(r=>r.operation==="search").length')) ===
        countBefore,
      'view switches do not search',
    );
    await wait('!!document.querySelector("[data-activity-id] .trip-google-place.is-ready")');
    assert(
      await ev(
        'document.querySelector("[data-activity-id] .trip-google-place").getBoundingClientRect().width>=160',
      ),
      'card visible on return',
    );
    await textClick('Carte');
    await wait('!!document.querySelector(".trip-map-place-list .is-ready")');
    assert(
      await ev(
        'document.querySelector(".trip-map-place-list .trip-google-widget").getBoundingClientRect().width>=160',
      ),
      'Google map list is readable',
    );
    const mapCalls = await ev('window.__externalRequests.filter(r=>r.operation==="search").length');
    assert(mapCalls === countBefore, 'map view does not repeat the search');
  }
  if (real) await click('[aria-label="Fermer le catalogue"]');
  await textClick('Itinéraire');
  await wait('document.querySelectorAll(".trip-step-copy .trip-google-place.is-ready").length>=2');
  await sleep(500);
  const detailsCalls = () =>
    requests.filter((u) => /\/(GetPlace|GetPlaceWidgetMetadata)$/.test(u)).length;
  const grantsBefore = await ev('window.__externalRequests.filter(r=>r.operation==="ui").length');
  const detailsBefore = detailsCalls();
  const photosBefore = requests.filter((u) => u.endsWith('/GetPhotoMedia')).length;
  for (let round = 0; round < 2; round++) {
    await textClick('Calendrier');
    await sleep(300);
    await textClick('Itinéraire');
    await wait(
      'document.querySelectorAll(".trip-step-copy .trip-google-place.is-ready").length>=2',
    );
    assert(
      await ev('!!document.querySelector(".trip-step-copy .is-thumbnail gmp-place-media")'),
      'the thumbnail layout survives view switches',
    );
  }
  await sleep(500);
  assert(
    (await ev('window.__externalRequests.filter(r=>r.operation==="ui").length')) === grantsBefore,
    'view switches do not reserve new widgets',
  );
  const repeatedViewDetailsCalls = detailsCalls() - detailsBefore;
  const repeatedViewPhotoCalls =
    requests.filter((u) => u.endsWith('/GetPhotoMedia')).length - photosBefore;
  assert(repeatedViewDetailsCalls === 0, 'view switches do not fetch Google details again');
  {
    for (const width of [390, 320]) {
      await nav(width);
      await click('[aria-label="Explorer le catalogue"]');
      await fill('[aria-label="Rechercher un lieu"]', '浅草寺');
      await textClick('Google Maps', 'document.querySelector(".trip-source-tabs")');
      await wait('!!document.querySelector(".trip-catalog-google-card .is-ready")');
      assert(await ev('document.documentElement.scrollWidth<=innerWidth'), 'no overflow ' + width);
      if (!real && width === 390)
        fs.writeFileSync(
          path.join(temp, 'phase471-fixture-mobile.png'),
          Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
        );
      const placeId = await ev(
        'document.querySelector("[data-catalog-entry]").getAttribute("data-catalog-entry")',
      );
      await ev(
        `window.__edit(0,{operation:'add_place',data:{id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',day:${JSON.stringify(ids.day1)},place:{source:'google',placeId:${JSON.stringify(placeId)}}}})`,
      );
      await ev(
        `window.__edit(0,{operation:'add_place',data:{id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000003',parent:${JSON.stringify(ids.parent)},place:{source:'google',placeId:${JSON.stringify(placeId)}}}})`,
      );
      await click('[aria-label="Fermer le catalogue"]');
      await wait('!!document.querySelector("[data-activity-id] .trip-google-place.is-ready")');
      assert(
        await ev(
          'document.querySelector("[data-activity-id] .trip-google-place").getBoundingClientRect().width>=160',
        ),
        'mobile activity has readable width ' + width,
      );
      assert(
        await ev('document.documentElement.scrollWidth<=innerWidth'),
        'added mobile card stays inside the viewport',
      );
      await wait('!!document.querySelector("[data-stop-id] .trip-google-place.is-ready")');
      assert(
        await ev(
          '(()=>{const r=document.querySelector("[data-activity-id] .trip-step-copy gmp-place-media").getBoundingClientRect(),nagi=document.querySelector(".trip-step-photo").getBoundingClientRect();return r.width===nagi.width&&r.height===nagi.height})()',
        ),
        'mobile Google photo matches the Nagi frame',
      );
      assert(
        await ev(
          '(()=>{const r=document.querySelector("[data-stop-id] gmp-place-media").getBoundingClientRect();return r.width===40&&r.height===40})()',
        ),
        'mobile stop photo keeps its frame',
      );
      assert(
        await ev(
          'document.querySelector("[data-stop-id] .trip-google-place").getBoundingClientRect().width>=160',
        ),
        'mobile stop has readable width ' +
          width +
          ' actual=' +
          (await ev(
            'document.querySelector("[data-stop-id] .trip-google-place").getBoundingClientRect().width',
          )),
      );
    }
  }

  if (!real) {
    await nav();
    await click('[aria-label="Explorer le catalogue"]');
    await fill('[aria-label="Rechercher un lieu"]', 'Sensō-ji');
    await textClick('Google Maps', 'document.querySelector(".trip-source-tabs")');
    await wait('document.querySelectorAll(".trip-google-result-list .is-ready").length===2');
    await ev(
      'window.__firstResult=document.querySelector(".trip-catalog-google-card .trip-google-widget").firstElementChild',
    );
    await fill('[aria-label="Rechercher un lieu"]', 'Sensō-ji Tokyo');
    assert(
      await ev(
        'window.__firstResult===document.querySelector(".trip-catalog-google-card .trip-google-widget").firstElementChild',
      ),
      'typing keeps the current provider element mounted',
    );
    await wait('document.querySelector(".trip-google-search").getAttribute("aria-busy")==="false"');
    await fill('[aria-label="Rechercher un lieu"]', 'Quota');
    await wait('!!document.querySelector("[role=alert]")');
    assert(
      await ev('document.querySelectorAll(".trip-google-result-list .is-ready").length===2'),
      'quota error keeps existing cards',
    );
    await nav();
    await ev('window.__widgetMode="silent"');
    await click('[aria-label="Explorer le catalogue"]');
    await fill('[aria-label="Rechercher un lieu"]', 'Sensō-ji');
    await textClick('Google Maps', 'document.querySelector(".trip-source-tabs")');
    await wait('!!document.querySelector(".trip-google-widget gmp-place-details-compact")');
    assert(
      await ev('getComputedStyle(document.querySelector(".trip-google-widget")).opacity==="1"'),
      'rendered Google content is not hidden behind the load event',
    );
    await click('.trip-catalog-google-card');
    await wait(
      '!!document.querySelector(".trip-detail-content .trip-google-widget gmp-place-details")',
    );
    await wait('!!document.querySelector(".trip-detail-content .trip-google-fallback")', 14000);
    await ev('window.__widgetMode="normal"');
    await textClick('Réessayer', 'document.querySelector(".trip-detail-content")');
    await wait('!!document.querySelector(".trip-detail-content .is-ready")');
  }
  assert(errors.length === 0, 'runtime errors: ' + errors.join(';'));
  const report = {
    mode: real ? 'real Google, isolated fixture' : 'mocked provider',
    idsMs,
    firstCardMs,
    allCardsMs,
    gestureAndCardMs: dropMs,
    optimisticRenderMs,
    variants,
    providerCalls,
    repeatedViewDetailsCalls,
    repeatedViewPhotoCalls,
    sdkScripts: requests.filter((u) => u.endsWith('/maps/api/js')).length,
    pages,
    fileRequests: requests.filter((u) => u.startsWith('file:')),
    passed: true,
  };
  console.log(JSON.stringify(report));
  fs.writeFileSync(
    path.join(temp, real ? 'phase471-real.json' : 'phase471-mocked.json'),
    JSON.stringify(report, null, 2),
  );
} finally {
  ws?.close();
  browser.kill();
  server.close();
}
