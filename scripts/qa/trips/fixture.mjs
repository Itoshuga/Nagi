// Isolated browser QA: real migrations/RPC/RLS in PGlite, no remote account or data.
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers';
import { performance } from 'node:perf_hooks';
const { Request, Response, Headers } = globalThis;
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';
const root =
    process.env.NAGI_QA_SOURCE_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url)),
  require = createRequire(root + '/package.json');
const output = process.env.NAGI_QA_OUTPUT ?? join(tmpdir(), 'nagi-trip-qa');
mkdirSync(output, { recursive: true });
const port = process.env.NAGI_QA_PORT ?? '3106';
const { PGlite } = require('@electric-sql/pglite'),
  { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
function writeAtomic(file, text) {
  writeFileSync(file + '.tmp', text);
  renameSync(file + '.tmp', file);
}
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(readFileSync(new URL('./auth.sql', import.meta.url), 'utf8'));
for (const f of readdirSync(root + '/supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  await db.exec(readFileSync(root + '/supabase/migrations/' + f, 'utf8').replace(/\r\n/g, '\n'));
if (process.env.NAGI_QA_IMAGES === '1')
  await db.exec('update private.mapbox_settings set enabled=true where singleton');
const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  guild = '444444444444444444',
  trip = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const app = '111111111111111111',
  stateFile = join(output, 'state.json'),
  configFile = join(output, 'config.json');
writeAtomic(configFile, '{}');
await db.exec(
  `insert into auth.users(id) values('${uid}'),('${other}');insert into public.profiles(id,discord_id,username,display_name,role) values('${uid}','999999999999999999','camille','Camille','admin'),('${other}','888888888888888888','haru','Haru','user');`,
);
await db.query('select public.reconcile_discord_guilds($1,$2)', [
  app,
  JSON.stringify([{ id: guild, name: 'Équipe Nagi' }]),
]);
await db.query('select public.record_discord_memberships($1,$2,$3)', [
  uid,
  app,
  JSON.stringify([{ id: guild, permissions: '8' }]),
]);
await db.query('select public.record_discord_memberships($1,$2,$3)', [
  other,
  app,
  JSON.stringify([{ id: guild, permissions: '0' }]),
]);
await db.exec(`update private.guild_memberships set expires_at=now()+interval '1 day';`);
await db.exec(
  `insert into public.countries(id,name,slug,iso_code,is_published,cover_image_url) values('00000001-1111-4111-8111-111111111111','Japon','japon','JP',true,'/app/catalog-cover/countries/00000001-1111-4111-8111-111111111111/00000090-1111-4111-8111-111111111111');insert into public.cities(id,country_id,name,slug,is_published) values('00000002-1111-4111-8111-111111111111','00000001-1111-4111-8111-111111111111','Tokyo','tokyo',true);`,
);
const titles = [
  'Shibuya PARCO',
  'Pokémon Center SHIBUYA',
  'Nintendo TOKYO',
  'Café de Shibuya',
  'Tokyo Tower',
  'Un lieu sans coordonnées',
];
const entryIds = [];
for (let i = 0; i < titles.length; i++) {
  const id = `${(i + 10).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
  entryIds.push(id);
  await db.query(
    `insert into public.entries(id,city_id,category_id,title,slug,summary,description,published,latitude,longitude) select $1,'00000002-1111-4111-8111-111111111111',id,$2,$3,'Une découverte du catalogue Nagi.','Un lieu à découvrir ensemble.',true,$4,$5 from public.categories where slug='tourisme'`,
    [
      id,
      titles[i],
      `lieu-${i}`,
      i === 5 ? null : 35.661 + i * 0.001,
      i === 5 ? null : 139.698 + i * 0.001,
    ],
  );
}
await db.query(
  `insert into public.entry_relations(source_id,target_id,relation_type_id) select $1,$2,id from public.relation_types where slug='located-in'`,
  [entryIds[1], entryIds[0]],
);
await db.query(
  `insert into public.entry_relations(source_id,target_id,relation_type_id) select $1,$2,id from public.relation_types where slug='located-in'`,
  [entryIds[2], entryIds[0]],
);
await db.exec(
  `insert into public.trips(id,guild_id,title,description,created_by,destination_country_id,start_date,end_date,timezone,status) values('${trip}','${guild}','Tokyo, à notre rythme','Un séjour en commun.','${uid}','00000001-1111-4111-8111-111111111111','2028-12-22','2028-12-25','Asia/Tokyo','planned');`,
);
const days = (await db.query('select * from public.trip_days order by date')).rows;
await db.query(
  `insert into public.trip_items(trip_id,trip_day_id,entry_id,added_by,sort_order,start_time,estimated_duration_minutes,notes) values($1,$2,$3,$4,1024,'09:00',60,'Réserver les billets'),($1,$2,$5,$4,2048,null,null,''),($1,null,$6,$4,1024,null,null,'Une idée pour plus tard')`,
  [trip, days[0].id, entryIds[0], uid, entryIds[4], entryIds[5]],
);
await db.query(`update public.trip_items set estimated_duration_minutes=120 where entry_id=$1`, [
  entryIds[0],
]);
const main = (await db.query('select id from public.trip_items where entry_id=$1', [entryIds[0]]))
  .rows[0].id;
await db.query(
  `insert into public.trip_item_stops(id,trip_item_id,entry_id,added_by,sort_order,duration_minutes,notes) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',$1,$2,$3,1024,30,'Étage 6'),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$1,$4,$3,2048,45,'Déguster sur place'),('ffffffff-ffff-4fff-8fff-ffffffffffff',$1,$5,$3,3072,null,'Sans durée imposée')`,
  [main, entryIds[1], uid, entryIds[3], entryIds[5]],
);
await db.query(
  `update public.entries set latitude=(select latitude from public.entries where id=$1),longitude=(select longitude from public.entries where id=$1) where id=$2`,
  [entryIds[0], entryIds[1]],
);
await db.query(
  `update public.trip_items set start_time='11:00',estimated_duration_minutes=30 where entry_id=$1`,
  [entryIds[4]],
);
await db.query(
  `insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,sort_order,start_time,estimated_duration_minutes) values('12121212-1212-4212-8212-121212121212',$1,$2,$3,$4,4096,'14:00',15)`,
  [trip, days[0].id, entryIds[3], uid],
);
await db.query(
  `insert into public.trips(id,guild_id,title,created_by,destination_country_id,start_date,end_date,timezone,status) values('abababab-abab-4bab-8bab-abababababab',$1,'Autre voyage',$2,'00000001-1111-4111-8111-111111111111','2028-12-22','2028-12-25','Asia/Tokyo','planned')`,
  [guild, uid],
);
await db.query(
  `insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,start_time,estimated_duration_minutes) select '34343434-3434-4343-8343-343434343434','abababab-abab-4bab-8bab-abababababab',id,$1,$2,'11:00',60 from public.trip_days where trip_id='abababab-abab-4bab-8bab-abababababab' and day_number=1`,
  [entryIds[1], uid],
);

// Optional large, deterministic itinerary for layout and query-plan profiling.
const size = Number(process.env.NAGI_QA_SIZE ?? 0);
if (size > 4) {
  await db.query(`update public.trips set end_date='2029-01-04' where id=$1`, [trip]);
  const spread = (
    await db.query('select id from public.trip_days where trip_id=$1 order by date', [trip])
  ).rows;
  for (let n = 0; n < size - 4; n++)
    await db.query(
      `insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,sort_order,start_time,estimated_duration_minutes)
 values($1,$2,$3,$4,$5,$6,$7,30)`,
      [
        `${(65536 + n).toString(16).padStart(8, '0')}-2222-4222-8222-222222222222`,
        trip,
        spread[n % spread.length].id,
        entryIds[n % entryIds.length],
        uid,
        (n + 10) * 1024,
        `${String(7 + (Math.floor(n / spread.length) % 15)).padStart(2, '0')}:${n % 2 ? '30' : '00'}`,
      ],
    );
  await db.exec(
    'analyze public.trip_items;analyze public.trip_item_stops;analyze public.trip_days;',
  );
  const plan = await db.query(
    `explain (analyze,buffers,format json) select id from public.trip_items where trip_id=$1 and trip_day_id=$2 order by sort_order,id`,
    [trip, spread[0].id],
  );
  writeAtomic(join(output, 'query-plan.json'), JSON.stringify(plan.rows));
}
async function sync() {
  const [trips, days, items, organizers, stops, palette] = await Promise.all(
    [
      'trips',
      'trip_days',
      'trip_items',
      'trip_organizers',
      'trip_item_stops',
      'user_calendar_colors',
      'external_images',
      'image_resolution_cache',
      'place_image_assignments',
    ].map((t) => db.query(`select * from public.${t} order by 1`)),
  );
  writeAtomic(
    stateFile,
    JSON.stringify({
      trips: trips.rows,
      days: days.rows,
      items: items.rows,
      organizers: organizers.rows,
      stops: stops.rows,
      palette: palette.rows,
      entries: entryIds,
    }),
  );
}
await sync();

// Phoenix protocol shim: only the transport is simulated. Every event is read
// through the real SQL authorization/journal RPC by the production SSE route.
const sockets = new Set();
class FixtureWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  bufferedAmount = 0;
  binaryType = 'arraybuffer';
  topics = new Map();
  constructor(url) {
    this.url = url;
    sockets.add(this);
    setTimeout(() => {
      if (cfg().realtimeDown) {
        this.close();
        return;
      }
      this.readyState = 1;
      this.onopen?.({});
    }, 5);
  }
  send(raw) {
    if (this.readyState !== 1) return;
    const [join, ref, topic, event] = JSON.parse(raw);
    if (event === 'phx_join') this.topics.set(topic, join);
    if (event === 'phx_leave') this.topics.delete(topic);
    setTimeout(() => {
      if (this.readyState === 1)
        this.onmessage?.({
          data: JSON.stringify([
            join,
            ref,
            topic,
            'phx_reply',
            { status: 'ok', response: { postgres_changes: [] } },
          ]),
        });
    }, 0);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    sockets.delete(this);
    setTimeout(() => this.onclose?.({ code: 1000, reason: 'fixture close' }), 0);
  }
}
globalThis.WebSocket = FixtureWebSocket;
function broadcast() {
  for (const socket of sockets) {
    if (cfg().realtimeDown) {
      socket.close();
      continue;
    }
    for (const [topic, join] of socket.topics)
      socket.onmessage?.({
        data: JSON.stringify([
          join,
          null,
          topic,
          'broadcast',
          { event: 'refresh', payload: {}, type: 'broadcast' },
        ]),
      });
  }
}

const original = globalThis.fetch,
  stamp = () => new Date().toISOString(),
  json = (v, status = 200, headers = {}) =>
    new Response(
      JSON.stringify(v, (k, value) =>
        ['date', 'start_date', 'end_date'].includes(k) && typeof value === 'string'
          ? value.slice(0, 10)
          : value,
      ),
      { status, headers: { 'Content-Type': 'application/json', ...headers } },
    );
function cfg() {
  return JSON.parse(readFileSync(configFile, 'utf8'));
}
async function authQuery(fn, actor = uid, service = false) {
  return db.transaction(async (tx) => {
    await tx.exec(
      service
        ? "set local role service_role;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role'"
        : `set local role authenticated;set local request.jwt.claim.sub='${actor}';set local request.jwt.claim.role='authenticated'`,
    );
    return fn(tx);
  });
}
async function rows(table, params, isPublic = false) {
  const values = [],
    conditions = [];
  let idx = 0;
  const allow = /^[a-z_]+$/;
  for (const [key, value] of params) {
    if (!allow.test(key) || ['select', 'order', 'limit', 'offset'].includes(key)) continue;
    if (key === 'or') continue;
    if (value.startsWith('eq.')) {
      values.push(
        value.slice(3) === 'true' ? true : value.slice(3) === 'false' ? false : value.slice(3),
      );
      conditions.push(`${key}=$${++idx}`);
    }
    if (value.startsWith('neq.')) {
      values.push(value.slice(4));
      conditions.push(`${key}<>$${++idx}`);
    }
    if (value.startsWith('ilike.')) {
      values.push(value.slice(6).replaceAll('*', '%'));
      conditions.push(`${key} ilike $${++idx}`);
    }
    if (value.startsWith('in.') || value.startsWith('not.in.')) {
      const neg = value.startsWith('not.');
      const list = value.slice(neg ? 8 : 4, -1).split(',');
      const slots = list.map((v) => {
        values.push(v.replaceAll('"', ''));
        return '$' + ++idx;
      });
      conditions.push(`${key} ${neg ? 'not ' : ''}in (${slots.join(',')})`);
    }
    if (value.startsWith('gte.') || value.startsWith('lte.')) {
      values.push(Number(value.slice(4)));
      conditions.push(`${key}${value.startsWith('gte.') ? '>=' : '<='}$${++idx}`);
    }
  }
  const or = params.get('or');
  if (or) {
    const list = [];
    for (const m of or.matchAll(/(source_id|target_id)\.(?:eq\.([\da-f-]+)|in\.\(([^)]+)\))/g)) {
      const ids = (m[2] ?? m[3]).split(',');
      list.push(
        `${m[1]} in (${ids
          .map((v) => {
            values.push(v);
            return '$' + ++idx;
          })
          .join(',')})`,
      );
    }
    if (list.length) conditions.push('(' + list.join(' or ') + ')');
  }
  const order = (
    params.get('order') ?? (table === 'image_resolution_cache' ? 'cache_key.asc' : 'id.asc')
  )
    .split(',')
    .map((s) => {
      const [k, d] = s.split('.');
      return allow.test(k) ? `${k} ${d === 'desc' ? 'desc' : 'asc'}` : 'id';
    })
    .join(',');
  const sql = `select * from public.${table}${conditions.length ? ' where ' + conditions.join(' and ') : ''} order by ${order}`;
  if (table === 'user_calendar_colors')
    return (await authQuery((tx) => tx.query(sql, values))).rows;
  const result = await db.transaction(async (tx) => {
    if (isPublic)
      await tx.exec(
        "set local role anon;set local request.jwt.claim.sub='';set local request.jwt.claim.role='anon'",
      );
    return tx.query(sql, values);
  });
  return result.rows;
}
async function hydrateEntry(e) {
  if (!e || cfg().hideEntry === e.id) return null;
  const city = (await db.query('select * from public.cities where id=$1', [e.city_id])).rows[0];
  return {
    ...e,
    country: (await db.query('select * from public.countries where id=$1', [e.country_id])).rows[0],
    city,
    category: (await db.query('select * from public.categories where id=$1', [e.category_id]))
      .rows[0],
    neighborhood: null,
  };
}
const profile = {
  id: uid,
  discord_id: '999999999999999999',
  username: 'camille',
  display_name: 'Camille',
  role: 'admin',
  avatar_url: null,
  created_at: stamp(),
};
let mapboxCalls = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input)),
    h = new Headers(init.headers),
    method = init.method ?? 'GET';
  let actor = uid;
  try {
    const sub = JSON.parse(
      Buffer.from((h.get('Authorization') ?? '').split('.')[1], 'base64url').toString(),
    ).sub;
    if ([uid, other].includes(sub)) actor = sub;
  } catch {
    /* Service keys do not contain JWT claims. */
  }
  const currentProfile =
    actor === other
      ? {
          ...profile,
          id: other,
          discord_id: '888888888888888888',
          username: 'haru',
          display_name: 'Haru',
          role: 'user',
        }
      : profile;
  if (url.hostname === 'discord.com')
    return json(
      url.pathname.includes('applications')
        ? { id: app }
        : [{ id: guild, name: 'Équipe Nagi', icon: null, owner: true, permissions: '8' }],
    );
  if (url.hostname === 'localhost' && url.port === port) return original(input, init);
  if (process.env.NAGI_QA_IMAGES === '1') {
    const name = 'Shibuya PARCO';
    if (url.hostname === 'api.mapbox.com') {
      const place = {
        mapbox_id: 'qa-mapbox-parco',
        name,
        feature_type: 'poi',
        poi_category_ids: ['shopping_mall'],
        context: { place: { name: 'Tokyo' }, country: { name: 'Japan' } },
        coordinates: { latitude: 35.661, longitude: 139.698 },
      };
      return json(
        url.pathname.endsWith('/suggest')
          ? { suggestions: [place] }
          : { features: [{ properties: place }] },
      );
    }
    if (url.hostname === 'www.wikidata.org') {
      if (url.searchParams.get('action') === 'wbsearchentities')
        return json({ search: [{ id: 'Q123456789' }] });
      return json({
        entities: {
          Q123456789: {
            id: 'Q123456789',
            labels: { en: { value: url.searchParams.get('ids') === 'Q123456789' ? name : name } },
            claims: {
              P18: [{ mainsnak: { datavalue: { value: 'Shibuya Parco QA.jpg' } } }],
              P625: [
                { mainsnak: { datavalue: { value: { latitude: 35.661, longitude: 139.698 } } } },
              ],
            },
          },
        },
      });
    }
    if (url.hostname === 'commons.wikimedia.org')
      return json({
        query: {
          pages: [
            {
              title: 'File:Shibuya Parco QA.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/ParcoQA.jpg',
                  thumburl:
                    'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/ParcoQA.jpg/330px-ParcoQA.jpg',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:ParcoQA.jpg',
                  width: 2400,
                  height: 1600,
                  mime: 'image/jpeg',
                  extmetadata: {
                    Artist: { value: 'QA Photographer' },
                    ObjectName: { value: 'Shibuya PARCO' },
                    LicenseShortName: { value: 'CC BY-SA 4.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                  },
                },
              ],
            },
          ],
        },
      });
  }
  if (
    process.env.NAGI_QA_MAPBOX_LIVE === '1' &&
    url.hostname === 'api.mapbox.com' &&
    /^\/(search\/searchbox\/v1\/(suggest|forward|retrieve\/[^/]+)|places\/v1\/details\/retrieve\/[^/]+)$/.test(
      url.pathname,
    )
  ) {
    if (++mapboxCalls > 45) return json({ message: 'Bounded QA provider cap' }, 429);
    return original(input, init);
  }
  if (url.hostname !== 'fixture.supabase.test')
    throw new Error('Unexpected remote QA request ' + url.hostname);
  if (url.pathname.startsWith('/auth/v1/'))
    return json({
      ...currentProfile,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      identities: [],
    });
  if (url.pathname.startsWith('/storage/v1/') && method === 'POST')
    return json({ Key: 'fixture-cover', Id: 'fixture' });
  if (url.pathname.startsWith('/storage/v1/') && method === 'DELETE') return json([]);
  if (url.pathname.startsWith('/storage/v1/'))
    return new Response(readFileSync(root + '/apps/web/public/nagi-logo.png'), {
      headers: { 'Content-Type': 'image/png' },
    });
  const table = url.pathname.split('/').at(-1),
    body = init.body ? JSON.parse(String(init.body)) : {};
  if (url.pathname.includes('/rpc/')) {
    if (
      [
        'configure_owners',
        'enqueue_bot_sync',
        'reconcile_discord_guilds',
        'record_discord_memberships',
      ].includes(table)
    )
      return json(null);
    if (table === 'read_discord_credentials') {
      const iv = randomBytes(12),
        cipher = createCipheriv(
          'aes-256-gcm',
          Buffer.from(process.env.NAGI_TOKEN_ENCRYPTION_KEY, 'base64'),
          iv,
        );
      cipher.setAAD(Buffer.from(`nagi:discord:${body.p_user_id ?? uid}`));
      const encrypted = Buffer.concat([
        cipher.update(
          JSON.stringify({ accessToken: 'fixture-access', refreshToken: null }),
          'utf8',
        ),
        cipher.final(),
      ]);
      return json({
        encrypted_tokens: [
          'v1',
          iv.toString('base64url'),
          cipher.getAuthTag().toString('base64url'),
          encrypted.toString('base64url'),
        ].join('.'),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        version: 0,
        scopes: ['identify', 'guilds'],
      });
    }
    if (table === 'read_discord_guild_snapshot')
      return json({
        verified_at: stamp(),
        bot_verified_at: stamp(),
        guilds: [
          {
            id: guild,
            name: 'Équipe Nagi',
            icon: null,
            icon_url: null,
            owner: true,
            permissions: '8',
            members_can_create_trips: true,
          },
        ],
      });
    try {
      if (
        table === 'mutate_trip_plan' &&
        (cfg().invalidIds ?? []).includes(body.p_request?.change?.data?.id)
      )
        return json({ code: '22023', message: 'fixture-invalid' }, 400);
      if (
        (table === 'save_user_calendar_color' && cfg().paletteFail) ||
        (['edit_trip_plan', 'mutate_trip_plan'].includes(table) && cfg().fail)
      )
        return json({ code: 'XX000', message: 'fixture-error' }, 500);
      if (['edit_trip_plan', 'mutate_trip_plan'].includes(table) && cfg().delay)
        await new Promise((r) =>
          setTimeout(r, Number(cfg().delay) === 1 ? 600 : Number(cfg().delay)),
        );
      await db.exec(
        `update private.guild_memberships set expires_at=now()+interval '1 day';update public.discord_guilds set last_synced_at=now()`,
      );
      const r = await authQuery(
        (tx) =>
          tx.query(
            `select public.${table}(${Object.keys(body)
              .map((k, i) => `${k}=>$${i + 1}`)
              .join(',')}) as value`,
            Object.values(body),
          ),
        actor,
        [
          'reserve_mapbox_places',
          'mapbox_place_reference',
          'mapbox_error',
          'mapbox_available',
          'reserve_image_resolution',
        ].includes(table) && h.get('apikey') === process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      if (
        table === 'edit_trip_plan' ||
        table === 'mutate_trip_plan' ||
        table === 'save_user_calendar_color'
      ) {
        await sync();
        if (table === 'edit_trip_plan' || table === 'mutate_trip_plan')
          writeAtomic(
            join(output, 'commit.json'),
            JSON.stringify({ at: Date.now(), trip: body.p_trip }),
          );
        broadcast();
      }
      return json(r.rows[0]?.value ?? null);
    } catch (e) {
      return json({ code: e.code ?? 'XX000', message: e.message }, 400);
    }
  }
  if (table === 'profiles')
    return json(h.get('Accept')?.includes('vnd.pgrst.object') ? currentProfile : [currentProfile]);
  if (table === 'user_guild_preferences')
    return json([{ user_id: uid, default_guild_id: guild, last_active_guild_id: guild }]);
  const allowed = [
    'trips',
    'trip_items',
    'trip_days',
    'countries',
    'cities',
    'neighborhoods',
    'entries',
    'entry_relations',
    'relation_types',
    'category_fields',
    'categories',
    'entry_media',
    'trip_organizers',
    'trip_item_stops',
    'user_calendar_colors',
    'external_images',
    'image_resolution_cache',
    'place_image_assignments',
  ];
  if (!allowed.includes(table)) throw new Error('Unhandled fixture table ' + table);
  if (
    ['external_images', 'image_resolution_cache', 'place_image_assignments'].includes(table) &&
    ['POST', 'PATCH'].includes(method)
  ) {
    if (h.get('apikey') !== process.env.SUPABASE_SERVICE_ROLE_KEY)
      return json({ code: '42501', message: 'server-only' }, 403);
    try {
      const data = Array.isArray(body) ? body : [body];
      for (const value of data) {
        const keys = Object.keys(value);
        if (!keys.every((key) => /^[a-z_]+$/.test(key))) throw new Error('Invalid column');
        const parameters = keys.map((key) =>
          key === 'metadata' ? JSON.stringify(value[key]) : value[key],
        );
        if (method === 'POST') {
          const conflict =
            table === 'external_images'
              ? 'id'
              : table === 'image_resolution_cache'
                ? 'cache_key'
                : 'id';
          await authQuery(
            (tx) =>
              tx.query(
                `insert into public.${table}(${keys.join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')}) on conflict(${conflict}) do update set ${keys
                  .filter((key) => key !== conflict)
                  .map((key) => `${key}=excluded.${key}`)
                  .join(',')}`,
                parameters,
              ),
            actor,
            true,
          );
        } else {
          const filters = [...url.searchParams].filter(
            ([key, value]) => /^[a-z_]+$/.test(key) && value.startsWith('eq.'),
          );
          if (!filters.length) throw new Error('Missing photo update target');
          await authQuery(
            (tx) =>
              tx.query(
                `update public.${table} set ${keys.map((key, i) => `${key}=$${i + 1}`).join(',')} where ${filters.map(([key], i) => `${key}=$${keys.length + i + 1}`).join(' and ')}`,
                [...parameters, ...filters.map(([, value]) => value.slice(3))],
              ),
            actor,
            true,
          );
        }
      }
      await sync();
      return json(null);
    } catch (error) {
      return json({ code: error.code, message: error.message }, 400);
    }
  }
  if (method === 'DELETE' && table === 'user_calendar_colors') {
    const target = url.searchParams.get('id')?.slice(3);
    await authQuery((tx) =>
      tx.query('delete from public.user_calendar_colors where id=$1', [target]),
    );
    await sync();
    return json(null);
  }
  if (method === 'POST' && table === 'trips') {
    await db.exec(`update public.discord_guilds set last_synced_at=now()`);
    try {
      const keys = Object.keys(body),
        r = await authQuery((tx) =>
          tx.query(
            `insert into public.trips(${keys.join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`,
            Object.values(body),
          ),
        );
      await sync();
      return json(r.rows[0]);
    } catch (e) {
      return json({ code: e.code, message: e.message }, 400);
    }
  }
  const isPublic = h.get('Authorization') === `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;
  let data = await rows(table, url.searchParams, isPublic);
  if (table === 'entries' && cfg().hideEntry) data = data.filter((e) => e.id !== cfg().hideEntry);
  let count = data.length;
  const offset = Number(url.searchParams.get('offset') ?? 0),
    limit = Number(url.searchParams.get('limit') ?? data.length);
  data = data.slice(offset, offset + limit);
  if (table === 'entries') data = await Promise.all(data.map(hydrateEntry));
  if (table === 'entry_relations')
    data = await Promise.all(
      data.map(async (r) => ({
        ...r,
        type: (
          await db.query('select * from public.relation_types where id=$1', [r.relation_type_id])
        ).rows[0],
        source: await hydrateEntry(
          (await db.query('select * from public.entries where id=$1', [r.source_id])).rows[0],
        ),
        target: await hydrateEntry(
          (await db.query('select * from public.entries where id=$1', [r.target_id])).rows[0],
        ),
      })),
    );
  if (table === 'trip_items' && url.searchParams.get('select')?.includes('stops:trip_item_stops'))
    data = await Promise.all(
      data.map(async (item) => ({
        ...item,
        stops: (
          await db.query('select * from public.trip_item_stops where trip_item_id=$1', [item.id])
        ).rows,
      })),
    );
  if (table === 'trips')
    data = await Promise.all(
      data.map(async (t) => ({
        ...t,
        destination:
          (await db.query('select * from public.countries where id=$1', [t.destination_country_id]))
            .rows[0] ?? null,
        days: (
          await db.query(
            'select * from public.trip_days where trip_id=$1 order by date,sort_order',
            [t.id],
          )
        ).rows,
        items: await Promise.all(
          (
            await db.query(
              'select * from public.trip_items where trip_id=$1 order by sort_order,id',
              [t.id],
            )
          ).rows.map(async (i) => ({
            ...i,
            stops: (
              await db.query(
                'select * from public.trip_item_stops where trip_item_id=$1 order by sort_order,id',
                [i.id],
              )
            ).rows,
          })),
        ),
        organizers: (
          await db.query('select user_id from public.trip_organizers where trip_id=$1', [t.id])
        ).rows,
      })),
    );
  if (cfg().readonly && table === 'trips')
    data = data.map((t) => ({
      ...t,
      created_by: other,
      organizers: [{ user_id: other }],
      collaboration_mode: 'organizers_only',
    }));
  return json(h.get('Accept')?.includes('vnd.pgrst.object') ? (data[0] ?? null) : data, 200, {
    'Content-Range': `${offset}-${offset + data.length - 1}/${count}`,
  });
};
const implementation = globalThis.fetch;
const statsFile = join(output, 'requests.json');
let calls = [];
globalThis.fetch = async (...args) => {
  const u = new URL(args[0] instanceof Request ? args[0].url : String(args[0]));
  const start = performance.now();
  try {
    const r = await implementation(...args);
    const failure = r.ok ? undefined : await r.clone().json().catch(() => ({}));
    calls.push({
      endpoint: u.pathname,
      method: args[1]?.method ?? 'GET',
      status: r.status,
      ...(failure ? { code: failure.code, message: failure.message } : {}),
      ms: performance.now() - start,
      bytes: (await r.clone().arrayBuffer()).byteLength,
    });
    writeAtomic(statsFile, JSON.stringify(calls));
    return r;
  } catch (e) {
    calls.push({ endpoint: u.pathname, error: true, ms: performance.now() - start });
    writeAtomic(statsFile, JSON.stringify(calls));
    throw e;
  }
};
