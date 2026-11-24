import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tripSyncBatchSchema, type TripSyncBatch } from '../packages/shared/src/trip-sync';
const db = new PGlite({ extensions: { pg_trgm } });
const userId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const applicationId = '123456789012345678';
const scope = 'guild:987654321098765432';
let legacyRelationsBefore: unknown, legacyRelationsAfter: unknown;
let providerMigrationBefore: unknown,
  providerMigrationAfter: unknown,
  migratedJournal: unknown,
  providerArchive: unknown;
let legacyTypeBefore: unknown, legacyTypeAfter: unknown;
async function scalar<T>(sql: string): Promise<T> {
  const result = await db.query<{ value: T }>(sql);
  return result.rows[0]!.value;
}
async function migrationPlanningSnapshot() {
  return scalar(`select jsonb_build_object(
    'trip',(select to_jsonb(t) from public.trips t where id='eeeeeeee-eeee-4eee-8eee-000000000001'),
    'days',(select jsonb_agg(to_jsonb(d) order by id) from public.trip_days d where trip_id='eeeeeeee-eeee-4eee-8eee-000000000001'),
    'items',(select jsonb_agg(to_jsonb(i)-'source'-'google_place_id'-'external_place_id'-'external_query'-'needs_place_relink'-'custom_title' order by id) from public.trip_items i where trip_id='eeeeeeee-eeee-4eee-8eee-000000000001'),
    'stops',(select jsonb_agg(to_jsonb(s)-'source'-'google_place_id'-'external_place_id'-'external_query'-'needs_place_relink'-'custom_title' order by id) from public.trip_item_stops s where trip_item_id='eeeeeeee-eeee-4eee-8eee-000000000003'),
    'receipts',(select jsonb_agg(to_jsonb(r)) from private.trip_mutation_receipts r where trip_id='eeeeeeee-eeee-4eee-8eee-000000000001'),
    'palette',(select jsonb_agg(to_jsonb(c)) from public.user_calendar_colors c where user_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  ) as value`);
}
async function fails(sql: string, pattern?: RegExp) {
  await db.exec('savepoint expected_failure');
  try {
    await expect(db.exec(sql)).rejects.toThrow(pattern);
  } finally {
    await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');
  }
}
async function acceptsWithoutChanges(sql: string) {
  await db.exec('savepoint accepted_visit');
  try {
    await expect(db.exec(sql)).resolves.toBeDefined();
  } finally {
    await db.exec('rollback to savepoint accepted_visit; release savepoint accepted_visit');
  }
}
async function asUser(id = userId) {
  await db.exec(
    `set local role authenticated; set local request.jwt.claim.sub='${id}'; set local request.jwt.claim.role='authenticated'`,
  );
}
async function asService() {
  await db.exec(
    "reset role; set local role service_role; set local request.jwt.claim.sub=''; set local request.jwt.claim.role='service_role'",
  );
}
beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,last_sign_in_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,provider text,provider_id text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create schema realtime;
    create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql as $$ select current_setting('test.realtime_topic',true) $$;
    create function realtime.send(p_payload jsonb,p_event text,p_topic text,p_private boolean) returns void
      language sql as $$insert into realtime.messages values ('broadcast',p_topic,p_event,p_payload,p_private)$$;
  `);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
    const graphMigration = file.endsWith('_semantic_relations.sql');
    const providerMigration = file.endsWith('_mapbox_provider.sql');
    if (providerMigration) {
      await db.exec(`insert into auth.users(id,last_sign_in_at) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now());
        insert into public.profiles(id,discord_id,username,display_name) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','999999999999999990','Legacy','Legacy');
        insert into public.discord_guilds(id,name,application_id) values('999999999999999990','Legacy migration','123456789012345678');
        insert into public.trips(id,guild_id,title,created_by,timezone) values('eeeeeeee-eeee-4eee-8eee-000000000001','999999999999999990','Legacy test','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Asia/Tokyo');
        insert into public.trip_days(id,trip_id,day_number,date,title) values('eeeeeeee-eeee-4eee-8eee-000000000002','eeeeeeee-eeee-4eee-8eee-000000000001',1,'2027-07-12','Day preserved');
        insert into public.trip_items(id,trip_id,trip_day_id,source,google_place_id,notes,start_time,estimated_duration_minutes,calendar_color,sort_order,added_by) values('eeeeeeee-eeee-4eee-8eee-000000000003','eeeeeeee-eeee-4eee-8eee-000000000001','eeeeeeee-eeee-4eee-8eee-000000000002','google','legacy-google-reference','User notes preserved','10:30',90,'#739FD0',1024,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        insert into public.trip_item_stops(id,trip_item_id,source,google_place_id,notes,duration_minutes,calendar_color,sort_order,added_by) values('eeeeeeee-eeee-4eee-8eee-000000000004','eeeeeeee-eeee-4eee-8eee-000000000003','google','legacy-google-stop','Stop notes preserved',30,'#AABBCC',1024,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
        update public.trips set description='Planning preserved' where id='eeeeeeee-eeee-4eee-8eee-000000000001';
        insert into private.trip_mutation_receipts(trip_id,mutation_id,user_id,request_hash,version) values('eeeeeeee-eeee-4eee-8eee-000000000001','eeeeeeee-eeee-4eee-8eee-000000000005','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','fingerprint',1);
        insert into public.user_calendar_colors(user_id,hex_color) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','#739FD0');`);
      providerMigrationBefore = await migrationPlanningSnapshot();
    }
    if (graphMigration) {
      await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values('Archive','archive','ZZ',true);
        insert into public.cities(country_id,name,slug,is_published) select id,'Archive','archive',true from public.countries where slug='archive';
        insert into public.entries(id,city_id,category_id,title,slug,published) select 'e1000000-1111-4111-8111-111111111111',x.id,k.id,'Ancienne fiche A','archive-a',true from public.cities x,public.categories k where x.slug='archive' and k.slug='tourisme';
        insert into public.entries(id,city_id,category_id,title,slug,published) select 'f1000000-1111-4111-8111-111111111111',x.id,k.id,'Ancienne fiche B','archive-b',true from public.cities x,public.categories k where x.slug='archive' and k.slug='tourisme';
        insert into public.relation_types(slug,name,forward_label,inverse_label,is_symmetric) values('archive-link','Ancien type','Associe','Est associé par',false);
        insert into public.entry_relations(source_id,target_id,relation_type_id,created_at,updated_at) values
        ('f1000000-1111-4111-8111-111111111111','e1000000-1111-4111-8111-111111111111',(select id from public.relation_types where slug='nearby'),'2020-01-01','2021-01-01'),
        ('e1000000-1111-4111-8111-111111111111','f1000000-1111-4111-8111-111111111111',(select id from public.relation_types where slug='archive-link'),'2020-01-01','2021-01-01'),
        ('f1000000-1111-4111-8111-111111111111','e1000000-1111-4111-8111-111111111111',(select id from public.relation_types where slug='archive-link'),'2020-01-01','2021-01-01');`);
      legacyRelationsBefore = await scalar(
        'select jsonb_agg(to_jsonb(r) order by id) as value from public.entry_relations r',
      );
      legacyTypeBefore = await scalar(
        "select to_jsonb(t) as value from public.relation_types t where slug='archive-link'",
      );
    }
    await db.exec((await readFile(new URL(file, directory), 'utf8')).replaceAll('\r\n', '\n'));
    if (providerMigration) {
      providerMigrationAfter = await migrationPlanningSnapshot();
      migratedJournal = await scalar(
        "select jsonb_agg(payload order by version) as value from private.trip_plan_events where trip_id='eeeeeeee-eeee-4eee-8eee-000000000001'",
      );
      providerArchive = await scalar(
        "select payload as value from private.mapbox_migration_archive where key='previous_provider'",
      );
      await db.exec(
        "delete from public.trips where id='eeeeeeee-eeee-4eee-8eee-000000000001'; delete from public.discord_guilds where id='999999999999999990'; delete from auth.users where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'",
      );
    }
    if (graphMigration) {
      legacyRelationsAfter = await scalar(
        "select jsonb_agg(to_jsonb(r)-'created_by' order by id) as value from public.entry_relations r",
      );
      legacyTypeAfter = await scalar(
        "select to_jsonb(t)-'created_at'-'updated_at'-'description'-'icon'-'is_enabled' as value from public.relation_types t where slug='archive-link'",
      );
      await db.exec(
        "delete from public.entries where slug in ('archive-a','archive-b'); delete from public.cities where slug='archive'; delete from public.countries where slug='archive'; delete from public.relation_types where slug='archive-link'",
      );
    }
  }
  await db.exec(`insert into auth.users(id,last_sign_in_at,raw_user_meta_data) values
    ('${userId}',now(),'{"sub":"999999999999999999","role":"owner"}'),('${adminId}',now(),'{}'),('${otherId}',now(),'{}');
    insert into auth.identities(user_id,provider,provider_id,identity_data) values ('${userId}','discord','111111111111111111','{"name":"Explorer"}');
    insert into public.profiles(id,discord_id,username,display_name,role) values
    ('${adminId}','222222222222222222','Admin','Admin','admin'),('${otherId}','333333333333333333','Other','Other','user');
  `);
});
beforeEach(async () => {
  await db.exec('begin');
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});

describe('Mapbox migration preservation', () => {
  it('preserves every planning field, occurrence ID, version, timestamp, parent, note, color and receipt', () => {
    expect(providerMigrationAfter).toEqual(providerMigrationBefore);
    expect(providerArchive).toMatchObject({
      items: [{ source: 'google', google_place_id: 'legacy-google-reference' }],
      stops: [{ source: 'google', google_place_id: 'legacy-google-stop' }],
    });
    expect(JSON.stringify(migratedJournal)).not.toMatch(
      /google_place_id|legacy-google|"source":"google"/,
    );
    expect(JSON.stringify(migratedJournal)).toContain('needs_place_relink');
    expect(JSON.stringify(migratedJournal)).toContain('User notes preserved');
  });
  it('keeps the technical archive inaccessible to ordinary members and service API access', async () => {
    await asUser();
    await fails('select * from private.mapbox_migration_archive', /permission denied/);
    await asService();
    await fails('select * from private.mapbox_migration_archive', /permission denied/);
  });
});

describe('Global catalog phase 3', () => {
  const world = `
    insert into public.countries(name,slug,iso_code,is_published) values('Japon','japon','JP',true),('France','france','FR',true);
    insert into public.cities(country_id,name,slug,is_published,has_neighborhoods)
      select id,'Tokyo','tokyo',true,true from public.countries where slug='japon';
    insert into public.cities(country_id,name,slug,is_published)
      select id,'Kyoto','kyoto',true from public.countries where slug='japon';
    insert into public.neighborhoods(city_id,name,slug,is_published)
      select id,'Shinjuku','shinjuku',true from public.cities where slug='tokyo';
    insert into public.entries(city_id,neighborhood_id,category_id,title,slug,published)
      select n.city_id,n.id,c.id,'Tonkatsu','tonkatsu',true from public.neighborhoods n,public.categories c where c.slug='gastronomie';
    insert into public.entries(city_id,category_id,title,slug,published)
      select city.id,c.id,'Restaurant X','restaurant-x',true from public.cities city,public.categories c
      where city.slug='kyoto' and c.slug='adresses';
    insert into public.entries(city_id,category_id,title,slug)
      select city.id,c.id,'Autre adresse','autre-adresse' from public.cities city,public.categories c
      where city.slug='kyoto' and c.slug='adresses';`;
  const entry = "(select id from public.entries where slug='tonkatsu')";
  const restaurant = "(select id from public.entries where slug='restaurant-x')";
  const other = "(select id from public.entries where slug='autre-adresse')";
  const geo = "(select id from public.cities where slug='tokyo')";
  const district = "(select id::text from public.neighborhoods where slug='shinjuku')";
  const food = "(select id from public.categories where slug='gastronomie')";
  const addresses = "(select id from public.categories where slug='adresses')";
  const firstImage = '4b829946-624f-4a32-846f-69bd1ac99312';
  const secondImage = '9f2135c3-c0f3-4eee-99ca-d2b67e02ea5f';
  const version = 'f1e95d24-80ad-4fbe-93b8-12ea0480f173';
  const replacement = 'fc6d0a94-c1a1-471c-9619-11215ce372eb';
  const edit = (id: string, operation: string, data: Record<string, unknown>) =>
    `select public.catalog_edit_media(${id},'${operation}','${JSON.stringify(data)}')`;

  it('reorders and reassigns categories with fields while preserving entry IDs and links', async () => {
    await db.exec(world);
    await asService();
    await db.exec(`
      insert into public.categories(name,slug) values ('Saveurs','saveurs');
      update public.categories set description='Spécialités locales',is_enabled=false where slug='saveurs';
      select public.catalog_order_categories(array(select id from public.categories order by (slug='saveurs') desc,position,id));
      insert into public.category_fields(category_id,key,label,type)
        values (${food},'origin','Origine','short_text'),(${addresses},'origin','Origine','short_text');
      update public.entries set custom_values=jsonb_build_object((select id::text from public.category_fields where category_id=${food}),'Japon') where id=${entry};
      insert into public.entry_relations(source_id,target_id) values(${entry},${restaurant});`);
    expect(
      await scalar<number>("select position as value from public.categories where slug='saveurs'"),
    ).toBe(0);
    await fails(`select public.catalog_remove_category(${food},'')`, /foreign key/i);
    await fails(
      `select public.catalog_remove_category(${food},(select id::text from public.categories where slug='saveurs'))`,
      /catalog_reassign_fields/,
    );
    const originalId = await scalar<string>(`select ${entry} as value`);
    expect(
      await scalar<number>(
        `select public.catalog_remove_category(${food},${addresses}::text) as value`,
      ),
    ).toBe(1);
    expect(
      await scalar<string>(
        `select id as value from public.entries where id='${originalId}' and category_id=${addresses}`,
      ),
    ).toBe(originalId);
    expect(
      await scalar<string>(`select custom_values->>(select id::text from public.category_fields where category_id=${addresses}) as value
      from public.entries where id='${originalId}'`),
    ).toBe('Japon');
    expect(
      await scalar<string>(
        `select case when source_id=${restaurant} then target_id else source_id end as value from public.entry_relations where source_id=${restaurant} or target_id=${restaurant}`,
      ),
    ).toBe(originalId);
  });

  it('validates custom fields and protects existing values during definition edits', async () => {
    await db.exec(world);
    await asService();
    const field = "(select id from public.category_fields where key='styles')";
    await fails(
      `insert into public.category_fields(category_id,key,label,type,is_required)
      values (${food},'origin','Origine','short_text',true)`,
      /catalog_required_field/,
    );
    await db.exec(`insert into public.category_fields(category_id,key,label,type,options)
      values (${food},'styles','Styles','multi_select',array['Classique','Moderne']);
      update public.entries set custom_values=jsonb_build_object(${field}::text,jsonb_build_array('Classique')) where id=${entry};
      update public.category_fields set is_required=true where id=${field};`);
    await fails(
      `update public.entries set custom_values='{}' where id=${entry}`,
      /catalog_required_field/,
    );
    await fails(
      `update public.entries set custom_values=jsonb_build_object(${field}::text,jsonb_build_array('Inconnue')) where id=${entry}`,
      /catalog_invalid_field/,
    );
    await fails(
      `update public.category_fields set options=array['Moderne'] where id=${field}`,
      /catalog_invalid_field/,
    );
    await fails(
      `update public.category_fields set type='short_text',options='{}' where id=${field}`,
      /catalog_field_in_use/,
    );
    await fails(`delete from public.category_fields where id=${field}`, /catalog_field_in_use/);
    await fails(
      `update public.entries set country_id=(select id from public.countries where slug='france') where id=${entry}`,
      /foreign key/i,
    );
  });

  it('validates button groups in PostgreSQL and preserves required and in-use protections', async () => {
    await db.exec(world);
    await asService();
    const field = "(select id from public.category_fields where key='sources')";
    await db.exec(
      `insert into public.category_fields(category_id,key,label,type) values (${food},'sources','Sources','buttons')`,
    );
    const buttons = [
      { label: 'Site officiel', url: 'https://example.org/lieu' },
      { label: 'Source', url: 'https://example.org/?q=tokyo#histoire' },
    ];
    await db.query(
      `update public.entries set custom_values=jsonb_build_object(${field}::text,$1::jsonb) where id=${entry}`,
      [JSON.stringify(buttons)],
    );
    expect(
      await scalar(
        `select custom_values->${field}::text as value from public.entries where id=${entry}`,
      ),
    ).toEqual(buttons);
    await db.exec(`update public.category_fields set icon='zodiac-virgo' where id=${field}`);
    expect(await scalar(`select icon as value from public.category_fields where id=${field}`)).toBe(
      'zodiac-virgo',
    );
    expect(
      await scalar(
        `select custom_values->${field}::text as value from public.entries where id=${entry}`,
      ),
    ).toEqual(buttons);
    await fails(
      `update public.category_fields set icon='../book' where id=${field}`,
      /check constraint/,
    );
    await fails(`update public.category_fields set icon='' where id=${field}`, /check constraint/);
    await db.exec(`update public.category_fields set icon=null where id=${field}`);
    for (const value of [
      null,
      {},
      [],
      [null],
      [{ label: '', url: 'https://example.org' }],
      [{ label: 'a'.repeat(81), url: 'https://example.org' }],
      [{ label: 'Source' }],
      [{ ...buttons[0], extra: true }],
      Array(13).fill(buttons[0]),
      ...[
        'javascript:alert(1)',
        '//example.org',
        'https://user:pass@example.org',
        'https://',
        'https://bad host',
      ].map((url) => [{ label: 'Source', url }]),
    ]) {
      const literal = JSON.stringify(value).replaceAll("'", "''");
      await fails(
        `update public.entries set custom_values=jsonb_build_object(${field}::text,'${literal}'::jsonb) where id=${entry}`,
        /catalog_invalid_field/,
      );
    }
    await db.exec(`update public.category_fields set is_required=true where id=${field}`);
    await fails(
      `update public.entries set custom_values='{}' where id=${entry}`,
      /catalog_required_field/,
    );
    await fails(
      `update public.category_fields set type='url' where id=${field}`,
      /catalog_field_in_use/,
    );
    await fails(`delete from public.category_fields where id=${field}`, /catalog_field_in_use/);
    await db.exec(`update public.entries set published=false,custom_values='{}' where id=${entry}`);
    await fails(
      `update public.entries set published=true where id=${entry}`,
      /catalog_required_field/,
    );
  });

  it('shows only active, published and geographically visible entries and relations', async () => {
    await db.exec(world);
    await asService();
    await db.exec(`insert into public.entry_relations(source_id,target_id,relation_type_id)
      values (${entry},${restaurant},(select id from public.relation_types where slug='served-at')),
      (${restaurant},${other},(select id from public.relation_types where slug='nearby'));
      ${edit(entry, 'add', { id: firstImage, version, alt_text: 'Tonkatsu' })};`);
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.entries')).toBe(2);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      1,
    );
    expect(
      await scalar<string>(
        `select slug as value from public.catalog_categories_at(${geo},${district})`,
      ),
    ).toBe('gastronomie');
    expect(
      await scalar<string>(
        `select slug as value from public.catalog_categories_at((select id from public.cities where slug='kyoto'),'')`,
      ),
    ).toBe('adresses');
    expect(await scalar<number>('select count(*)::int as value from public.entry_media')).toBe(1);
    await fails(
      `insert into public.category_fields(category_id,key,label,type) values (${food},'fake','Fake','number')`,
      /permission denied/i,
    );
    await fails(
      `insert into public.entries(city_id,category_id,title,slug) select id,${food},'Fake','fake' from public.cities where slug='kyoto'`,
      /permission denied/i,
    );
    await fails(`select public.catalog_order_categories(array[]::uuid[])`, /permission denied/i);
    await asService();
    await db.exec("update public.categories set is_enabled=false where slug='gastronomie'");
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.entries')).toBe(1);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      0,
    );
    expect(await scalar<number>('select count(*)::int as value from public.entry_media')).toBe(0);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.catalog_categories_at(${geo},${district})`,
      ),
    ).toBe(0);
    await asService();
    await db.exec(
      "update public.categories set is_enabled=true where slug='gastronomie'; update public.neighborhoods set is_published=false where slug='shinjuku'",
    );
    await db.exec(
      "set local role anon; set local request.jwt.claim.sub=''; set local request.jwt.claim.role='anon'",
    );
    expect(await scalar<number>('select count(*)::int as value from public.entries')).toBe(1);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      0,
    );
  });

  it('supports reciprocal labels, same-category edges, duplicate prevention and graph constraints', async () => {
    await db.exec(world);
    await asService();
    const directed = "(select id from public.relation_types where slug='ordered')";
    const symmetric = "(select id from public.relation_types where slug='nearby')";
    await db.exec(`insert into public.relation_types(slug,name,forward_label,inverse_label,is_acyclic)
      values ('ordered','Parcours','Étape suivante','Étape précédente',true);
      insert into public.entry_relations(source_id,target_id,relation_type_id) values
        (${entry},${restaurant},${directed}),(${restaurant},${other},${directed}),(${restaurant},${other},${symmetric});`);
    expect(
      await scalar<string>(`select t.inverse_label as value from public.entry_relations r join public.relation_types t on r.relation_type_id=t.id
      where r.target_id=${restaurant} and r.source_id=${entry}`),
    ).toBe('Étape précédente');
    await fails(
      `insert into public.entry_relations(source_id,target_id,relation_type_id) values(${other},${entry},${directed})`,
      /catalog_relation_cycle/,
    );
    await fails(
      `insert into public.entry_relations(source_id,target_id,relation_type_id) values(${other},${restaurant},${symmetric})`,
      /unique/i,
    );
    await fails(
      `insert into public.entry_relations(source_id,target_id,relation_type_id) values(${entry},${entry},${symmetric})`,
      /check constraint/i,
    );
    await db.exec(`update public.entry_relations set relation_type_id=${symmetric} where source_id=${entry};
      delete from public.entries where id=${restaurant};`);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      0,
    );
  });

  it('maintains covers across gallery changes and queues storage deletions', async () => {
    await db.exec(world);
    await asService();
    const cover = () =>
      scalar<string | null>(
        `select cover_image_url as value from public.entries where id=${entry}`,
      );
    await db.exec(`${edit(entry, 'add', { id: firstImage, version, alt_text: 'Tonkatsu' })};
      ${edit(entry, 'add', { id: secondImage, version, alt_text: 'Restaurant' })};`);
    expect(await cover()).toContain(firstImage);
    await db.exec(edit(entry, 'order', { ids: [secondImage, firstImage] }));
    expect(await cover()).toContain(secondImage);
    await db.exec(edit(entry, 'cover', { id: firstImage, expected_version: version }));
    expect(await cover()).toContain(firstImage);
    await db.exec(
      edit(entry, 'replace', {
        id: firstImage,
        expected_version: version,
        version: replacement,
        alt_text: 'Nouvelle photo',
      }),
    );
    expect(await cover()).toContain(replacement);
    await fails(
      edit(entry, 'remove', { id: firstImage, expected_version: version }),
      /catalog_media_changed/,
    );
    await db.exec(edit(entry, 'remove', { id: firstImage, expected_version: replacement }));
    expect(await cover()).toContain(secondImage);
    await db.exec(`delete from public.entries where id=${entry}`);
    expect(await scalar<number>('select count(*)::int as value from public.entry_media')).toBe(0);
    expect(
      await scalar<number>('select count(*)::int as value from public.catalog_media_garbage'),
    ).toBe(3);
    await db.exec('reset role');
    expect(
      await scalar<boolean>("select public as value from storage.buckets where id='entry-media'"),
    ).toBe(false);
    await db.exec(
      'create policy entry_media_fixture on storage.objects for all to authenticated using (true) with check (true)',
    );
    await asUser(adminId);
    await fails(
      "insert into storage.objects(bucket_id,name) values ('entry-media','forged')",
      /row-level security/i,
    );
  });
});

describe('Actual migration constraints', () => {
  it('seeds the five editable categories', async () =>
    expect(await scalar<number>('select count(*)::int as value from public.categories')).toBe(5));
  it('enforces geographic FKs and context-unique slugs', async () => {
    await db.exec("insert into public.countries(name,slug,iso_code) values ('Japon','japon','JP')");
    await fails(
      "insert into public.countries(name,slug,iso_code) values ('Duplicate','japon','FR')",
      /unique/i,
    );
    await fails(
      "insert into public.cities(country_id,name,slug) values (gen_random_uuid(),'Tokyo','tokyo')",
      /foreign key/i,
    );
    await db.exec(
      "insert into public.cities(country_id,name,slug) select id,'Tokyo','tokyo' from public.countries",
    );
    await fails(
      "insert into public.cities(country_id,name,slug) select id,'Other','tokyo' from public.countries",
      /unique/i,
    );
  });
  it('prevents cross-city neighborhoods and neighborhoods in a disabled city', async () => {
    await db.exec(`insert into public.countries(name,slug,iso_code) values('Japon','japon','JP');
      insert into public.cities(country_id,name,slug,has_neighborhoods) select id,'Tokyo','tokyo',true from public.countries;
      insert into public.cities(country_id,name,slug) select id,'Kyoto','kyoto' from public.countries;
      insert into public.neighborhoods(city_id,name,slug) select id,'Shinjuku','shinjuku' from public.cities where slug='tokyo';`);
    await fails(
      `insert into public.entries(city_id,neighborhood_id,category_id,title,slug)
      select c.id,n.id,k.id,'Test','test' from public.cities c,public.neighborhoods n,public.categories k where c.slug='kyoto' limit 1`,
      /disabled/i,
    );
    await db.exec("update public.cities set has_neighborhoods=true where slug='kyoto'");
    await fails(
      `insert into public.entries(city_id,neighborhood_id,category_id,title,slug)
      select c.id,n.id,k.id,'Test','test' from public.cities c,public.neighborhoods n,public.categories k where c.slug='kyoto' limit 1`,
      /foreign key/i,
    );
    await db.exec(`insert into public.entries(city_id,neighborhood_id,category_id,title,slug)
      select c.id,n.id,k.id,'Test','test' from public.cities c,public.neighborhoods n,public.categories k where c.slug='tokyo' limit 1`);
    await fails(
      "update public.cities set has_neighborhoods=false where slug='tokyo'",
      /Detach entries/i,
    );
  });
  it('enforces bidirectional uniqueness, no self-links, and dependency deletion rules', async () => {
    await db.exec(`insert into public.countries(name,slug,iso_code) values('Japon','japon','JP');
      insert into public.cities(country_id,name,slug) select id,'Kyoto','kyoto' from public.countries;
      insert into public.entries(city_id,category_id,title,slug) select c.id,k.id,'A','a' from public.cities c,public.categories k limit 1;
      insert into public.entries(city_id,category_id,title,slug) select c.id,k.id,'B','b' from public.cities c,public.categories k limit 1;
      insert into public.entry_relations(source_id,target_id) select a.id,b.id from public.entries a,public.entries b where a.slug='a' and b.slug='b';`);
    await fails(
      "insert into public.entry_relations(source_id,target_id) select b.id,a.id from public.entries a,public.entries b where a.slug='a' and b.slug='b'",
      /unique/i,
    );
    await fails(
      'insert into public.entry_relations(source_id,target_id) select id,id from public.entries limit 1',
      /check constraint/i,
    );
    await fails('delete from public.categories', /foreign key/i);
    await db.exec("delete from public.entries where slug='a'");
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      0,
    );
  });
});
describe('Identity, roles and RLS', () => {
  it('keeps retained owners intact and mutates only additions and removals', async () => {
    await asService();
    await db.exec("select public.configure_owners(array['111111111111111111'])");
    await db.exec(`reset role;
      create table private.owner_audit(operation text);
      create function private.audit_owner_changes() returns trigger language plpgsql security definer set search_path='' as $$
        begin insert into private.owner_audit values(TG_OP); return null; end $$;
      create trigger audit_owner_changes after insert or delete on private.owner_ids for each row execute function private.audit_owner_changes();`);
    await asService();
    await db.exec(
      "select public.configure_owners(array['111111111111111111','111111111111111111'])",
    );
    await db.exec('reset role');
    expect(await scalar<number>('select count(*)::int as value from private.owner_audit')).toBe(0);
    expect(await scalar<number>('select count(*)::int as value from private.owner_ids')).toBe(1);
    await asService();
    await db.exec("select public.configure_owners(array['222222222222222222'])");
    await db.exec('reset role');
    expect(
      await scalar<number>(
        "select count(*)::int as value from private.owner_audit where operation='DELETE'",
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        "select count(*)::int as value from private.owner_audit where operation='INSERT'",
      ),
    ).toBe(1);
  });

  it('atomically rejects invalid owner IDs and supports clearing the allowlist', async () => {
    await asService();
    await db.exec("select public.configure_owners(array['111111111111111111'])");
    await fails("select public.configure_owners(array['invalid-id'])", /check constraint/i);
    await db.exec('reset role');
    expect(await scalar<number>('select count(*)::int as value from private.owner_ids')).toBe(1);
    await asService();
    await db.exec('select public.configure_owners(null)');
    await db.exec('reset role');
    expect(await scalar<number>('select count(*)::int as value from private.owner_ids')).toBe(0);
  });

  it('creates a profile from the provider identity and ignores spoofed metadata', async () => {
    await asUser();
    await db.exec('select public.sync_discord_profile()');
    expect(await scalar<string>('select discord_id as value from public.profiles')).toBe(
      '111111111111111111',
    );
    expect(await scalar<string>('select role as value from public.profiles')).toBe('user');
    await fails("update public.profiles set role='owner'", /permission denied/i);
    await fails(
      "insert into public.categories(name,slug) values('Hacked','hacked')",
      /row.level security/i,
    );
    await fails(
      "select public.configure_owners(array['111111111111111111'])",
      /permission denied/i,
    );
  });
  it('rejects sessions without a Discord identity', async () => {
    await asUser(otherId);
    await fails('select public.sync_discord_profile()', /Discord identity required/i);
  });
  it('lets configured owners administer and revokes removed owners', async () => {
    await asService();
    await db.exec("select public.configure_owners(array['111111111111111111'])");
    await db.exec('reset role');
    await asUser();
    await db.exec('select public.sync_discord_profile()');
    expect(await scalar<boolean>('select public.is_nagi_admin() as value')).toBe(true);
    await db.exec("insert into public.categories(name,slug) values('Nature','nature')");
    await asService();
    await db.exec('select public.configure_owners(array[]::text[])');
    await db.exec('reset role');
    await asUser();
    expect(await scalar<boolean>('select public.is_nagi_admin() as value')).toBe(false);
  });
  it('allows admins to request sync, but refuses user requests and operational writes', async () => {
    await asUser(adminId);
    await db.exec(`select public.enqueue_bot_sync('${applicationId}','${scope}','admin')`);
    expect(
      await scalar<number>('select count(*)::int as value from public.bot_sync_requests'),
    ).toBe(1);
    await fails('delete from public.bot_sync_requests', /permission denied/i);
    await fails(
      `select public.acquire_bot_lease('${applicationId}','${scope}',gen_random_uuid())`,
      /permission denied/i,
    );
    await db.exec('reset role');
    await asUser(otherId);
    expect(
      await scalar<number>('select count(*)::int as value from public.bot_sync_requests'),
    ).toBe(0);
    await fails(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','admin')`,
      /Forbidden/i,
    );
  });
  it('hides drafts and their relations from anonymous visitors', async () => {
    await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values('Japon','japon','JP',true);
      insert into public.cities(country_id,name,slug,is_published) select id,'Kyoto','kyoto',true from public.countries;
      insert into public.entries(city_id,category_id,title,slug,published) select c.id,k.id,'Public','public',true from public.cities c,public.categories k limit 1;
      insert into public.entries(city_id,category_id,title,slug) select c.id,k.id,'Private','private' from public.cities c,public.categories k limit 1;
      insert into public.entry_relations(source_id,target_id) select a.id,b.id from public.entries a,public.entries b where a.slug='public' and b.slug='private';
      set local role anon; set local request.jwt.claim.sub=''; set local request.jwt.claim.role='anon';`);
    expect(await scalar<number>('select count(*)::int as value from public.entries')).toBe(1);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      0,
    );
  });
});
describe('Geographic catalog', () => {
  it('lets Nagi admins create and edit countries while enforcing ISO, slugs and coordinates', async () => {
    await asUser(adminId);
    await db.exec(`insert into public.countries(name,slug,iso_code) values ('Japon','japon','JP'),('France','france','FR');
      update public.countries set description='Explorer le Japon', sort_order=1 where slug='japon';
      insert into public.cities(country_id,name,slug,latitude,longitude) select id,'Tokyo','tokyo',35.68,139.65 from public.countries;`);
    expect(
      await scalar<string>("select description as value from public.countries where slug='japon'"),
    ).toBe('Explorer le Japon');
    expect(
      await scalar<boolean>(
        "select is_published as value from public.countries where slug='japon'",
      ),
    ).toBe(false);
    await fails(
      "insert into public.countries(name,slug,iso_code) values('Duplicate','duplicate','JP')",
      /countries_iso_code_key/,
    );
    await fails(
      "insert into public.countries(name,slug,iso_code) values('Lowercase','lowercase','jp')",
      /check constraint/i,
    );
    await fails(
      "insert into public.countries(name,slug) values('Code absent','code-absent')",
      /countries_iso_required/,
    );
    await fails("update public.cities set latitude=91 where slug='tokyo'", /latitude/i);
    await fails("update public.cities set longitude='NaN' where slug='tokyo'", /longitude/i);
  });

  it('guards city modes, preserves dependencies and permits explicit reorganization', async () => {
    await asUser(adminId);
    await db.exec(`insert into public.countries(name,slug,iso_code) values ('Japon','japon','JP');
      insert into public.cities(country_id,name,slug) select id,'Tokyo','tokyo' from public.countries;`);
    const addDistrict =
      "insert into public.neighborhoods(city_id,name,slug) select id,'Ginza','ginza' from public.cities";
    await fails(addDistrict, /disabled/i);
    await fails('delete from public.countries', /foreign key/i);
    await db.exec(`update public.cities set has_neighborhoods=true; ${addDistrict};
      insert into public.neighborhoods(city_id,name,slug,sort_order) select id,'Shinjuku','shinjuku',1 from public.cities;`);
    expect(await scalar<number>('select count(*)::int as value from public.neighborhoods')).toBe(2);
    await fails('delete from public.cities', /foreign key/i);
    await fails('update public.cities set has_neighborhoods=false', /before disabling/i);
    const addCityEntry = `insert into public.entries(city_id,category_id,title,slug)
      select c.id,k.id,'Visite','visite' from public.cities c,public.categories k limit 1`;
    await fails(addCityEntry, /neighborhood is required/i);
    await db.exec(
      `delete from public.neighborhoods; update public.cities set has_neighborhoods=false; ${addCityEntry};`,
    );
    await fails('update public.cities set has_neighborhoods=true', /before enabling/i);
    await fails('delete from public.cities', /foreign key/i);
    const entryId = await scalar<string>('select id as value from public.entries');
    await db.exec(`set constraints public.check_city_neighborhoods deferred;
      update public.cities set has_neighborhoods=true;
      ${addDistrict};
      update public.entries set neighborhood_id=(select id from public.neighborhoods where slug='ginza');
      set constraints public.check_city_neighborhoods immediate;`);
    expect(await scalar<string>('select id as value from public.entries')).toBe(entryId);
  });

  it('hides drafts and their descendants and rejects writes from ordinary accounts', async () => {
    await asUser(adminId);
    await db.exec(`insert into public.countries(name,slug,iso_code) values ('Japon','japon','JP');
      insert into public.cities(country_id,name,slug,has_neighborhoods,is_published) select id,'Tokyo','tokyo',true,true from public.countries;
      insert into public.cities(country_id,name,slug) select id,'Kyoto','kyoto' from public.countries;
      insert into public.neighborhoods(city_id,name,slug,is_published) select id,'Ginza','ginza',true from public.cities where slug='tokyo';
      insert into public.neighborhoods(city_id,name,slug) select id,'Shinjuku','shinjuku' from public.cities where slug='tokyo';`);
    expect(await scalar<number>('select count(*)::int as value from public.neighborhoods')).toBe(2);
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.countries')).toBe(0);
    expect(await scalar<number>('select count(*)::int as value from public.cities')).toBe(0);
    expect(await scalar<number>('select count(*)::int as value from public.neighborhoods')).toBe(0);
    await asUser(adminId);
    await db.exec('update public.countries set is_published=true');
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.cities')).toBe(1);
    expect(await scalar<string>('select slug as value from public.neighborhoods')).toBe('ginza');
    expect(
      await scalar<number>(
        `with edited as (update public.cities set name='Intrusion' returning id) select count(*)::int as value from edited`,
      ),
    ).toBe(0);
    expect(
      await scalar<number>(
        `with deleted as (delete from public.neighborhoods returning id) select count(*)::int as value from deleted`,
      ),
    ).toBe(0);
    await asUser(adminId);
    await db.exec("update public.cities set is_published=false where slug='tokyo'");
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.neighborhoods')).toBe(0);
  });

  it('keeps cover references scoped to their destination and protects raw storage', async () => {
    await db.exec(`create policy permissive_fixture on storage.objects for all to authenticated using(true) with check(true);
      insert into public.countries(name,slug,iso_code) values ('Japon','japon','JP');`);
    const prefix = "'/app/catalog-cover/countries/' || id::text || '/'";
    await db.exec(
      `update public.countries set cover_image_url=${prefix} || gen_random_uuid()::text;`,
    );
    await fails(
      "update public.countries set cover_image_url='https://example.com/cover.webp'",
      /countries_cover_path/i,
    );
    const first = await scalar<string>('select cover_image_url as value from public.countries');
    await db.exec(
      `update public.countries set cover_image_url=${prefix} || gen_random_uuid()::text;`,
    );
    expect(await scalar<string>('select cover_image_url as value from public.countries')).not.toBe(
      first,
    );
    await asService();
    await db.exec(
      "insert into storage.objects(bucket_id,name) values ('destination-covers','webp')",
    );
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from storage.objects')).toBe(0);
    await fails(
      "insert into storage.objects(bucket_id,name) values ('destination-covers','forged')",
      /row.level security/i,
    );
  });
});

describe('Durable queue and distributed lease', () => {
  it('coalesces startup requests, rejects concurrent owners, and processes the queued work', async () => {
    await asService();
    const request = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','web-startup') as value`,
    );
    expect(
      await scalar<string>(
        `select public.enqueue_bot_sync('${applicationId}','${scope}','bot-startup') as value`,
      ),
    ).toBe(request);
    const token = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','${scope}','${userId}') as value`,
    );
    expect(token).toBeTruthy();
    expect(
      await scalar<string | null>(
        `select public.acquire_bot_lease('${applicationId}','${scope}','${otherId}') as value`,
      ),
    ).toBe(null);
    expect(
      await scalar<boolean>(
        `select public.renew_bot_lease('${applicationId}','${scope}','${token}',true) as value`,
      ),
    ).toBe(true);
    const claimed = await db.query<{ id: string }>(
      `select * from public.claim_bot_sync('${applicationId}','${scope}','${token}')`,
    );
    expect(claimed.rows[0]?.id).toBe(request);
    await db.exec(
      `select public.finish_bot_sync('${request}','${token}',true,null,'[{"name":"ping"}]')`,
    );
    expect(
      await scalar<string>(
        `select status as value from public.bot_sync_requests where id='${request}'`,
      ),
    ).toBe('succeeded');
    expect(await scalar<number>('select command_count as value from public.bot_runtime')).toBe(1);
  });
  it('recovers an abandoned request on a new lease and fences the previous worker', async () => {
    await asService();
    const request = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','web-startup') as value`,
    );
    const old = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','${scope}','${userId}') as value`,
    );
    await db.exec(
      `select public.claim_bot_sync('${applicationId}','${scope}','${old}'); update public.bot_runtime set lease_until=now()-interval '1 second'`,
    );
    const fresh = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','${scope}','${otherId}') as value`,
    );
    expect(fresh).not.toBe(old);
    await fails(
      `select public.finish_bot_sync('${request}','${old}',true,null,'[]')`,
      /Lease lost/i,
    );
    await fails(
      `select public.claim_bot_sync('${applicationId}','${scope}','${old}')`,
      /Lease lost/i,
    );
    const rows = await db.query<{ id: string; attempts: number }>(
      `select * from public.claim_bot_sync('${applicationId}','${scope}','${fresh}')`,
    );
    expect(rows.rows[0]).toMatchObject({ id: request, attempts: 2 });
  });
  it('retries failures with backoff and does not claim another application or scope', async () => {
    await asService();
    const request = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','web-startup') as value`,
    );
    const token = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','global','${userId}') as value`,
    );
    const empty = await db.query(
      `select * from public.claim_bot_sync('${applicationId}','global','${token}')`,
    );
    expect(empty.rows).toHaveLength(0);
    await db.exec(`select public.release_bot_lease('${applicationId}','global','${token}')`);
    const scopedToken = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','${scope}','${userId}') as value`,
    );
    await db.exec(
      `select public.claim_bot_sync('${applicationId}','${scope}','${scopedToken}'); select public.finish_bot_sync('${request}','${scopedToken}',false,'Network failure','[]')`,
    );
    expect(
      await scalar<string>(
        `select status as value from public.bot_sync_requests where id='${request}'`,
      ),
    ).toBe('pending');
    expect(
      await scalar<boolean>(
        `select available_at>now() as value from public.bot_sync_requests where id='${request}'`,
      ),
    ).toBe(true);
  });
  it('stops after five failed attempts and records a terminal timestamp', async () => {
    await asService();
    const request = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','web-startup') as value`,
    );
    const token = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','${scope}','${userId}') as value`,
    );
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.exec(`update public.bot_sync_requests set available_at=now()-interval '1 second' where id='${request}';
        select public.claim_bot_sync('${applicationId}','${scope}','${token}');
        select public.finish_bot_sync('${request}','${token}',false,'Network failure','[]')`);
    }
    expect(
      await scalar<string>(
        `select status as value from public.bot_sync_requests where id='${request}'`,
      ),
    ).toBe('failed');
    expect(
      await scalar<boolean>(
        `select finished_at is not null as value from public.bot_sync_requests where id='${request}'`,
      ),
    ).toBe(true);
    const next = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','admin') as value`,
    );
    expect(next).not.toBe(request);
  });
  it('preserves a newer pending request when an in-flight attempt fails', async () => {
    await asService();
    const request = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','web-startup') as value`,
    );
    const token = await scalar<string>(
      `select public.acquire_bot_lease('${applicationId}','${scope}','${userId}') as value`,
    );
    await db.exec(`select public.claim_bot_sync('${applicationId}','${scope}','${token}')`);
    const newer = await scalar<string>(
      `select public.enqueue_bot_sync('${applicationId}','${scope}','admin') as value`,
    );
    await db.exec(
      `select public.finish_bot_sync('${request}','${token}',false,'Network failure','[]')`,
    );
    expect(
      await scalar<string>(
        `select status as value from public.bot_sync_requests where id='${newer}'`,
      ),
    ).toBe('pending');
    expect(
      await scalar<string>(
        `select status as value from public.bot_sync_requests where id='${request}'`,
      ),
    ).toBe('failed');
  });
});

const guildA = '444444444444444444';
const guildB = '555555555555555555';
const tripA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tripB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function spacesFixture() {
  await asUser();
  await db.exec('select public.sync_discord_profile(); reset role');
  await asService();
  await db.exec(`select public.reconcile_discord_guilds('${applicationId}','[{"id":"${guildA}","name":"A"},{"id":"${guildB}","name":"B"}]');
    select public.record_discord_memberships('${userId}','${applicationId}','[{"id":"${guildA}","permissions":"8"}]');
    select public.record_discord_memberships('${otherId}','${applicationId}','[{"id":"${guildA}","permissions":"0"}]');
    select public.record_discord_memberships('${adminId}','${applicationId}','[{"id":"${guildB}","permissions":"32"}]');
    insert into public.trips(id,guild_id,title,created_by) values('${tripA}','${guildA}','Voyage A','${userId}'),('${tripB}','${guildB}','Voyage B','${adminId}'); reset role`);
}

describe('Account deletion and retained shared travel', () => {
  beforeEach(spacesFixture);
  it('exposes deletion readiness only to the authenticated server layer', async () => {
    await asUser();
    await fails('select public.account_deletion_ready()', /permission denied/);
    await asService();
    expect(await scalar<boolean>('select public.account_deletion_ready() as value')).toBe(true);
  });
  it('cascades personal data, queues the banner cleanup and keeps shared trips available to their Discord administrator', async () => {
    await asService();
    await db.exec(
      `select public.record_discord_memberships('${otherId}','${applicationId}','[{"id":"${guildA}","permissions":"8"}]');`,
    );
    await asUser(otherId);
    expect(await scalar<boolean>(`select public.is_trip_organizer('${tripA}') as value`)).toBe(
      false,
    );
    await db.exec('reset role');
    const banner = `${userId}/${otherId}.webp`;
    await db.exec(`
      update public.trips set collaboration_mode='organizers_only' where id='${tripA}';
      update public.profile_customizations set banner_path='${banner}' where user_id='${userId}';
      insert into private.profile_aliases(handle,user_id) values ('old-handle','${userId}');
      insert into private.trip_add_requests(id,trip_id,user_id,entry_id) values(gen_random_uuid(),'${tripA}','${userId}',gen_random_uuid());
      insert into public.user_guild_preferences(user_id,default_guild_id) values('${userId}','${guildA}');
      insert into private.discord_credentials(user_id,encrypted_tokens,expires_at,scopes) values('${userId}','encrypted',now()+interval '1 hour',array['identify','guilds']);
      delete from auth.users where id='${userId}';
    `);
    for (const table of [
      'public.profiles',
      'public.profile_customizations',
      'private.profile_aliases',
      'private.trip_add_requests',
      'public.user_guild_preferences',
      'private.discord_credentials',
      'private.guild_memberships',
    ]) {
      const column = table === 'public.profiles' ? 'id' : 'user_id';
      expect(
        await scalar<number>(
          `select count(*)::int as value from ${table} where ${column}='${userId}'`,
        ),
      ).toBe(0);
    }
    expect(
      await scalar<string>(`select created_by as value from public.trips where id='${tripA}'`),
    ).toBeNull();
    expect(
      await scalar<string>(
        `select path as value from public.profile_banner_garbage where path='${banner}'`,
      ),
    ).toBe(banner);
    await asUser(otherId);
    expect(await scalar<boolean>(`select public.is_trip_organizer('${tripA}') as value`)).toBe(
      true,
    );
    expect(await scalar<boolean>(`select public.can_edit_guild_trip('${tripA}') as value`)).toBe(
      true,
    );
    expect(await scalar<boolean>(`select public.is_trip_organizer('${tripB}') as value`)).toBe(
      false,
    );
    const version = await scalar<number>(
      `select version as value from public.trips where id='${tripA}'`,
    );
    await db.exec(
      `select public.edit_trip_plan('${guildA}','${tripA}',${version},'organizer_add','{"discord_id":"333333333333333333"}')`,
    );
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_organizers where trip_id='${tripA}'`,
      ),
    ).toBe(1);
  });
  it('keeps remaining organizers in control and rejects ordinary or expired members on orphan trips', async () => {
    await asService();
    await db.exec(
      `select public.record_discord_memberships('${adminId}','${applicationId}','[{"id":"${guildA}","permissions":"8"}]');`,
    );
    await db.exec(
      `reset role; insert into public.trip_organizers(trip_id,user_id) values('${tripA}','${otherId}'); delete from auth.users where id='${userId}';`,
    );
    await asUser(adminId);
    expect(await scalar<boolean>(`select public.is_trip_organizer('${tripA}') as value`)).toBe(
      false,
    );
    await asUser(otherId);
    expect(await scalar<boolean>(`select public.is_trip_organizer('${tripA}') as value`)).toBe(
      true,
    );
    await db.exec(
      `reset role; delete from public.trip_organizers where trip_id='${tripA}'; update public.trips set collaboration_mode='organizers_only' where id='${tripA}';`,
    );
    await asUser(otherId);
    expect(await scalar<boolean>(`select public.can_edit_guild_trip('${tripA}') as value`)).toBe(
      false,
    );
    await db.exec(
      `reset role; update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${adminId}';`,
    );
    await asUser(adminId);
    expect(await scalar<boolean>(`select public.is_trip_organizer('${tripA}') as value`)).toBe(
      false,
    );
  });
});
describe('Collaborative planner transactions', () => {
  beforeEach(spacesFixture);
  const dayOne = 'e93c463c-feee-454e-9222-40ea186a0830';
  const dayTwo = '129dbc74-17aa-4725-95d4-c71b3c16c360';
  const catalogEntry = '01bb0a6b-5199-4ac9-8ead-4ea337ac8009';
  const firstItem = '69847ac8-0814-4ba9-8d71-ebf83c5a671a';
  const secondItem = 'dd0ca684-50ba-4c78-b8fa-d2d064e46236';
  const plannedTrip = '98883867-4390-473d-bd32-d82a02e110a0';
  const operation = (
    version: number,
    name: string,
    data: Record<string, unknown>,
    guild = guildA,
    trip = tripA,
  ) =>
    `select public.edit_trip_plan('${guild}','${trip}',${version},'${name}','${JSON.stringify(data).replaceAll("'", "''")}') as value`;
  async function catalogAndDays() {
    await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values ('Japon','japon','JP',true);
      insert into public.cities(country_id,name,slug,is_published) select id,'Tokyo','tokyo',true from public.countries;
      insert into public.entries(id,city_id,category_id,title,slug,description,published)
        select '${catalogEntry}',c.id,k.id,'Tokyo Tower','tower','Catalogue',true from public.cities c,public.categories k limit 1;
      insert into public.trip_days(id,trip_id,day_number,title,sort_order)
        values ('${dayOne}','${tripA}',1,'Tokyo',0),('${dayTwo}','${tripA}',2,'Kyoto',1);`);
  }
  const settings = {
    title: 'Voyage Japon',
    description: 'En commun',
    destination_country_id: null,
    start_date: '2027-07-12',
    end_date: '2027-07-14',
    timezone: 'Asia/Tokyo',
    status: 'planned',
    collaboration_mode: 'all_members',
  };

  const stopEntry = 'fd8d2495-426a-4486-9c55-bb3296926d7a';
  const stopOne = '1356563b-e45d-448a-a931-d2aac73fc7dc';
  const stopTwo = '4d351d51-727d-45a8-9b8a-49ea963d10ec';
  const stopThree = '7701d6ab-5334-42be-90ed-c8dd4cdb8243';
  async function activityFixture() {
    await catalogAndDays();
    await db.exec(`insert into public.entries(id,city_id,category_id,title,slug,published)
      select '${stopEntry}',city_id,category_id,'Nintendo','nintendo',true from public.entries where id='${catalogEntry}';`);
    await asUser();
    await scalar(
      operation(0, 'add_item', {
        id: firstItem,
        entry: catalogEntry,
        day: dayOne,
        repeat: false,
        start_time: '14:00',
        duration: 120,
      }),
    );
    await scalar(
      operation(1, 'add_stop', {
        id: stopOne,
        parent: firstItem,
        entry: stopEntry,
        repeat: false,
        duration: 40,
      }),
    );
  }
  const freePlace = {
    source: 'custom',
    title: 'Temps libre',
    location: 'Rendez-vous devant le logement',
    latitude: null,
    longitude: null,
  };
  const externalAdd = (
    id = firstItem,
    place: Record<string, unknown> = freePlace,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    place,
    day: null,
    before: null,
    duration: 30,
    notes: 'Notes du groupe',
    color: '#739FD0',
    ...extra,
  });
  describe('Serper discovery, private galleries and reviewed publication', () => {
    const key = 'c'.repeat(64),
      queryHash = 'd'.repeat(64),
      photo = 'abc00000-0000-4000-8000-000000000011';
    const item = {
      id: photo,
      urlKey: 'e'.repeat(64),
      metadata: {
        title: 'Kamakura waterfront',
        imageUrl: 'https://venue.example.org/photo.jpg',
        thumbnailUrl: 'https://images.example.org/thumb.jpg',
        link: 'https://venue.example.org/photos',
        source: 'Venue',
        imageWidth: 1200,
        imageHeight: 800,
      },
      sources: ['https://venue.example.org/photos'],
      rank: 300,
    };
    beforeEach(async () => {
      await asService();
      await catalogAndDays();
      await db.exec(
        `insert into public.image_galleries(cache_key,place_source,place_kind,place_id) select '${key}','nagi','city',id::text from public.cities limit 1;`,
      );
    });
    const reserve = (extra = '') =>
      `select public.reserve_image_discovery('${userId}','${key}','${queryHash}'${extra}) as value`;
    const finish = (lease: string, items: unknown[] = [item], extra = '') =>
      `select public.finish_image_discovery('${key}','${lease}','${JSON.stringify(items).replaceAll("'", "''")}',2${extra}) as value`;
    async function discovered() {
      const lease = await scalar<{ lease: string }>(reserve());
      await scalar(finish(lease.lease));
    }
    it('stores unknown references without publishing them, and rejects direct reads by members and administrators', async () => {
      await discovered();
      expect(
        await scalar<number>('select count(*)::int as value from public.image_candidates'),
      ).toBe(1);
      expect(
        await scalar<number>('select count(*)::int as value from public.external_images'),
      ).toBe(0);
      await asUser();
      await fails('select * from public.image_candidates', /permission denied/);
      await fails('select * from public.image_galleries', /permission denied/);
      await fails(reserve(), /permission denied/);
      await fails(
        `select public.review_image_candidate('${photo}','permission_granted','','','','Owner permission')`,
        /image_forbidden/,
      );
      await asUser(adminId);
      await fails('select * from public.image_candidates', /permission denied/);
    });
    it('deduplicates concurrent page reservations and refuses a stale completion', async () => {
      const first = await scalar<{ lease: string }>(reserve());
      expect(first.lease).toBeTruthy();
      expect((await scalar<{ lease?: string }>(reserve())).lease).toBeUndefined();
      expect(
        await scalar(
          `select public.finish_image_discovery('${key}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','[]') as value`,
        ),
      ).toBe(false);
      await scalar(finish(first.lease, [item, item]));
      expect(
        await scalar<number>('select count(*)::int as value from public.image_candidates'),
      ).toBe(1);
      expect(
        await scalar<number>(
          `select next_page as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBe(2);
    });
    it('reuses a successful first page without reserving any paid continuation', async () => {
      await discovered();
      expect(
        await scalar(`select state as value from public.image_galleries where cache_key='${key}'`),
      ).toBe('complete');
      expect((await scalar<{ lease?: string }>(reserve())).lease).toBeUndefined();
      expect(
        (await scalar<{ lease?: string }>(reserve(',p_continue=>true'))).lease,
      ).toBeUndefined();
    });
    it('ignores legacy page limits and language variants to enforce exactly one first-page request', async () => {
      const first = await scalar<{ lease: string; page: number; variant: number }>(
        reserve(',p_pages=>50,p_total_pages=>100'),
      );
      expect(first).toMatchObject({ page: 1, variant: 0 });
      await scalar(finish(first.lease));
      expect(
        await scalar(`select state as value from public.image_galleries where cache_key='${key}'`),
      ).toBe('complete');
      expect((await scalar<{ lease?: string }>(reserve())).lease).toBeUndefined();
      expect(
        (await scalar<{ lease?: string }>(reserve(',p_continue=>true'))).lease,
      ).toBeUndefined();
    });
    it('does not spend on an alias search after a first page has no results', async () => {
      const first = await scalar<{ lease: string }>(reserve());
      await scalar(
        `select public.finish_image_discovery('${key}','${first.lease}','[]',1,null,60,3) as value`,
      );
      expect(
        await scalar(
          `select query_index as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBe(0);
      expect(
        (await scalar<{ lease?: string }>(reserve(',p_continue=>true'))).lease,
      ).toBeUndefined();
      await db.exec('reset role');
      expect(
        await scalar(
          `select calls as value from private.image_resolver_usage where bucket='serper:global:day'`,
        ),
      ).toBe(1);
    });
    it.each(['network', 'canceled'])(
      'does not retry a %s attempt when the first call may already have been charged',
      async (reason) => {
        const first = await scalar<{ lease: string }>(reserve());
        await scalar(
          `select public.finish_image_discovery('${key}','${first.lease}','[]',0,'${reason}') as value`,
        );
        expect((await scalar<{ lease?: string }>(reserve())).lease).toBeUndefined();
        expect(
          (await scalar<{ lease?: string }>(reserve(',p_continue=>true'))).lease,
        ).toBeUndefined();
      },
    );
    it('does not buy another request after an abandoned lease expires', async () => {
      await scalar(reserve());
      await db.exec(
        `update public.image_galleries set lease_until=now()-interval '1 second' where cache_key='${key}'`,
      );
      expect((await scalar<{ lease?: string }>(reserve())).lease).toBeUndefined();
      await db.exec('reset role');
      expect(
        await scalar(
          `select calls as value from private.image_resolver_usage where bucket='serper:global:day'`,
        ),
      ).toBe(1);
    });
    it('refuses refresh and continuation permanently even after a day', async () => {
      await discovered();
      await db.exec(
        `update public.image_galleries set searched_at=now()-interval '30 days' where cache_key='${key}'`,
      );
      for (const flags of [
        '',
        ',p_refresh=>true',
        ',p_continue=>true',
        ',p_refresh=>true,p_continue=>true',
      ]) {
        expect(await scalar<{ lease?: string; reason: string }>(reserve(flags))).toMatchObject({
          reason: 'cached',
        });
        expect((await scalar<{ lease?: string }>(reserve(flags))).lease).toBeUndefined();
      }
    });
    it('enforces shared budgets and provider cooldowns on genuinely new places', async () => {
      await discovered();
      const otherKey = 'b'.repeat(64),
        thirdKey = 'e'.repeat(64);
      await db.exec(
        `insert into public.image_galleries(cache_key,place_source,place_kind,place_id) values('${otherKey}','mapbox','entry','other'),('${thirdKey}','mapbox','entry','third')`,
      );
      const other = (flags = '') => reserve(flags).replace(key, otherKey);
      expect((await scalar<{ reason: string }>(other(',p_global_day=>1'))).reason).toBe(
        'global_daily_budget',
      );
      const next = await scalar<{ lease: string }>(other());
      await scalar(
        `select public.finish_image_discovery('${otherKey}','${next.lease}','[]',0,'rate_limit',120) as value`,
      );
      expect((await scalar<{ reason: string }>(reserve().replace(key, thirdKey))).reason).toBe(
        'rate_limit',
      );
    });
    it('accepts at most ten candidates from an older worker response', async () => {
      const first = await scalar<{ lease: string }>(reserve());
      const many = Array.from({ length: 40 }, (_, index) => ({
        ...item,
        id: 'abc00000-0000-4000-8000-' + String(index + 100).padStart(12, '0'),
        urlKey: index.toString(16).padStart(64, '0'),
        metadata: { ...item.metadata, imageUrl: 'https://venue.example.org/' + index + '.jpg' },
      }));
      await scalar(finish(first.lease, many));
      expect(
        await scalar<number>('select count(*)::int as value from public.image_candidates'),
      ).toBe(10);
    });
    it('uses the global ceiling for administrators instead of silently blocking their twenty-first search', async () => {
      await db.exec('reset role');
      await db.exec(
        `insert into private.image_resolver_usage values('serper:global:day',date_trunc('day',now()),21),('serper:${userId}:day',date_trunc('day',now()),21),('serper:${adminId}:day',date_trunc('day',now()),21)`,
      );
      await asService();
      expect((await scalar<{ reason: string }>(reserve())).reason).toBe('user_daily_budget');
      expect(
        (await scalar<{ lease?: string }>(reserve().replace(userId, adminId))).lease,
      ).toBeTruthy();
    });
    it('does not let administrators bypass the shared global budget', async () => {
      await db.exec('reset role');
      await db.exec(
        `insert into private.image_resolver_usage values('serper:global:day',date_trunc('day',now()),50)`,
      );
      await asService();
      expect((await scalar<{ reason: string }>(reserve().replace(userId, adminId))).reason).toBe(
        'global_daily_budget',
      );
    });
    it('reports a busy global slot without charging or claiming the waiting place', async () => {
      const otherKey = 'b'.repeat(64);
      await db.exec(
        `insert into public.image_galleries(cache_key,place_source,place_kind,place_id,lease_id,lease_until) values('${otherKey}','mapbox','entry','other',gen_random_uuid(),now()+interval '20 seconds')`,
      );
      expect(await scalar(reserve())).toMatchObject({ state: 'indexing', reason: 'busy' });
      expect(
        await scalar(
          `select searched_at as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBeNull();
    });
    it('does not allow unknown, rejected or unsupported licence data into public images', async () => {
      await fails(
        `insert into public.external_images(id,provider,source_id,metadata) values('${photo}','serper','unknown','{"imageUrl":"https://example.org/a.jpg","thumbnailUrl":"https://example.org/a.jpg","sourceUrl":"https://example.org"}')`,
        /constraint/,
      );
      await discovered();
      await asUser(adminId);
      await fails(
        `select public.review_image_candidate('${photo}','permission_granted')`,
        /image_rights_evidence_required/,
      );
      await fails(
        `select public.review_image_candidate('${photo}','open_license','Author','CC BY-NC','https://creativecommons.org/licenses/by-nc/4.0/','Licence checked')`,
        /image_license_required/,
      );
      await scalar(`select public.review_image_candidate('${photo}','restricted')`);
      expect(
        await scalar<number>('select count(*)::int as value from public.external_images'),
      ).toBe(0);
    });
    it('persists an authorized city cover, keeps proof private and restores upload priority', async () => {
      await discovered();
      await asUser(adminId);
      await db.exec(
        `select public.review_image_candidate('${photo}','permission_granted','Venue owner','','','Written permission for Nagi cover')`,
      );
      expect(
        await scalar<number>(
          `select public.set_catalog_image('${key}','manual','${photo}',0) as value`,
        ),
      ).toBe(1);
      expect(
        await scalar(
          `select image_id::text as value from public.place_image_assignments where city_id is not null`,
        ),
      ).toBe(photo);
      expect(
        await scalar<boolean>(
          `select metadata ? 'rights_evidence' as value from public.external_images where id='${photo}'`,
        ),
      ).toBe(false);
      await fails(
        `select public.set_catalog_image('${key}','manual','${photo}',0)`,
        /image_conflict/,
      );
      await asService();
      await db.exec(
        `update public.cities set cover_image_url='/app/catalog-cover/cities/'||id::text||'/abc00000-0000-4000-8000-000000000099'`,
      );
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
    });
    it('keeps occurrence choices independent from other visits and the planning revision', async () => {
      await discovered();
      await asUser(adminId);
      await db.exec(
        `select public.review_image_candidate('${photo}','permission_granted','Owner','','','Owner authorization')`,
      );
      await asUser();
      await scalar(operation(0, 'add_place', externalAdd(firstItem)));
      await scalar(operation(1, 'add_place', externalAdd(secondItem)));
      const version = await scalar(`select version as value from public.trips where id='${tripA}'`);
      await scalar(
        `select public.set_place_image(null,'${tripA}','${firstItem}','manual','${photo}',0) as value`,
      );
      expect(
        await scalar<number>(
          `select count(*)::int as value from public.place_image_assignments where visit_id='${secondItem}'`,
        ),
      ).toBe(0);
      expect(await scalar(`select version as value from public.trips where id='${tripA}'`)).toBe(
        version,
      );
    });
    it('keeps a reviewed choice unchanged when a stale client tries to refresh', async () => {
      await discovered();
      await asUser(adminId);
      await db.exec(
        `select public.review_image_candidate('${photo}','permission_granted','Owner','','','Owner authorization')`,
      );
      await asService();
      expect((await scalar<{ lease?: string }>(reserve(',p_refresh=>true'))).lease).toBeUndefined();
      expect(
        await scalar(
          `select rights_status as value from public.image_candidates where id='${photo}'`,
        ),
      ).toBe('permission_granted');
      expect(
        await scalar(`select available as value from public.external_images where id='${photo}'`),
      ).toBe(true);
    });
    it('persists an unknown development choice without creating a public image or cover assignment', async () => {
      await discovered();
      expect(
        await scalar(
          `select public.set_image_preview('${adminId}','${key}','manual','${photo}',0) as value`,
        ),
      ).toBe(1);
      const read = () =>
        scalar<Record<string, unknown>>(
          `select development_previews->'${adminId}:global' as value from public.image_galleries where cache_key='${key}'`,
        );
      expect(await read()).toMatchObject({
        mode: 'manual',
        image: photo,
        revision: 1,
        selected_by: adminId,
      });
      expect((await read()).selected_at).toBeTruthy();
      expect(
        await scalar(
          `select rights_status as value from public.image_candidates where id='${photo}'`,
        ),
      ).toBe('unknown');
      expect(
        await scalar<number>('select count(*)::int as value from public.external_images'),
      ).toBe(0);
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
      await asUser();
      await fails('select development_previews from public.image_galleries', /permission denied/);
      await asUser(adminId);
      await fails(
        `select public.set_image_preview('${adminId}','${key}','manual','${photo}',1)`,
        /permission denied/,
      );
      await fails(
        `select public.set_catalog_image('${key}','manual','${photo}',0)`,
        /image_unavailable/,
      );
    });
    it('checks administrator identity, gallery ownership and revision for private previews', async () => {
      await discovered();
      await fails(
        `select public.set_image_preview('${userId}','${key}','manual','${photo}',0)`,
        /image_preview_forbidden/,
      );
      await fails(
        `select public.set_image_preview('${adminId}','${key}','manual','abc00000-0000-4000-8000-000000000099',0)`,
        /image_preview_missing/,
      );
      await scalar(
        `select public.set_image_preview('${adminId}','${key}','manual','${photo}',0) as value`,
      );
      await fails(
        `select public.set_image_preview('${adminId}','${key}','fallback',null,0)`,
        /image_preview_conflict/,
      );
      await scalar(
        `select public.set_image_preview('${adminId}','${key}','published',null,1) as value`,
      );
      expect(
        await scalar(
          `select development_previews->'${adminId}:global'->>'mode' as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBe('published');
    });
    it('keeps development choices separate for administrators and occurrences', async () => {
      await discovered();
      await scalar(
        `select public.set_image_preview('${adminId}','${key}','manual','${photo}',0) as value`,
      );
      await scalar(
        `select public.set_image_preview('${adminId}','${key}','fallback',null,0,'${firstItem}') as value`,
      );
      expect(
        await scalar(
          `select development_previews->'${adminId}:global'->>'mode' as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBe('manual');
      expect(
        await scalar(
          `select development_previews->'${adminId}:${firstItem}'->>'mode' as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBe('fallback');
      expect(
        await scalar(
          `select development_previews ? '${otherId}:global' as value from public.image_galleries where cache_key='${key}'`,
        ),
      ).toBe(false);
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
    });
    it('previews a licensed fallback only when it belongs to the same gallery', async () => {
      const fallback = 'abc00000-0000-4000-8000-000000000088';
      await db.exec(
        `insert into public.external_images(id,provider,source_id,metadata) values('${fallback}','wikimedia','Preview fallback.jpg','{"license":"CC0","licenseUrl":"https://creativecommons.org/publicdomain/zero/1.0/","imageUrl":"https://upload.wikimedia.org/a.jpg","thumbnailUrl":"https://upload.wikimedia.org/a.jpg","sourceUrl":"https://commons.wikimedia.org/wiki/File:a.jpg"}')`,
      );
      await fails(
        `select public.set_image_preview('${adminId}','${key}','manual','${fallback}',0)`,
        /image_preview_missing/,
      );
      await db.exec(
        `insert into public.image_resolution_cache(cache_key,candidates) values('${key}',array['${fallback}'::uuid])`,
      );
      expect(
        await scalar(
          `select public.set_image_preview('${adminId}','${key}','manual','${fallback}',0) as value`,
        ),
      ).toBe(1);
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
    });
  });
  describe('Open photography permissions and independent visit overrides', () => {
    const image = 'abc00000-0000-4000-8000-000000000001';
    beforeEach(async () => {
      await asService();
      await catalogAndDays();
      await db.exec(
        `insert into public.external_images(id,provider,source_id,metadata) values('${image}','wikimedia','Tokyo Tower.jpg','{"license":"CC BY-SA","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0/","imageUrl":"https://upload.wikimedia.org/wikipedia/commons/a/a1/Tower.jpg","thumbnailUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Tower.jpg/320px-Tower.jpg","sourceUrl":"https://commons.wikimedia.org/wiki/File:Tower.jpg"}');`,
      );
      await asUser();
    });
    const choose = (
      visit = firstItem,
      rev = 0,
      mode = 'manual',
      photo: string | null = image,
      trip = tripA,
    ) =>
      `select public.set_place_image(null,'${trip}','${visit}','${mode}',${photo ? `'${photo}'` : 'null'},${rev}) as value`;
    it('only allows administrators to select catalogue photos, and keeps the tables server-written', async () => {
      await fails(
        `select public.set_place_image('${catalogEntry}',null,null,'manual','${image}',0)`,
        /image_forbidden/,
      );
      await fails(`update public.external_images set available=false`, /permission denied/);
      await fails('select * from public.image_resolution_cache', /permission denied/);
      await fails(
        `select public.reserve_image_resolution('${userId}','${'a'.repeat(64)}')`,
        /permission denied/,
      );
      await asUser(adminId);
      expect(
        await scalar<number>(
          `select public.set_place_image('${catalogEntry}',null,null,'manual','${image}',0) as value`,
        ),
      ).toBe(1);
      await db.exec(
        "reset role; set local role anon; set local request.jwt.claim.sub=''; set local request.jwt.claim.role='anon'",
      );
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(1);
      await db.exec(
        `reset role; update public.entries set published=false where id='${catalogEntry}'; set local role anon`,
      );
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
    });
    it('preserves the selected image through nest and detach without updating planner versions on photo selection', async () => {
      await scalar(operation(0, 'add_place', externalAdd(firstItem)));
      await scalar(
        operation(
          1,
          'add_place',
          externalAdd(secondItem, { ...freePlace, title: 'Parent' }, { duration: 120 }),
        ),
      );
      const before = await scalar(
        `select jsonb_build_object('trip',version,'timestamp',updated_at) as value from public.trips where id='${tripA}'`,
      );
      expect(await scalar<number>(choose())).toBe(1);
      expect(
        await scalar(
          `select jsonb_build_object('trip',version,'timestamp',updated_at) as value from public.trips where id='${tripA}'`,
        ),
      ).toEqual(before);
      await scalar(operation(2, 'nest_item', { id: firstItem, parent: secondItem }));
      expect(
        await scalar<string>(
          `select image_id::text as value from public.place_image_assignments where visit_id='${firstItem}'`,
        ),
      ).toBe(image);
      await scalar(
        operation(3, 'relocate_stop', { kind: 'activity', id: firstItem, day: null, before: null }),
      );
      expect(
        await scalar<boolean>(
          `select public.can_read_image_visit('${tripA}','${firstItem}') as value`,
        ),
      ).toBe(true);
      expect(
        await scalar<string>(
          `select image_id::text as value from public.place_image_assignments where visit_id='${firstItem}'`,
        ),
      ).toBe(image);
      expect(
        await scalar<number>(
          'select count(*)::int as value from public.place_image_assignments where entry_id is not null',
        ),
      ).toBe(0);
    });
    it('isolates trips, rejects missing visits, expired membership and editors without collaboration rights', async () => {
      await scalar(operation(0, 'add_place', externalAdd(firstItem)));
      await fails(choose(stopOne), /image_forbidden/);
      await asUser(adminId);
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
      await fails(choose(), /image_forbidden/);
      await db.exec(
        `reset role; update public.trips set collaboration_mode='organizers_only' where id='${tripA}'`,
      );
      await asUser(otherId);
      await fails(choose(), /image_forbidden/);
      await db.exec(
        `reset role; update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${userId}'`,
      );
      await asUser();
      await fails(choose(), /image_forbidden/);
    });
    it('uses separate photo revisions for concurrent edits, and supports automatic and icon modes', async () => {
      await scalar(operation(0, 'add_place', externalAdd(firstItem)));
      await scalar<number>(choose());
      await fails(choose(), /image_conflict/);
      expect(await scalar<number>(choose(firstItem, 1, 'fallback', null))).toBe(2);
      expect(await scalar<number>(choose(firstItem, 2, 'automatic', null))).toBe(3);
      await fails(choose(firstItem, 3, 'manual', null), /image_mode_invalid/);
      await db.exec(
        `reset role; update public.external_images set available=false where id='${image}'`,
      );
      await asUser();
      await fails(choose(firstItem, 3), /image_unavailable/);
    });
    it('returns priority to a newly uploaded cover without deleting open photo metadata', async () => {
      await asUser(adminId);
      await scalar(
        `select public.set_place_image('${catalogEntry}',null,null,'manual','${image}',0) as value`,
      );
      await asService();
      await db.exec(
        `update public.entries set cover_image_url='/app/entry-media/${catalogEntry}/abc00000-0000-4000-8000-000000000002/abc00000-0000-4000-8000-000000000003' where id='${catalogEntry}'`,
      );
      expect(
        await scalar<number>('select count(*)::int as value from public.place_image_assignments'),
      ).toBe(0);
      expect(
        await scalar<number>('select count(*)::int as value from public.external_images'),
      ).toBe(1);
    });
    it('leases cache misses once, caps global concurrency and reuses positive/negative cache entries', async () => {
      await asService();
      expect(
        await scalar<string>(
          `select public.reserve_image_resolution('${userId}','${'a'.repeat(64)}') as value`,
        ),
      ).toMatch(/[a-f0-9-]{36}/);
      expect(
        await scalar(
          `select public.reserve_image_resolution('${userId}','${'a'.repeat(64)}') as value`,
        ),
      ).toBeNull();
      // Coordinates from a newly signed retrieve may improve a suggestion's
      // ambiguous result, while an existing lease still deduplicates the job.
      expect(
        await scalar(
          `select public.reserve_image_resolution('${userId}','${'a'.repeat(64)}',false,true) as value`,
        ),
      ).toBeNull();
      await scalar(
        `select public.reserve_image_resolution('${otherId}','${'b'.repeat(64)}') as value`,
      );
      expect(
        await scalar(
          `select public.reserve_image_resolution('${userId}','${'c'.repeat(64)}') as value`,
        ),
      ).toBeNull();
      await db.exec(
        `update public.image_resolution_cache set expires_at=now()+interval '1 day',lease_until=null,lease_id=null where cache_key='${'a'.repeat(64)}'`,
      );
      expect(
        await scalar(
          `select public.reserve_image_resolution('${userId}','${'a'.repeat(64)}') as value`,
        ),
      ).toBeNull();
      expect(
        await scalar<string>(
          `select public.reserve_image_resolution('${userId}','${'a'.repeat(64)}',false,true) as value`,
        ),
      ).toMatch(/[a-f0-9-]{36}/);
    });
  });
  it('creates custom visits without any catalog destination and retains idempotency after deletion', async () => {
    await asUser();
    const add = externalAdd();
    expect(await scalar<number>(operation(0, 'add_place', add))).toBe(1);
    expect(
      await scalar(
        `select jsonb_build_object('source',source,'entry',entry_id,'title',custom_title,'notes',notes,'color',calendar_color) as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toEqual({
      source: 'custom',
      entry: null,
      title: 'Temps libre',
      notes: 'Notes du groupe',
      color: '#739FD0',
    });
    expect(await scalar<number>(operation(0, 'add_place', add))).toBe(1);
    expect(await scalar<number>(`select count(*)::integer as value from public.entries`)).toBe(0);
    await scalar(operation(1, 'delete_item', { id: firstItem }));
    expect(await scalar<number>(operation(0, 'add_place', add))).toBe(2);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(0);
  });
  it('accepts only recently verified Mapbox IDs, never imports catalog data and allows independent repeated visits', async () => {
    await asUser();
    const place = { source: 'mapbox', placeId: 'mapbox-place-example', query: 'My search' };
    await fails(operation(0, 'add_place', externalAdd(firstItem, place)), /trip_mapbox_unverified/);
    await fails(
      `select public.mapbox_place_reference('${userId}','mapbox-place-example','My search')`,
      /permission denied/,
    );
    await asService();
    await db.exec(
      `select public.mapbox_place_reference('${userId}','mapbox-place-example','My search')`,
    );
    await asUser();
    await scalar(operation(0, 'add_place', externalAdd(firstItem, place)));
    await scalar(operation(1, 'add_place', externalAdd(secondItem, place)));
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where external_place_id='mapbox-place-example'`,
      ),
    ).toBe(2);
    expect(await scalar<number>(`select count(*)::integer as value from public.entries`)).toBe(0);
    expect(await scalar<number>(`select count(*)::integer as value from public.countries`)).toBe(0);
    await db.exec(
      `reset role; update private.mapbox_place_references set verified_at=now()-interval '2 days'`,
    );
    await asUser();
    await fails(operation(2, 'add_place', externalAdd(stopThree, place)), /trip_mapbox_unverified/);
  });
  it('binds verified Mapbox IDs to the actor and original query, retaining references through nesting and detachment', async () => {
    const place = {
      source: 'mapbox',
      placeId: 'shared-mapbox-reference',
      query: 'My original search',
    };
    await asService();
    await db.exec(
      `select public.mapbox_place_reference('${userId}','shared-mapbox-reference','My original search')`,
    );
    await asUser(otherId);
    await fails(operation(0, 'add_place', externalAdd(firstItem, place)), /trip_mapbox_unverified/);
    await asUser();
    await fails(
      operation(0, 'add_place', externalAdd(firstItem, { ...place, query: 'Different search' })),
      /trip_mapbox_unverified/,
    );
    await scalar(operation(0, 'add_place', externalAdd(firstItem, place)));
    await scalar(operation(1, 'add_place', externalAdd(secondItem, freePlace)));
    await scalar(operation(2, 'nest_item', { id: firstItem, parent: secondItem }));
    expect(
      await scalar(
        `select jsonb_build_object('id',id,'source',source,'reference',external_place_id,'query',external_query,'notes',notes,'color',calendar_color) as value from public.trip_item_stops where id='${firstItem}'`,
      ),
    ).toEqual({
      id: firstItem,
      source: 'mapbox',
      reference: place.placeId,
      query: place.query,
      notes: 'Notes du groupe',
      color: '#739FD0',
    });
    await scalar(
      operation(3, 'relocate_stop', { kind: 'activity', id: firstItem, day: null, before: null }),
    );
    expect(
      await scalar(`select external_query as value from public.trip_items where id='${firstItem}'`),
    ).toBe(place.query);
    await asUser(adminId);
    expect(
      await scalar(
        `select count(*)::integer as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(0);
    await fails(
      operation(4, 'replace_place', { id: firstItem, place: freePlace }),
      /trip_forbidden/,
    );
  });
  it('keeps simultaneous query grants for the same member and place independent across tabs', async () => {
    await asService();
    await db.exec(
      `select public.mapbox_place_reference('${userId}','same-place-reference','First search');select public.mapbox_place_reference('${userId}','same-place-reference','Second search')`,
    );
    await asUser();
    await scalar(
      operation(
        0,
        'add_place',
        externalAdd(firstItem, {
          source: 'mapbox',
          placeId: 'same-place-reference',
          query: 'First search',
        }),
      ),
    );
    await scalar(
      operation(
        1,
        'add_place',
        externalAdd(secondItem, {
          source: 'mapbox',
          placeId: 'same-place-reference',
          query: 'Second search',
        }),
      ),
    );
    expect(await scalar('select count(*)::integer as value from public.trip_items')).toBe(2);
  });
  it('blocks proof-based grants when the administrator disables Mapbox', async () => {
    await asUser(adminId);
    await scalar('select public.mapbox_admin(false) as value');
    await asService();
    await fails(
      `select public.mapbox_place_reference('${userId}','a-mapbox-reference','User search')`,
      /mapbox_disabled/,
    );
  });
  it('caps optional Details monthly without preventing basic search', async () => {
    await asService();
    await db.exec(`select public.reserve_mapbox_places('${userId}','details',100,100,100,1)`);
    await fails(
      `select public.reserve_mapbox_places('${userId}','details',100,100,100,1)`,
      /mapbox_quota/,
    );
    await db.exec(`select public.reserve_mapbox_places('${userId}','forward',100,100,100,1)`);
  });
  it('preserves all custom source metadata through nesting, transfer and detachment', async () => {
    await asUser();
    await scalar(operation(0, 'add_place', externalAdd()));
    await scalar(
      operation(
        1,
        'add_place',
        externalAdd(secondItem, { ...freePlace, title: 'Centre commercial' }),
      ),
    );
    await scalar(operation(2, 'nest_item', { id: firstItem, parent: secondItem }));
    expect(
      await scalar(
        `select jsonb_build_object('source',source,'title',custom_title,'location',custom_location,'notes',notes,'color',calendar_color) as value from public.trip_item_stops where id='${firstItem}'`,
      ),
    ).toEqual({
      source: 'custom',
      title: 'Temps libre',
      location: 'Rendez-vous devant le logement',
      notes: 'Notes du groupe',
      color: '#739FD0',
    });
    await scalar(
      operation(3, 'relocate_stop', { kind: 'activity', id: firstItem, day: null, before: null }),
    );
    expect(
      await scalar(`select source::text as value from public.trip_items where id='${firstItem}'`),
    ).toBe('custom');
    expect(
      await scalar(`select custom_title as value from public.trip_items where id='${firstItem}'`),
    ).toBe('Temps libre');
    expect(
      await scalar(`select notes as value from public.trip_items where id='${firstItem}'`),
    ).toBe('Notes du groupe');
  });
  it('enforces coherent source combinations even for privileged writes', async () => {
    await asService();
    await fails(
      `insert into public.trip_items(trip_id,source) values('${tripA}','mapbox')`,
      /trip_items_place_source/,
    );
    await fails(
      `insert into public.trip_items(trip_id,source) values('${tripA}','custom')`,
      /trip_items_place_source/,
    );
    await fails(
      `insert into public.trip_items(trip_id,source,custom_title,custom_latitude) values('${tripA}','custom','Pause',35)`,
      /trip_items_place_source/,
    );
    await fails(
      `insert into public.trip_items(trip_id,source,custom_title,external_place_id) values('${tripA}','custom','Pause','mapbox-place-example')`,
      /trip_items_place_source/,
    );
  });
  it('stores full long Mapbox IDs without btree-size failures or truncation', async () => {
    const longId = Array.from({ length: 128 }, () => crypto.randomUUID().replaceAll('-', '')).join(
      '',
    );
    await asService();
    await db.exec(`select public.mapbox_place_reference('${userId}','${longId}','My search')`);
    await asUser();
    await scalar(
      operation(
        0,
        'add_place',
        externalAdd(firstItem, { source: 'mapbox', placeId: longId, query: 'My search' }),
      ),
    );
    expect(
      await scalar(
        `select external_place_id as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(longId);
  });
  it('meters native autocomplete and thematic search separately without exposing private counters', async () => {
    await asService();
    await db.exec(
      `select public.reserve_mapbox_places('${userId}','suggest',150,2000,20,900);select public.reserve_mapbox_places('${userId}','forward',150,2000,20,900);`,
    );
    await asUser(adminId);
    const state = await scalar<{ today: Record<string, number> }>(
      `select public.mapbox_admin(null) as value`,
    );
    expect(state.today.suggest).toBe(1);
    expect(state.today.forward).toBe(1);
    expect(state.today.details).toBeUndefined();
  });
  it('keeps replacement separate from planning data and emits source-only journal changes without null catalog IDs', async () => {
    await asUser();
    await scalar(operation(0, 'add_place', externalAdd()));
    await scalar(
      operation(1, 'replace_place', {
        id: firstItem,
        place: { ...freePlace, title: 'Retrouver des amis' },
      }),
    );
    expect(
      await scalar(
        `select jsonb_build_object('notes',notes,'duration',estimated_duration_minutes,'color',calendar_color,'title',custom_title) as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toEqual({
      notes: 'Notes du groupe',
      duration: 30,
      color: '#739FD0',
      title: 'Retrouver des amis',
    });
    const batch = await scalar<{ events: { entry_ids: unknown[] }[] }>(
      `select public.read_trip_changes('${guildA}','${tripA}',0) as value`,
    );
    expect(batch.events.every((event) => event.entry_ids.length === 0)).toBe(true);
    await asUser(adminId);
    await fails(
      operation(2, 'replace_place', { id: firstItem, place: freePlace }),
      /trip_forbidden/,
    );
  });
  it('requires server privileges for Mapbox budgets and records atomic rate limits and admin switches', async () => {
    await asUser();
    await fails(
      `select public.reserve_mapbox_places('${userId}','suggest',2,10,2,900)`,
      /permission denied/,
    );
    await fails(`select public.mapbox_admin(false)`, /forbidden/);
    await asService();
    await db.exec(`select public.reserve_mapbox_places('${userId}','suggest',2,10,2,900)`);
    await db.exec(`select public.reserve_mapbox_places('${userId}','forward',2,10,2,900)`);
    await fails(
      `select public.reserve_mapbox_places('${userId}','retrieve',2,10,2,900)`,
      /mapbox_quota/,
    );
    await asUser(adminId);
    const stats = await scalar<{ today: Record<string, number> }>(
      `select public.mapbox_admin(null) as value`,
    );
    expect(stats.today).toEqual({ suggest: 1, forward: 1 });
    await scalar(`select public.mapbox_admin(false) as value`);
    await asService();
    await fails(
      `select public.reserve_mapbox_places('${userId}','suggest',20,100,20,900)`,
      /mapbox_disabled/,
    );
  });

  const queued = (
    id: number,
    change: Record<string, unknown>,
    expected: Record<string, unknown> = {},
    base = 2,
    guild = guildA,
    trip = tripA,
  ) =>
    `select public.mutate_trip_plan('${guild}','${trip}','${JSON.stringify({ id: `${id.toString(16).padStart(8, '0')}-8888-4888-8888-888888888888`, base, change, expected: { items: {}, stops: {}, days: {}, ...expected } }).replaceAll("'", "''")}') as value`;
  const changes = (after: number) =>
    `select public.read_trip_changes('${guildA}','${tripA}',${after}) as value`;

  it('creates repeated visits atomically at exact anchors with independent state and replay receipts', async () => {
    await activityFixture();
    const create = queued(71, {
      operation: 'add_item',
      data: {
        id: secondItem,
        entry: catalogEntry,
        day: dayOne,
        before: firstItem,
        start_time: null,
        duration: null,
      },
    });
    const batch = await scalar<TripSyncBatch>(create);
    const row = batch.events
      .flatMap((e) => e.changes.items.upsert)
      .find((i) => i.id === secondItem)!;
    expect(row.start_time).toBeNull();
    expect(row.sort_order).toBeLessThan(
      await scalar<number>(
        `select sort_order as value from public.trip_items where id='${firstItem}'`,
      ),
    );
    expect((await scalar<TripSyncBatch>(create)).version).toBe(batch.version);
    await scalar(
      queued(72, {
        operation: 'add_stop',
        data: { id: stopTwo, entry: stopEntry, parent: firstItem, before: stopOne, duration: 20 },
      }),
    );
    await scalar(
      queued(73, {
        operation: 'add_stop',
        data: { id: stopThree, entry: stopEntry, parent: firstItem, before: stopOne, duration: 15 },
      }),
    );
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_item_stops where entry_id='${stopEntry}'`,
      ),
    ).toBe(3);
    const ordered = await db.query<{ id: string }>(
      `select id from public.trip_item_stops where trip_item_id='${firstItem}' order by sort_order`,
    );
    expect(ordered.rows.map((r) => r.id)).toEqual([stopTwo, stopThree, stopOne]);
    await scalar(
      queued(
        74,
        {
          operation: 'patch_item',
          data: { id: secondItem, patch: { notes: 'Repeat only', calendar_color: '#73A6DF' } },
        },
        { items: { [secondItem]: { notes: '', calendar_color: null } } },
      ),
    );
    expect(
      await scalar<string>(`select notes as value from public.trip_items where id='${firstItem}'`),
    ).not.toBe('Repeat only');
    await scalar(queued(75, { operation: 'delete_item', data: { id: secondItem } }));
    await scalar(create);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_items where id='${secondItem}'`,
      ),
    ).toBe(0);
    await fails(
      queued(76, {
        operation: 'add_item',
        data: { id: plannedTrip, entry: catalogEntry, day: dayOne, before: stopOne },
      }),
      /trip_conflict/,
    );
    await db.exec(
      `reset role; update public.trips set collaboration_mode='organizers_only' where id='${tripA}'`,
    );
    await asUser(otherId);
    await fails(
      queued(77, {
        operation: 'add_item',
        data: { id: secondItem, entry: catalogEntry, day: dayOne },
      }),
      /trip_forbidden/,
    );
  });

  it('merges compatible property edits from two actors and rejects an overwritten property', async () => {
    await activityFixture();
    const color = queued(
      1,
      { operation: 'patch_item', data: { id: firstItem, patch: { calendar_color: '#73A6DF' } } },
      { items: { [firstItem]: { calendar_color: null } } },
    );
    const first = await scalar<TripSyncBatch>(color);
    expect(tripSyncBatchSchema.parse(first).events[0]?.changes.items.patch[0]).toMatchObject({
      id: firstItem,
      calendar_color: '#73A6DF',
    });
    expect(first.events[0]?.changes.items.upsert).toHaveLength(0);
    expect(first.events[0]?.changes.items.patch[0]).not.toHaveProperty('notes');
    await db.exec('reset role');
    await asUser(otherId);
    const note = await scalar<TripSyncBatch>(
      queued(
        2,
        { operation: 'patch_item', data: { id: firstItem, patch: { notes: 'Billet réservé' } } },
        { items: { [firstItem]: { notes: '' } } },
      ),
    );
    expect(note.version).toBe(4);
    expect(
      await scalar(`select calendar_color as value from public.trip_items where id='${firstItem}'`),
    ).toBe('#73A6DF');
    await fails(
      queued(
        3,
        { operation: 'patch_item', data: { id: firstItem, patch: { calendar_color: '#A28BC9' } } },
        { items: { [firstItem]: { calendar_color: null } } },
      ),
      /trip_conflict/,
    );
    await db.exec('reset role');
    await asUser();
    expect((await scalar<TripSyncBatch>(color)).version).toBe(4);
    expect(
      await scalar(`select version as value from public.trip_items where id='${firstItem}'`),
    ).toBe(2);
    await fails(
      queued(
        1,
        { operation: 'patch_item', data: { id: firstItem, patch: { calendar_color: '#FFFFFF' } } },
        { items: { [firstItem]: { calendar_color: null } } },
      ),
      /trip_mutation_mismatch/,
    );
    expect((await scalar<TripSyncBatch>(changes(4))).events).toHaveLength(0);
  });

  it('requires precise guards, rejects sensitive patches and isolates journal reads and writes', async () => {
    await activityFixture();
    await fails(
      queued(10, { operation: 'patch_item', data: { id: firstItem, patch: { notes: 'Unsafe' } } }),
      /trip_patch_invalid/,
    );
    await fails(
      queued(
        11,
        { operation: 'patch_item', data: { id: firstItem, patch: { trip_id: tripB } } },
        { items: { [firstItem]: { trip_id: tripA } } },
      ),
      /trip_patch_invalid/,
    );
    await fails(
      queued(
        12,
        { operation: 'patch_item', data: { id: firstItem, patch: { calendar_color: 'red' } } },
        { items: { [firstItem]: { calendar_color: null } } },
      ),
      /check constraint/,
    );
    await fails(`select * from private.trip_plan_events`, /permission denied/);
    await fails(`select * from private.trip_mutation_receipts`, /permission denied/);
    await db.exec('reset role');
    await asUser(adminId);
    await fails(changes(0), /trip_forbidden/);
    await fails(
      queued(13, { operation: 'delete_item', data: { id: firstItem } }),
      /trip_forbidden/,
    );
    await db.exec('reset role');
    await asUser();
    await fails(
      queued(14, { operation: 'delete_item', data: { id: firstItem } }, {}, 2, guildB, tripA),
      /trip_forbidden/,
    );
    await db.exec('reset role');
    await db.exec(
      `update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${userId}'`,
    );
    await asUser();
    await fails(changes(2), /trip_forbidden/);
    await fails(
      queued(15, { operation: 'delete_item', data: { id: firstItem } }),
      /trip_forbidden/,
    );
  });

  it('replays structural mutations exactly once and returns only affected rows', async () => {
    await activityFixture();
    const move = queued(
      20,
      { operation: 'move_item', data: { id: firstItem, day: dayTwo, before: null } },
      { items: { [firstItem]: { trip_day_id: dayOne, sort_order: 1024 } } },
    );
    const moved = await scalar<TripSyncBatch>(move);
    expect(moved.events).toHaveLength(1);
    expect(moved.events[0]?.changes.items.patch).toHaveLength(1);
    expect(moved.events[0]?.changes.stops.patch).toHaveLength(0);
    expect((await scalar<TripSyncBatch>(move)).version).toBe(3);
    const remove = queued(
      21,
      { operation: 'delete_item', data: { id: firstItem } },
      {
        items: { [firstItem]: { trip_day_id: dayTwo } },
        stops: { [stopOne]: { trip_item_id: firstItem } },
      },
      3,
    );
    expect((await scalar<TripSyncBatch>(remove)).events[0]?.changes.items.remove).toEqual([
      firstItem,
    ]);
    expect((await scalar<TripSyncBatch>(remove)).version).toBe(4);
    expect(await scalar(`select count(*)::int as value from public.trip_item_stops`)).toBe(0);
    const add = queued(
      22,
      {
        operation: 'add_item',
        data: { id: secondItem, entry: catalogEntry, day: dayOne, repeat: true },
      },
      {},
      4,
    );
    const inserted = await scalar<TripSyncBatch>(add);
    expect(inserted.events[0]?.changes.items.upsert[0]?.id).toBe(secondItem);
    expect(inserted.events[0]?.entry_ids).toEqual([catalogEntry]);
    expect((await scalar<TripSyncBatch>(add)).version).toBe(5);
  });

  it('preserves client day IDs, recovers journal gaps and keeps lifetime idempotency receipts', async () => {
    await activityFixture();
    const day = queued(30, {
      operation: 'add_day',
      data: { id: plannedTrip, title: 'Promenade', date: null },
    });
    expect((await scalar<TripSyncBatch>(day)).events[0]?.changes.days.upsert[0]?.id).toBe(
      plannedTrip,
    );
    await db.exec('reset role');
    await db.exec(`delete from private.trip_plan_events where trip_id='${tripA}'`);
    await asUser();
    expect((await scalar<TripSyncBatch>(changes(2))).reset).toBe(true);
    expect((await scalar<TripSyncBatch>(day)).version).toBe(3);
    expect(
      await scalar(`select count(*)::int as value from public.trip_days where id='${plannedTrip}'`),
    ).toBe(1);
  });

  it('bounds replay to 1000 revisions and returns an empty snapshot request beyond that boundary', async () => {
    await db.exec(
      `do $$ begin for n in 1..1001 loop update public.trips set updated_at=clock_timestamp() where id='${tripA}'; end loop; end $$;`,
    );
    await asUser();
    const old = await scalar<TripSyncBatch>(changes(0));
    expect(old.reset).toBe(true);
    expect(old.events).toEqual([]);
    const boundary = tripSyncBatchSchema.parse(await scalar(changes(1)));
    expect(boundary.reset).toBe(false);
    expect(boundary.events).toHaveLength(1000);
  });

  it('protects destructive confirmations from children added by another member meanwhile', async () => {
    await activityFixture();
    await db.exec('reset role');
    await asUser(otherId);
    await scalar(
      operation(2, 'add_stop', {
        id: stopTwo,
        parent: firstItem,
        entry: stopEntry,
        repeat: true,
        duration: 20,
      }),
    );
    await db.exec('reset role');
    await asUser();
    await fails(
      queued(
        40,
        { operation: 'delete_item', data: { id: firstItem } },
        {
          items: { [firstItem]: { trip_day_id: dayOne } },
          stops: { [stopOne]: { trip_item_id: firstItem } },
        },
      ),
      /trip_conflict/,
    );
    expect(
      await scalar(
        `select count(*)::int as value from public.trip_item_stops where trip_item_id='${firstItem}'`,
      ),
    ).toBe(2);
    await scalar(
      operation(3, 'add_item', { id: secondItem, entry: catalogEntry, day: dayOne, repeat: true }),
    );
    await fails(
      queued(
        41,
        { operation: 'delete_day', data: { id: dayOne, day: null } },
        { days: { [dayOne]: { date: null } }, items: { [firstItem]: { trip_day_id: dayOne } } },
      ),
      /trip_conflict/,
    );
    expect(
      await scalar(
        `select count(*)::int as value from public.trip_items where trip_day_id='${dayOne}'`,
      ),
    ).toBe(2);
  });

  it('keeps personal palettes private, normalizes duplicates and does not grant direct palette writes', async () => {
    await asUser();
    const saved = await scalar<{ id: string; hex_color: string }>(
      "select public.save_user_calendar_color('#d98fa6') as value",
    );
    expect(saved.hex_color).toBe('#D98FA6');
    expect(
      (await scalar<{ id: string }>("select public.save_user_calendar_color('#D98FA6') as value"))
        .id,
    ).toBe(saved.id);
    expect(
      await scalar<number>('select count(*)::int as value from public.user_calendar_colors'),
    ).toBe(1);
    await fails(
      `insert into public.user_calendar_colors(user_id,hex_color) values('${userId}','#000000')`,
      /permission denied/i,
    );
    await fails(
      "select public.save_user_calendar_color('var(--primary)')",
      /calendar_color_invalid/,
    );
    await db.exec('reset role');
    await asUser(otherId);
    expect(
      await scalar<number>('select count(*)::int as value from public.user_calendar_colors'),
    ).toBe(0);
    await db.exec(`delete from public.user_calendar_colors where id='${saved.id}'`);
    await scalar("select public.save_user_calendar_color('#D98FA6') as value");
    await db.exec('reset role');
    await asUser();
    expect(
      await scalar<number>('select count(*)::int as value from public.user_calendar_colors'),
    ).toBe(1);
    await db.exec('reset role; set local role anon');
    await fails('select * from public.user_calendar_colors', /permission denied/i);
    await fails("select public.save_user_calendar_color('#000000')", /permission denied/i);
  });
  it('limits a personal palette to 32 colors while keeping reusing an existing color idempotent', async () => {
    await asUser();
    for (let i = 0; i < 32; i++)
      await scalar(
        `select public.save_user_calendar_color('#${i.toString(16).padStart(6, '0').toUpperCase()}') as value`,
      );
    await fails("select public.save_user_calendar_color('#FFFFFF')", /calendar_palette_full/);
    await scalar("select public.save_user_calendar_color('#000000') as value");
    expect(
      await scalar<number>('select count(*)::int as value from public.user_calendar_colors'),
    ).toBe(32);
  });
  it('shares occurrence colors without sharing the palette or changing notes, duration and included stops', async () => {
    await activityFixture();
    const saved = await scalar<{ id: string }>(
      "select public.save_user_calendar_color('#D98FA6') as value",
    );
    expect(
      await scalar<number>(
        operation(2, 'color_item', { id: firstItem, item_version: 0, color: '#D98FA6' }),
      ),
    ).toBe(3);
    expect(
      await scalar<string>(
        `select calendar_color as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe('#D98FA6');
    expect(
      await scalar<number>(
        `select estimated_duration_minutes as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(120);
    expect(
      await scalar<number>(
        `select duration_minutes as value from public.trip_item_stops where id='${stopOne}'`,
      ),
    ).toBe(40);
    await db.exec(`delete from public.user_calendar_colors where id='${saved.id}'`);
    expect(
      await scalar<string>(
        `select calendar_color as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe('#D98FA6');
    await fails(
      operation(2, 'color_item', { id: firstItem, item_version: 1, color: '#69AA91' }),
      /trip_conflict/,
    );
    await fails(
      operation(3, 'color_item', { id: firstItem, item_version: 0, color: '#69AA91' }),
      /trip_conflict/,
    );
    await fails(
      operation(3, 'color_item', { id: firstItem, item_version: 1, color: 'red' }),
      /calendar_color_invalid/,
    );
    await db.exec('reset role');
    await asUser(otherId);
    expect(
      await scalar<string>(
        `select calendar_color as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe('#D98FA6');
    expect(
      await scalar<number>('select count(*)::int as value from public.user_calendar_colors'),
    ).toBe(0);
    await fails(
      operation(3, 'color_item', { id: firstItem, item_version: 1, color: '#69AA91' }, guildB),
      /trip_forbidden/,
    );
    await db.exec(
      `reset role; update public.trips set collaboration_mode='organizers_only' where id='${tripA}'`,
    );
    const version = await scalar<number>(
      `select version as value from public.trips where id='${tripA}'`,
    );
    await asUser(otherId);
    await fails(
      operation(version, 'color_item', { id: firstItem, item_version: 1, color: '#69AA91' }),
      /trip_forbidden/,
    );
    await db.exec('reset role');
    await asUser();
    await scalar(operation(version, 'color_item', { id: firstItem, item_version: 1, color: null }));
    expect(
      await scalar<string | null>(
        `select calendar_color as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBeNull();
  });
  it('preserves an occurrence color through nesting, detaching and relocation without extra version increments', async () => {
    await activityFixture();
    await scalar(operation(2, 'delete_stop', { id: stopOne }));
    await scalar(
      operation(3, 'add_item', {
        id: secondItem,
        entry: stopEntry,
        day: dayTwo,
        repeat: false,
        duration: 30,
      }),
    );
    await scalar(operation(4, 'color_item', { id: secondItem, item_version: 0, color: '#A28BC9' }));
    await scalar(operation(5, 'nest_item', { id: secondItem, parent: firstItem }));
    expect(
      await scalar<string>(
        `select calendar_color as value from public.trip_item_stops where id='${secondItem}'`,
      ),
    ).toBe('#A28BC9');
    expect(
      await scalar<number>(
        `select version as value from public.trip_item_stops where id='${secondItem}'`,
      ),
    ).toBe(1);
    await scalar(operation(6, 'detach_stop', { id: secondItem }));
    expect(
      await scalar<string>(
        `select calendar_color as value from public.trip_items where id='${secondItem}'`,
      ),
    ).toBe('#A28BC9');
    await scalar(operation(7, 'nest_item', { id: secondItem, parent: firstItem }));
    await scalar(
      operation(8, 'relocate_stop', {
        kind: 'activity',
        id: secondItem,
        day: dayTwo,
        before: null,
      }),
    );
    expect(
      await scalar<string>(
        `select calendar_color as value from public.trip_items where id='${secondItem}'`,
      ),
    ).toBe('#A28BC9');
  });

  it('atomically nests an existing activity with its identity, notes, author and clock duration intact', async () => {
    await activityFixture();
    await scalar(operation(2, 'delete_stop', { id: stopOne }));
    await scalar(
      operation(3, 'add_item', {
        id: secondItem,
        entry: stopEntry,
        day: dayTwo,
        repeat: false,
        duration: 20,
      }),
    );
    await scalar(
      operation(4, 'edit_item', {
        id: secondItem,
        item_version: 0,
        start_time: '10:00',
        end_time: '10:45',
        duration: 20,
        notes: 'Billet Nintendo · étage 6',
      }),
    );
    const original = await scalar(
      `select jsonb_build_object('author',added_by,'created',created_at,'version',version) as value from public.trip_items where id='${secondItem}'`,
    );
    expect(
      await scalar<number>(operation(5, 'nest_item', { id: secondItem, parent: firstItem })),
    ).toBe(6);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where trip_id='${tripA}'`,
      ),
    ).toBe(1);
    expect(
      await scalar(
        `select jsonb_build_object('author',added_by,'created',created_at,'version',version) as value from public.trip_item_stops where id='${secondItem}'`,
      ),
    ).toEqual(original);
    expect(
      await scalar(
        `select jsonb_build_object('parent',trip_item_id,'notes',notes,'duration',duration_minutes) as value from public.trip_item_stops where id='${secondItem}'`,
      ),
    ).toEqual({ parent: firstItem, notes: 'Billet Nintendo · étage 6', duration: 45 });
    expect(
      await scalar<number>(
        `select estimated_duration_minutes as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(120);
    await fails(operation(5, 'nest_item', { id: secondItem, parent: firstItem }), /trip_conflict/);
    // Retrying the original insertion must not recreate a root alongside the stop.
    expect(
      await scalar<number>(
        operation(0, 'add_item', { id: secondItem, entry: stopEntry, day: dayTwo, repeat: false }),
      ),
    ).toBe(6);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where id='${secondItem}'`,
      ),
    ).toBe(0);
    await scalar(operation(6, 'detach_stop', { id: secondItem }));
    expect(
      await scalar(
        `select jsonb_build_object('day',trip_day_id,'time',start_time,'duration',estimated_duration_minutes,'notes',notes) as value from public.trip_items where id='${secondItem}'`,
      ),
    ).toEqual({ day: dayOne, time: '14:00:00', duration: 45, notes: 'Billet Nintendo · étage 6' });
  });

  it('allows repeated places while rejecting self, nested groups and another trip', async () => {
    await activityFixture();
    await scalar(
      operation(2, 'add_item', { id: secondItem, entry: stopEntry, day: dayOne, repeat: false }),
    );
    await acceptsWithoutChanges(operation(3, 'nest_item', { id: secondItem, parent: firstItem }));
    await fails(operation(3, 'nest_item', { id: firstItem, parent: firstItem }), /trip_stop_self/);
    await fails(
      operation(3, 'nest_item', { id: firstItem, parent: secondItem }),
      /trip_activity_has_stops/,
    );
    await fails(
      operation(3, 'nest_item', { id: secondItem, parent: stopOne }),
      /trip_activity_missing/,
    );
    await db.exec('reset role');
    await db.exec(
      `insert into public.trip_items(id,trip_id,entry_id) values('${stopThree}','${tripB}','${catalogEntry}')`,
    );
    await asUser();
    await fails(
      operation(3, 'nest_item', { id: secondItem, parent: stopThree }),
      /trip_activity_missing/,
    );
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where trip_id='${tripA}'`,
      ),
    ).toBe(2);
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(1);
    await fails(
      `select private.edit_trip_plan_stops('${guildA}','${tripA}',3,'delete_item','{"id":"${firstItem}"}')`,
      /permission denied/,
    );
  });

  it('applies the same membership and organizer rules to activity nesting', async () => {
    await activityFixture();
    await scalar(operation(2, 'delete_stop', { id: stopOne }));
    await scalar(
      operation(3, 'add_item', { id: secondItem, entry: stopEntry, day: dayTwo, repeat: false }),
    );
    await asUser(adminId);
    await fails(operation(4, 'nest_item', { id: secondItem, parent: firstItem }), /trip_forbidden/);
    await db.exec(
      `reset role; update public.trips set collaboration_mode='organizers_only' where id='${tripA}'`,
    );
    await asUser(otherId);
    await fails(operation(5, 'nest_item', { id: secondItem, parent: firstItem }), /trip_forbidden/);
    await asUser();
    expect(
      await scalar<number>(operation(5, 'nest_item', { id: secondItem, parent: firstItem })),
    ).toBe(6);
  });

  it('transfers a stop to another activity without changing its identity, notes, duration or author', async () => {
    await activityFixture();
    await scalar(
      operation(2, 'edit_stop', {
        id: stopOne,
        stop_version: 0,
        duration: 50,
        notes: 'Billet Nintendo',
      }),
    );
    await scalar(
      operation(3, 'add_item', {
        id: secondItem,
        entry: catalogEntry,
        day: dayTwo,
        repeat: true,
        start_time: '16:00',
        duration: 90,
      }),
    );
    const before = await scalar(
      `select jsonb_build_object('id',id,'entry',entry_id,'author',added_by,'created',created_at,'notes',notes,'duration',duration_minutes) as value from public.trip_item_stops where id='${stopOne}'`,
    );
    expect(
      await scalar<number>(
        operation(4, 'relocate_stop', {
          kind: 'stop',
          id: stopOne,
          parent: secondItem,
          before: null,
        }),
      ),
    ).toBe(5);
    expect(
      await scalar(
        `select jsonb_build_object('id',id,'entry',entry_id,'author',added_by,'created',created_at,'notes',notes,'duration',duration_minutes) as value from public.trip_item_stops where id='${stopOne}'`,
      ),
    ).toEqual(before);
    expect(
      await scalar(
        `select trip_item_id as value from public.trip_item_stops where id='${stopOne}'`,
      ),
    ).toBe(secondItem);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_item_stops where trip_item_id='${firstItem}'`,
      ),
    ).toBe(0);
    expect(
      await scalar<number>(
        `select estimated_duration_minutes as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(120);
    await fails(
      operation(4, 'relocate_stop', { kind: 'stop', id: stopOne, parent: firstItem, before: null }),
      /trip_conflict/,
    );
  });

  it('detaches a stop onto the selected day and position, retaining derived time and notes', async () => {
    await activityFixture();
    await scalar(
      operation(2, 'add_stop', {
        id: stopTwo,
        parent: firstItem,
        entry: stopEntry,
        repeat: true,
        duration: 25,
      }),
    );
    await scalar(
      operation(3, 'edit_stop', {
        id: stopTwo,
        stop_version: 0,
        duration: 25,
        notes: 'Réservation',
      }),
    );
    expect(
      await scalar<number>(
        operation(4, 'relocate_stop', {
          kind: 'activity',
          id: stopTwo,
          day: dayOne,
          before: firstItem,
        }),
      ),
    ).toBe(5);
    expect(
      await scalar(
        `select jsonb_build_object('day',trip_day_id,'time',start_time,'duration',estimated_duration_minutes,'notes',notes) as value from public.trip_items where id='${stopTwo}'`,
      ),
    ).toEqual({ day: dayOne, time: '14:40:00', duration: 25, notes: 'Réservation' });
    expect(
      await scalar(
        `select jsonb_agg(id order by sort_order,id) as value from public.trip_items where trip_id='${tripA}'`,
      ),
    ).toEqual([stopTwo, firstItem]);
    await scalar(
      operation(5, 'relocate_stop', { kind: 'activity', id: stopOne, day: dayTwo, before: null }),
    );
    expect(
      await scalar(`select trip_day_id as value from public.trip_items where id='${stopOne}'`),
    ).toBe(dayTwo);
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(0);
  });

  it('reorders and transfers repeated stops while rejecting foreign destinations atomically', async () => {
    await activityFixture();
    await scalar(
      operation(2, 'add_item', { id: secondItem, entry: catalogEntry, day: dayTwo, repeat: true }),
    );
    await scalar(
      operation(3, 'add_stop', {
        id: stopTwo,
        parent: secondItem,
        entry: stopEntry,
        repeat: false,
        duration: null,
      }),
    );
    await acceptsWithoutChanges(
      operation(4, 'relocate_stop', {
        kind: 'stop',
        id: stopOne,
        parent: secondItem,
        before: null,
      }),
    );
    await fails(
      operation(4, 'relocate_stop', {
        kind: 'stop',
        id: stopOne,
        parent: firstItem,
        before: stopTwo,
      }),
      /trip_conflict/,
    );
    await fails(
      operation(4, 'relocate_stop', { kind: 'stop', id: stopOne, parent: stopThree, before: null }),
      /trip_activity_missing/,
    );
    await fails(
      operation(4, 'relocate_stop', {
        kind: 'activity',
        id: stopOne,
        day: stopThree,
        before: null,
      }),
      /trip_day_missing/,
    );
    await fails(
      operation(4, 'relocate_stop', {
        kind: 'activity',
        id: stopOne,
        day: dayOne,
        before: secondItem,
      }),
      /trip_conflict/,
    );
    expect(
      await scalar(
        `select trip_item_id as value from public.trip_item_stops where id='${stopOne}'`,
      ),
    ).toBe(firstItem);
    await scalar(
      operation(4, 'add_stop', {
        id: stopThree,
        parent: firstItem,
        entry: stopEntry,
        repeat: true,
        duration: null,
      }),
    );
    expect(
      await scalar<number>(
        operation(5, 'relocate_stop', {
          kind: 'stop',
          id: stopThree,
          parent: firstItem,
          before: stopOne,
        }),
      ),
    ).toBe(6);
    expect(
      await scalar(
        `select jsonb_agg(id order by sort_order,id) as value from public.trip_item_stops where trip_item_id='${firstItem}'`,
      ),
    ).toEqual([stopThree, stopOne]);
  });

  it('keeps permissions and row isolation when dragging a stop out of its activity', async () => {
    await activityFixture();
    const drop = { kind: 'activity', id: stopOne, day: dayTwo, before: null };
    await asUser(adminId);
    await fails(operation(2, 'relocate_stop', drop), /trip_forbidden/);
    await db.exec(
      `reset role; update public.trips set collaboration_mode='organizers_only' where id='${tripA}'`,
    );
    await asUser(otherId);
    await fails(operation(3, 'relocate_stop', drop), /trip_forbidden/);
    await asUser();
    await fails(
      `select private.edit_trip_plan_nesting('${guildA}','${tripA}',3,'delete_stop','{"id":"${stopOne}"}')`,
      /permission denied/,
    );
    expect(await scalar<number>(operation(3, 'relocate_stop', drop))).toBe(4);
  });

  it('inserts an existing activity before a chosen stop and rolls back an invalid nested drop', async () => {
    await activityFixture();
    await asService();
    await db.exec(
      `insert into public.entries(id,city_id,category_id,title,slug,published) select '${stopThree}',city_id,category_id,'SEGA','sega',true from public.entries where id='${catalogEntry}'`,
    );
    await asUser();
    await scalar(
      operation(2, 'add_item', { id: secondItem, entry: stopThree, day: dayOne, repeat: false }),
    );
    await fails(
      operation(3, 'nest_item', { id: secondItem, parent: firstItem, before: stopTwo }),
      /trip_conflict/,
    );
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where id='${secondItem}'`,
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        operation(3, 'nest_item', { id: secondItem, parent: firstItem, before: stopOne }),
      ),
    ).toBe(5);
    expect(
      await scalar(
        `select jsonb_agg(id order by sort_order,id) as value from public.trip_item_stops where trip_item_id='${firstItem}'`,
      ),
    ).toEqual([secondItem, stopOne]);
  });

  it('keeps stops in their parent when moving and scheduling the single calendar activity', async () => {
    await activityFixture();
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where trip_id='${tripA}'`,
      ),
    ).toBe(1);
    expect(
      await scalar<number>(operation(2, 'move_item', { id: firstItem, day: dayTwo, before: null })),
    ).toBe(3);
    expect(
      await scalar<number>(
        operation(3, 'schedule_item', {
          id: firstItem,
          item_version: 1,
          day: dayTwo,
          start_time: '15:30',
          end_time: '17:30',
          duration: 120,
        }),
      ),
    ).toBe(4);
    expect(
      await scalar(`select jsonb_build_object('day',i.trip_day_id,'start',i.start_time,'parentDuration',i.estimated_duration_minutes,'stopDuration',s.duration_minutes) as value
      from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id where s.id='${stopOne}'`),
    ).toEqual({ day: dayTwo, start: '15:30:00', parentDuration: 120, stopDuration: 40 });
  });

  it('bounds insertion receipts to a visible entry and a root activity in the same trip', async () => {
    await activityFixture();
    const add = { id: stopOne, parent: firstItem, entry: stopEntry, repeat: false, duration: 40 };
    expect(await scalar<number>(operation(0, 'add_stop', add))).toBe(2);
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(1);
    await acceptsWithoutChanges(operation(2, 'add_stop', { ...add, id: stopTwo }));
    await acceptsWithoutChanges(
      operation(2, 'add_stop', { ...add, id: stopTwo, entry: catalogEntry }),
    );
    await fails(
      operation(2, 'add_stop', { ...add, id: stopTwo, parent: stopOne }),
      /trip_activity_missing/,
    );
    await fails(
      `insert into public.trip_item_stops(trip_item_id,entry_id) values('${firstItem}','${stopEntry}')`,
      /permission denied/,
    );
    await fails(
      `select private.edit_trip_plan_roots('${guildA}','${tripA}',2,'delete_trip','{}')`,
      /permission denied/,
    );
    await db.exec('reset role');
    await db.exec(
      `insert into public.trip_items(id,trip_id,entry_id) values('${secondItem}','${tripB}','${catalogEntry}');`,
    );
    await asUser();
    await fails(
      operation(2, 'add_stop', { ...add, id: stopTwo, parent: secondItem }),
      /trip_activity_missing/,
    );
    await db.exec('reset role');
    await asService();
    await db.exec(`update public.entries set published=false where id='${stopEntry}'`);
    await asUser();
    await fails(
      operation(2, 'add_stop', { ...add, id: stopTwo, repeat: true }),
      /trip_entry_hidden/,
    );
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(1);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.entries where id='${stopEntry}'`,
      ),
    ).toBe(0);
  });

  it('protects stop notes with versions and reorders only within the same activity', async () => {
    await activityFixture();
    await scalar(
      operation(2, 'add_stop', {
        id: stopTwo,
        parent: firstItem,
        entry: stopEntry,
        repeat: true,
        duration: 20,
      }),
    );
    const edit = { id: stopOne, stop_version: 0, duration: 50, notes: 'Billet, étage 6' };
    expect(await scalar<number>(operation(3, 'edit_stop', edit))).toBe(4);
    await fails(operation(4, 'edit_stop', edit), /trip_conflict/);
    await fails(operation(3, 'edit_stop', { ...edit, stop_version: 1 }), /trip_conflict/);
    expect(await scalar<number>(operation(4, 'move_stop', { id: stopTwo, before: stopOne }))).toBe(
      5,
    );
    expect(
      await scalar(
        `select jsonb_agg(id order by sort_order,id) as value from public.trip_item_stops where trip_item_id='${firstItem}'`,
      ),
    ).toEqual([stopTwo, stopOne]);
    expect(
      await scalar(`select notes as value from public.trip_item_stops where id='${stopOne}'`),
    ).toBe('Billet, étage 6');
    await scalar(
      operation(5, 'add_item', { id: secondItem, entry: catalogEntry, day: dayOne, repeat: true }),
    );
    await scalar(
      operation(6, 'add_stop', {
        id: stopThree,
        parent: secondItem,
        entry: stopEntry,
        repeat: false,
        duration: null,
      }),
    );
    await fails(operation(7, 'move_stop', { id: stopOne, before: stopThree }), /trip_conflict/);
    expect(
      await scalar<number>(
        `select estimated_duration_minutes as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(120);
  });

  it('detaches an existing stop without losing notes or resurrecting deleted groups on retry', async () => {
    await activityFixture();
    await scalar(
      operation(2, 'add_stop', {
        id: stopTwo,
        parent: firstItem,
        entry: stopEntry,
        repeat: true,
        duration: 20,
      }),
    );
    await scalar(
      operation(3, 'edit_stop', {
        id: stopTwo,
        stop_version: 0,
        duration: 20,
        notes: 'Réservation',
      }),
    );
    expect(await scalar<number>(operation(4, 'detach_stop', { id: stopTwo }))).toBe(5);
    expect(
      await scalar(
        `select jsonb_build_object('day',trip_day_id,'start',start_time,'duration',estimated_duration_minutes,'notes',notes) as value from public.trip_items where id='${stopTwo}'`,
      ),
    ).toEqual({ day: dayOne, start: '14:40:00', duration: 20, notes: 'Réservation' });
    expect(
      await scalar<number>(
        operation(0, 'add_stop', {
          id: stopTwo,
          parent: firstItem,
          entry: stopEntry,
          repeat: true,
          duration: 20,
        }),
      ),
    ).toBe(5);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_item_stops where id='${stopTwo}'`,
      ),
    ).toBe(0);
    expect(await scalar<number>(operation(5, 'delete_item', { id: firstItem }))).toBe(6);
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(0);
    expect(
      await scalar<number>(
        operation(0, 'add_stop', {
          id: stopOne,
          parent: firstItem,
          entry: stopEntry,
          repeat: false,
          duration: 40,
        }),
      ),
    ).toBe(6);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where id='${stopTwo}'`,
      ),
    ).toBe(1);
  });

  it('enforces collaboration settings, expired membership and guild isolation for stops', async () => {
    await activityFixture();
    await asUser(otherId);
    await scalar(
      operation(2, 'add_stop', {
        id: stopTwo,
        parent: firstItem,
        entry: stopEntry,
        repeat: true,
        duration: null,
      }),
    );
    expect(
      await scalar<boolean>(
        `select public.trip_contributor_cards('${tripA}') @> '[{"id":"${otherId}"}]'::jsonb as value`,
      ),
    ).toBe(true);
    await db.exec('reset role');
    await db.exec(
      `update public.trips set collaboration_mode='organizers_only' where id='${tripA}'`,
    );
    await asUser(otherId);
    await fails(
      operation(4, 'edit_stop', { id: stopTwo, stop_version: 0, duration: 15, notes: '' }),
      /trip_forbidden/,
    );
    await asUser(adminId);
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(0);
    await fails(operation(4, 'delete_stop', { id: stopOne }), /trip_forbidden/);
    await db.exec('reset role');
    await db.exec(
      `update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${userId}' and guild_id='${guildA}'`,
    );
    await asUser();
    expect(
      await scalar<number>(`select count(*)::integer as value from public.trip_item_stops`),
    ).toBe(0);
    await fails(operation(4, 'delete_stop', { id: stopOne }), /trip_forbidden/);
  });

  it('keeps shared stops after account deletion while removing private insertion receipts', async () => {
    await activityFixture();
    await db.exec('reset role');
    await db.exec(`delete from auth.users where id='${userId}'`);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_item_stops where added_by is null`,
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from private.trip_stop_add_requests where user_id='${userId}'`,
      ),
    ).toBe(0);
    expect(
      await scalar<number>(
        `select count(*)::integer as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe(1);
  });

  it('moves and schedules an event atomically, preserving notes and enforcing both versions', async () => {
    await catalogAndDays();
    await asUser();
    expect(
      await scalar<number>(
        operation(0, 'add_item', {
          id: firstItem,
          entry: catalogEntry,
          day: dayOne,
          repeat: false,
          start_time: '09:00',
          duration: 60,
        }),
      ),
    ).toBe(1);
    const schedule = {
      id: firstItem,
      item_version: 0,
      day: dayTwo,
      start_time: '11:30',
      end_time: '13:00',
      duration: 90,
    };
    expect(await scalar<number>(operation(1, 'schedule_item', schedule))).toBe(2);
    expect(
      await scalar(
        `select jsonb_build_object('day',trip_day_id,'time',start_time,'duration',estimated_duration_minutes,'version',version) as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toEqual({ day: dayTwo, time: '11:30:00', duration: 90, version: 1 });
    await fails(
      operation(2, 'schedule_item', { ...schedule, start_time: '12:00' }),
      /trip_conflict/,
    );
    await fails(operation(1, 'schedule_item', { ...schedule, item_version: 1 }), /trip_conflict/);
    await fails(
      operation(2, 'schedule_item', { ...schedule, item_version: 1, day: plannedTrip }),
      /trip_day_missing/,
    );
    await fails(
      operation(2, 'schedule_item', { ...schedule, item_version: 1, end_time: '10:00' }),
      /trip_items_local_times/,
    );
    expect(
      await scalar<string>(
        `select start_time::text as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe('11:30:00');
    await db.exec('reset role');
    await asUser(adminId);
    await fails(operation(2, 'schedule_item', { ...schedule, item_version: 1 }), /trip_forbidden/);
  });

  it('only sorts the requested day after an explicit action and keeps the other day intact', async () => {
    await catalogAndDays();
    await asUser();
    await scalar(
      operation(0, 'add_item', {
        id: firstItem,
        entry: catalogEntry,
        day: dayOne,
        repeat: false,
        start_time: '14:00',
      }),
    );
    await scalar(
      operation(0, 'add_item', {
        id: secondItem,
        entry: catalogEntry,
        day: dayOne,
        repeat: true,
        start_time: '09:00',
      }),
    );
    expect(
      await scalar<string>(
        `select id as value from public.trip_items where trip_day_id='${dayOne}' order by sort_order limit 1`,
      ),
    ).toBe(firstItem);
    expect(await scalar<number>(operation(2, 'sort_items', { day: dayOne }))).toBe(3);
    expect(
      await scalar<string>(
        `select id as value from public.trip_items where trip_day_id='${dayOne}' order by sort_order limit 1`,
      ),
    ).toBe(secondItem);
    await fails(operation(2, 'sort_items', { day: dayOne }), /trip_conflict/);
  });

  it('fills missing dates automatically on date changes and preserves existing day identities', async () => {
    await asUser();
    expect(await scalar<number>(operation(0, 'settings', settings))).toBe(1);
    const id = await scalar<string>(
      `select id as value from public.trip_days where trip_id='${tripA}' and date='2027-07-12'`,
    );
    expect(
      await scalar<number>(operation(1, 'settings', { ...settings, end_date: '2027-07-16' })),
    ).toBe(2);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_days where trip_id='${tripA}'`,
      ),
    ).toBe(5);
    expect(
      await scalar<string>(
        `select id as value from public.trip_days where trip_id='${tripA}' and date='2027-07-12'`,
      ),
    ).toBe(id);
  });

  it('normalizes accents and case while retaining international catalogue names', async () => {
    expect(
      await scalar<string>(`select public.catalog_search_key('CAFÉ Pokémon 東京') as value`),
    ).toBe('cafe pokemon 東京');
    await catalogAndDays();
    await db.exec(`update public.entries set title='Café Pokémon 東京' where id='${catalogEntry}'`);
    await asUser();
    expect(
      await scalar<string>(
        `select id as value from public.entries where search_key like '%cafe pokemon%'`,
      ),
    ).toBe(catalogEntry);
  });

  it('initializes dated trips and preserves days when the date range is shortened', async () => {
    await asUser(otherId);
    await db.exec(`insert into public.trips(id,guild_id,title,start_date,end_date,timezone,created_by)
      values('${plannedTrip}','${guildA}','Japon','2027-07-12','2027-07-14','Asia/Tokyo','${otherId}')`);
    expect(
      await scalar<string>(
        `select string_agg(date::text,',' order by day_number) as value from public.trip_days where trip_id='${plannedTrip}'`,
      ),
    ).toBe('2027-07-12,2027-07-13,2027-07-14');
    expect(
      await scalar<boolean>(`select public.is_trip_organizer('${plannedTrip}') as value`),
    ).toBe(true);
    expect(
      await scalar<number>(
        operation(0, 'settings', { ...settings, end_date: '2027-07-13' }, guildA, plannedTrip),
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_days where trip_id='${plannedTrip}'`,
      ),
    ).toBe(3);
    await fails(
      operation(
        1,
        'add_day',
        { title: 'Hors calendrier', date: '2027-07-15' },
        guildA,
        plannedTrip,
      ),
      /trip_day_date/,
    );
    expect(await scalar<number>(operation(1, 'generate_days', {}, guildA, plannedTrip))).toBe(2);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_days where trip_id='${plannedTrip}'`,
      ),
    ).toBe(3);
  });

  it('supports undated days, transactional ordering, safe day removal and collaborative notes', async () => {
    await catalogAndDays();
    await asUser(otherId);
    expect(await scalar<number>(operation(0, 'add_day', { title: 'Osaka', date: null }))).toBe(1);
    expect(await scalar<number>(operation(1, 'move_day', { id: dayTwo, direction: 'up' }))).toBe(2);
    expect(
      await scalar<string>(
        `select id as value from public.trip_days where trip_id='${tripA}' order by sort_order limit 1`,
      ),
    ).toBe(dayTwo);
    expect(
      await scalar<number>(
        operation(2, 'edit_day', { id: dayOne, title: 'Tokyo avec le groupe', date: null }),
      ),
    ).toBe(3);
    expect(
      await scalar<number>(
        operation(0, 'add_item', {
          id: firstItem,
          entry: catalogEntry,
          day: dayOne,
          repeat: false,
        }),
      ),
    ).toBe(4);
    expect(
      await scalar<number>(
        operation(4, 'edit_item', {
          id: firstItem,
          item_version: 0,
          start_time: '09:00',
          end_time: '10:30',
          duration: 90,
          notes: 'Billets déjà achetés',
        }),
      ),
    ).toBe(5);
    await db.exec('reset role');
    await asUser();
    expect(
      await scalar<string>(`select notes as value from public.trip_items where id='${firstItem}'`),
    ).toBe('Billets déjà achetés');
    expect(await scalar<number>(operation(5, 'delete_day', { id: dayOne, day: null }))).toBe(6);
    expect(
      await scalar<string | null>(
        `select trip_day_id as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBeNull();
    expect(
      await scalar<string>(
        `select start_time::text as value from public.trip_items where id='${firstItem}'`,
      ),
    ).toBe('09:00:00');
    expect(
      await scalar<string>(
        `select description as value from public.entries where id='${catalogEntry}'`,
      ),
    ).toBe('Catalogue');
  });

  it('deduplicates requests, checks day membership, and protects concurrent reordering', async () => {
    await catalogAndDays();
    await db.exec(`insert into public.trip_days(trip_id,id,day_number) values
      ('${tripB}','${plannedTrip}',1)`);
    await asUser();
    const add = { id: firstItem, entry: catalogEntry, day: null, repeat: false };
    expect(await scalar<number>(operation(0, 'add_item', add))).toBe(1);
    expect(await scalar<number>(operation(0, 'add_item', add))).toBe(1);
    await acceptsWithoutChanges(operation(1, 'add_item', { ...add, id: secondItem }));
    expect(
      await scalar<number>(operation(1, 'add_item', { ...add, id: secondItem, repeat: true })),
    ).toBe(2);
    await fails(
      operation(2, 'move_item', { id: firstItem, day: plannedTrip, before: null }),
      /trip_day_missing/,
    );
    expect(
      await scalar<number>(operation(2, 'move_item', { id: firstItem, day: dayTwo, before: null })),
    ).toBe(3);
    await db.exec('reset role');
    await asUser(otherId);
    await fails(
      operation(2, 'move_item', { id: secondItem, day: dayOne, before: null }),
      /trip_conflict/,
    );
    expect(
      await scalar<number>(
        operation(3, 'move_item', { id: secondItem, day: dayTwo, before: firstItem }),
      ),
    ).toBe(4);
    expect(
      await scalar<string>(
        `select id as value from public.trip_items where trip_day_id='${dayTwo}' order by sort_order limit 1`,
      ),
    ).toBe(secondItem);
    expect(await scalar<number>(operation(4, 'delete_item', { id: secondItem }))).toBe(5);
    await db.exec('reset role');
    await asUser();
    expect(
      await scalar<number>(operation(4, 'add_item', { ...add, id: secondItem, repeat: true })),
    ).toBe(5);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_items where trip_id='${tripA}'`,
      ),
    ).toBe(1);
  });

  it('isolates organizer-only writes and realtime invalidations by Discord server', async () => {
    await asUser();
    expect(
      await scalar<number>(
        operation(0, 'settings', { ...settings, collaboration_mode: 'organizers_only' }),
      ),
    ).toBe(1);
    await db.exec('reset role');
    await asUser(otherId);
    await fails(operation(1, 'add_day', { title: 'Cannot', date: null }), /trip_forbidden/);
    await db.exec(`set local test.realtime_topic='trip:${tripA}'`);
    expect(
      await scalar<string>(
        "select payload::text as value from realtime.messages where event='refresh'",
      ),
    ).toBe('{}');
    await db.exec('reset role');
    await asUser(adminId);
    expect(await scalar<number>('select count(*)::int as value from realtime.messages')).toBe(0);
    await fails(operation(1, 'add_day', { title: 'Intrusion', date: null }), /trip_forbidden/);
    await db.exec('reset role');
    await asUser();
    expect(
      await scalar<number>(operation(1, 'organizer_add', { discord_id: '333333333333333333' })),
    ).toBe(2);
    await db.exec('reset role');
    await asUser(otherId);
    expect(
      await scalar<number>(operation(2, 'add_day', { title: 'Avec mon groupe', date: null })),
    ).toBe(3);
    await fails(operation(3, 'organizer_remove', { id: userId }), /trip_organizer_required/);
    expect(await scalar<number>(operation(3, 'delete_trip', {}))).toBe(4);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.trip_days where trip_id='${tripA}'`,
      ),
    ).toBe(0);
  });

  it('preserves private trip notes when the source entry is unpublished', async () => {
    await catalogAndDays();
    await asUser();
    expect(
      await scalar<number>(
        operation(0, 'add_item', {
          id: firstItem,
          entry: catalogEntry,
          day: dayOne,
          repeat: false,
        }),
      ),
    ).toBe(1);
    await asService();
    await db.exec(`update public.entries set published=false where id='${catalogEntry}'`);
    await asUser(otherId);
    await fails(
      operation(1, 'add_item', { id: secondItem, entry: catalogEntry, day: dayTwo, repeat: false }),
      /trip_entry_hidden/,
    );
    expect(
      await scalar<number>(
        operation(1, 'edit_item', {
          id: firstItem,
          item_version: 0,
          start_time: null,
          end_time: null,
          duration: null,
          notes: 'À adapter',
        }),
      ),
    ).toBe(2);
    expect(
      await scalar<string>(`select notes as value from public.trip_items where id='${firstItem}'`),
    ).toBe('À adapter');
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.entries where id='${catalogEntry}'`,
      ),
    ).toBe(0);
  });
});

describe('Discord spaces: real membership, isolation and durable data', () => {
  beforeEach(spacesFixture);
  it('isolates trips by current Discord membership even from a global Nagi admin', async () => {
    await asUser();
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(1);
    expect(await scalar<string>('select title as value from public.trips')).toBe('Voyage A');
    await fails(
      `insert into public.trips(guild_id,title,created_by) values('${guildB}','Intrusion','${userId}')`,
      /row.level security/i,
    );
    await db.exec('reset role');
    await asUser(adminId);
    expect(await scalar<string>('select title as value from public.trips')).toBe('Voyage B');
    expect(await scalar<unknown>(`select public.trip_author_card('${tripA}') as value`)).toBeNull();
  });
  it('shares trips with other members while reserving settings for organizers', async () => {
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(1);
    await db.exec(`update public.trips set title='Forbidden' where id='${tripA}'`);
    expect(await scalar<string>('select title as value from public.trips')).toBe('Voyage A');
    await db.exec(
      `insert into public.trips(guild_id,title,created_by) values('${guildA}','Shared','${otherId}')`,
    );
    await db.exec('reset role');
    await asUser();
    await db.exec(`update public.trips set title='Admin edit' where title='Shared'`);
    expect(
      await scalar<number>(
        "select count(*)::int as value from public.trips where title='Admin edit'",
      ),
    ).toBe(0);
    await db.exec('reset role');
    await asUser(otherId);
    await db.exec("update public.trips set title='Organizer edit' where title='Shared'");
    expect(
      await scalar<number>(
        "select count(*)::int as value from public.trips where title='Organizer edit'",
      ),
    ).toBe(1);
  });
  it('does not turn Discord administrators into global catalog administrators', async () => {
    await asUser();
    expect(await scalar<boolean>(`select public.is_guild_admin('${guildA}') as value`)).toBe(true);
    expect(await scalar<boolean>('select public.is_nagi_admin() as value')).toBe(false);
    await fails(
      "insert into public.countries(name,slug,iso_code) values('Intrusion','intrusion','JP')",
      /row.level security/i,
    );
    await fails(
      `update public.profiles set role='admin' where id='${userId}'`,
      /permission denied/i,
    );
    await fails(
      `update public.discord_guilds set bot_present=true where id='${guildA}'`,
      /permission denied/i,
    );
  });
  it('rejects forged verification, private credentials access and foreign preferences', async () => {
    await asUser(otherId);
    await fails(
      `select public.record_discord_memberships('${otherId}','${applicationId}','[]')`,
      /permission denied/i,
    );
    await fails(`select public.read_discord_credentials('${userId}')`, /permission denied/i);
    await fails('select * from private.guild_memberships', /permission denied/i);
    await fails(
      `insert into public.user_guild_preferences(user_id,default_guild_id) values('${otherId}','${guildB}')`,
      /row.level security/i,
    );
    await fails(
      `insert into public.user_guild_preferences(user_id,default_guild_id) values('${userId}','${guildA}')`,
      /row.level security/i,
    );
  });
  it('enforces space creation settings and immutable trip ownership columns', async () => {
    await asUser();
    await db.exec(
      `update public.discord_guilds set members_can_create_trips=false where id='${guildA}'`,
    );
    await fails(
      `update public.trips set guild_id='${guildB}' where id='${tripA}'`,
      /permission denied/i,
    );
    await fails(
      `update public.trips set created_by='${otherId}' where id='${tripA}'`,
      /permission denied/i,
    );
    await db.exec('reset role');
    await asUser(otherId);
    await fails(
      `insert into public.trips(guild_id,title,created_by) values('${guildA}','Forbidden','${otherId}')`,
      /row.level security/i,
    );
    await db.exec('reset role');
    await asUser();
    await db.exec(
      `insert into public.trips(guild_id,title,created_by) values('${guildA}','Admin allowed','${userId}')`,
    );
    await fails(
      `insert into public.trips(guild_id,title,created_by) values('${guildA}','  ','${userId}')`,
      /check constraint/i,
    );
    await fails(
      `insert into public.trips(guild_id,title,start_date,end_date,created_by) values('${guildA}','Bad dates','2027-02-02','2027-02-01','${userId}')`,
      /check constraint/i,
    );
  });
  it('invalidates access and preferences after a user leaves, preserving the shared trips', async () => {
    await asUser();
    await db.exec(
      `insert into public.user_guild_preferences(user_id,default_guild_id,last_active_guild_id) values('${userId}','${guildA}','${guildA}'); reset role`,
    );
    await asService();
    await db.exec(
      `select public.record_discord_memberships('${userId}','${applicationId}','[]'); reset role`,
    );
    await asUser();
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(0);
    expect(
      await scalar<string>('select default_guild_id as value from public.user_guild_preferences'),
    ).toBeNull();
    await db.exec('reset role');
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(2);
  });
  it('handles bot removal and rejoining without deleting trips or restoring an obsolete favorite', async () => {
    await asUser();
    await db.exec(
      `insert into public.user_guild_preferences(user_id,default_guild_id,last_active_guild_id) values('${userId}','${guildA}','${guildA}'); reset role`,
    );
    await asService();
    await db.exec(
      `select public.set_discord_guild_presence('${applicationId}','{"id":"${guildA}","name":"A"}',false); reset role`,
    );
    await asUser();
    expect(await scalar<boolean>(`select public.is_guild_member('${guildA}') as value`)).toBe(
      false,
    );
    expect(
      await scalar<string>('select default_guild_id as value from public.user_guild_preferences'),
    ).toBeNull();
    await db.exec('reset role');
    await asService();
    await db.exec(`select public.set_discord_guild_presence('${applicationId}','{"id":"${guildA}","name":"Renamed"}',true);
      select public.record_discord_memberships('${userId}','${applicationId}','[{"id":"${guildA}","permissions":"0"}]'); reset role`);
    await asUser();
    expect(await scalar<string>('select title as value from public.trips')).toBe('Voyage A');
    expect(
      await scalar<string>('select default_guild_id as value from public.user_guild_preferences'),
    ).toBeNull();
  });
  it('fails closed when membership or the bot inventory expires', async () => {
    await db.exec(
      `update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${userId}'`,
    );
    await asUser();
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(0);
    await db.exec('reset role');
    await db.exec(
      `update public.discord_guilds set last_synced_at=now()-interval '121 seconds' where id='${guildA}'`,
    );
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(0);
  });
  it('references one global entry from multiple trips and rejects a day from another trip', async () => {
    await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values('Japon','japon','JP',true);
      insert into public.cities(country_id,name,slug,is_published) select id,'Tokyo','tokyo',true from public.countries;
      insert into public.entries(city_id,category_id,title,slug,published) select c.id,k.id,'Tower','tower',true from public.cities c,public.categories k limit 1;
      insert into public.trip_days(trip_id,day_number) values('${tripA}',1),('${tripB}',1);
      insert into public.trip_items(trip_id,entry_id,added_by) select t.id,e.id,t.created_by from public.trips t,public.entries e;`);
    expect(await scalar<number>('select count(*)::int as value from public.entries')).toBe(1);
    expect(await scalar<number>('select count(*)::int as value from public.trip_items')).toBe(2);
    await fails(
      `insert into public.trip_items(trip_id,trip_day_id,entry_id) select '${tripA}',d.id,e.id from public.trip_days d,public.entries e where d.trip_id='${tripB}'`,
      /foreign key/i,
    );
    await asUser();
    expect(await scalar<number>('select count(*)::int as value from public.trip_items')).toBe(1);
    await fails(
      `insert into public.trip_days(trip_id,day_number) values('${tripB}',2)`,
      /permission denied/i,
    );
  });
  it('stores verified Discord profiles without changing global roles and fences token refresh', async () => {
    await asService();
    await fails(
      `select public.save_discord_credentials('${userId}','222222222222222222','{}','cipher',now(),array['identify','guilds'])`,
      /identity mismatch/i,
    );
    await db.exec(
      `select public.save_discord_credentials('${userId}','111111111111111111','{"username":"handle","global_name":"Display","avatar_url":"https://cdn.discordapp.com/example.png"}','cipher',now(),array['identify','guilds'])`,
    );
    const lease = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    expect(
      await scalar<boolean>(
        `select public.claim_discord_refresh('${userId}',1,'${lease}') as value`,
      ),
    ).toBe(true);
    expect(
      await scalar<boolean>(
        `select public.claim_discord_refresh('${userId}',1,gen_random_uuid()) as value`,
      ),
    ).toBe(false);
    expect(
      await scalar<boolean>(
        `select public.finish_discord_refresh('${userId}',gen_random_uuid(),'bad',now(),array['identify']) as value`,
      ),
    ).toBe(false);
    expect(
      await scalar<boolean>(
        `select public.finish_discord_refresh('${userId}','${lease}','fresh',now()+interval '1 hour',array['identify','guilds']) as value`,
      ),
    ).toBe(true);
    await db.exec(`select public.revoke_discord_credentials('${userId}',1); reset role`);
    expect(
      await scalar<string>(
        `select encrypted_tokens as value from private.discord_credentials where user_id='${userId}'`,
      ),
    ).toBe('fresh');
    expect(
      await scalar<string>(
        `select display_name as value from public.profiles where id='${userId}'`,
      ),
    ).toBe('Display');
    expect(
      await scalar<string>(`select role::text as value from public.profiles where id='${userId}'`),
    ).toBe('user');
  });
});

describe('Periodic guild reconciliation', () => {
  it('prunes only removed guild access and keeps the underlying trips', async () => {
    await spacesFixture();
    await asUser();
    await db.exec(
      `insert into public.user_guild_preferences(user_id,default_guild_id,last_active_guild_id) values('${userId}','${guildA}','${guildA}'); reset role`,
    );
    await asService();
    await db.exec(
      `select public.reconcile_discord_guilds('${applicationId}','[{"id":"${guildB}","name":"B renamed"}]'); reset role`,
    );
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(2);
    expect(
      await scalar<string>(
        `select default_guild_id as value from public.user_guild_preferences where user_id='${userId}'`,
      ),
    ).toBeNull();
    await asUser();
    expect(await scalar<number>('select count(*)::int as value from public.trips')).toBe(0);
    await db.exec('reset role');
    await asUser(adminId);
    expect(await scalar<string>('select name as value from public.discord_guilds')).toBe(
      'B renamed',
    );
  });
});

describe('Social profiles: verified audiences, identity and private banners', () => {
  beforeEach(spacesFixture);
  const read = (viewer = userId, target = otherId) =>
    `select public.read_social_profile('${viewer}','${target}','${applicationId}') as value`;
  const values = {
    profile_title: 'En quête de ramen',
    bio: 'Bonjour 🍜',
    accent: '#73a6df',
    banner_x: 30,
    banner_y: 65,
    dream_country_id: null,
    dream_city_id: null,
    banner_path: null,
  };
  const save = (data: Record<string, unknown> = values, revision = 1, user = userId) =>
    `select public.save_social_customization('${user}',${revision},'${JSON.stringify(data).replaceAll("'", "''")}') as value`;
  it('returns a minimal social DTO only to the owner or a freshly verified shared member', async () => {
    await asService();
    const own = await scalar<Record<string, unknown>>(read(userId, userId));
    expect(own.id).toBe(userId);
    expect(Object.keys(own).sort()).toEqual(
      [
        'id',
        'username',
        'display_name',
        'avatar_url',
        'created_at',
        'customization',
        'common_guilds',
        'dream',
        'organized_count',
      ].sort(),
    );
    expect((own.customization as Record<string, unknown>).user_id).toBeUndefined();
    const shared = await scalar<{ id: string; common_guilds: { id: string }[] }>(read());
    expect(shared.id).toBe(otherId);
    expect(shared.common_guilds.map((g) => g.id)).toEqual([guildA]);
    expect(await scalar(read(adminId, userId))).toBeNull();
    expect(await scalar(read(userId, adminId))).toBeNull();
    expect(await scalar(read(userId, '99999999-9999-4999-8999-999999999999'))).toBeNull();
  });
  it('authorizes only the current banner version and revokes it with shared membership', async () => {
    const path = `${otherId}/${userId}.webp`;
    const banner = (viewer = userId, version = path) =>
      `select public.can_read_profile_banner('${viewer}','${otherId}','${applicationId}','${version}') as value`;
    await asService();
    await db.exec(save({ ...values, banner_path: path }, 1, otherId));
    expect(await scalar(banner())).toBe(true);
    expect(await scalar(banner(otherId))).toBe(true);
    expect(await scalar(banner(adminId))).toBe(false);
    expect(await scalar(banner(userId, `${otherId}/${adminId}.webp`))).toBe(false);
    await db.exec(
      `reset role; update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${userId}'`,
    );
    await asService();
    expect(await scalar(banner())).toBe(false);
    expect(await scalar(banner(otherId))).toBe(true);
    await asUser();
    await fails(banner(), /permission denied/);
  });
  it('revokes access when either membership expires, the bot leaves, or bot verification is stale', async () => {
    await asService();
    for (const id of [userId, otherId]) {
      await db.exec('reset role');
      await db.exec(
        `update private.guild_memberships set expires_at=now()-interval '1 second' where user_id='${id}'`,
      );
      await asService();
      expect(await scalar(read())).toBeNull();
      await db.exec('reset role');
      await db.exec(
        `update private.guild_memberships set expires_at=now()+interval '60 seconds' where user_id='${id}'`,
      );
    }
    await db.exec(`update public.discord_guilds set bot_present=false where id='${guildA}'`);
    expect(await scalar(read())).toBeNull();
    await db.exec(
      `update public.discord_guilds set bot_present=true,last_synced_at=now()-interval '121 seconds' where id='${guildA}'`,
    );
    expect(await scalar(read())).toBeNull();
    expect((await scalar<{ id: string }>(read(userId, userId))).id).toBe(userId);
  });
  it('shows actual organizers only, filtering every trip and its metadata by shared guild access', async () => {
    await asService();
    await db.exec(`select public.record_discord_memberships('${userId}','${applicationId}','[{"id":"${guildA}","permissions":"8"},{"id":"${guildB}","permissions":"8"}]');
      insert into public.trips(guild_id,title,created_by) values('${guildB}','SECRET TITLE','${userId}');`);
    const social = await scalar<{ organized_count: number; common_guilds: { id: string }[] }>(
      read(otherId, userId),
    );
    expect(social.organized_count).toBe(1);
    expect(social.common_guilds.map((g) => g.id)).toEqual([guildA]);
    const trips = await scalar<{ id: string; title: string }[]>(
      `select public.social_profile_trips('${otherId}','${userId}','${applicationId}',0) as value`,
    );
    expect(trips.map((t) => t.id)).toEqual([tripA]);
    expect(JSON.stringify(trips)).not.toContain('SECRET');
    expect((await scalar<{ organized_count: number }>(read())).organized_count).toBe(0);
    expect(
      await scalar(
        `select public.social_profile_trips('${otherId}','${adminId}','${applicationId}',0) as value`,
      ),
    ).toEqual([]);
    expect(
      await scalar(
        `select public.social_profile_trips('${otherId}','${userId}','${applicationId}',12) as value`,
      ),
    ).toEqual([]);
  });
  it('denies browser writes, service RPC impersonation, other customizations and raw banner access', async () => {
    await db.exec(
      `create policy permissive_social_fixture on storage.objects for all to authenticated using(true) with check(true)`,
    );
    await asService();
    await db.exec(
      `insert into storage.objects(bucket_id,name) values('profile-banners','${userId}/${otherId}.webp')`,
    );
    await asUser();
    expect(
      await scalar<number>('select count(*)::int as value from public.profile_customizations'),
    ).toBe(1);
    await fails(
      `update public.profile_customizations set bio='intrusion' where user_id='${otherId}'`,
      /permission denied/,
    );
    await fails(save(), /permission denied/);
    await fails(read(), /permission denied/);
    await fails(`select public.resolve_social_profile('Other')`, /permission denied/);
    await fails(
      `select public.refresh_social_identity('${userId}','111111111111111111','{}')`,
      /permission denied/,
    );
    expect(
      await scalar<number>(
        "select count(*)::int as value from storage.objects where bucket_id='profile-banners'",
      ),
    ).toBe(0);
    await fails(
      `insert into storage.objects(bucket_id,name) values('profile-banners','${otherId}/forged.webp')`,
      /row.level security/,
    );
    await fails('select * from public.profile_banner_garbage', /permission denied/);
  });
  it('validates ownership, lengths, palette, destination publication and optimistic concurrency in SQL', async () => {
    await asService();
    await fails(save({ ...values, banner_path: `${otherId}/${userId}.webp` }), /check constraint/);
    await fails(save({ ...values, profile_title: 'a'.repeat(41) }), /check constraint/);
    await fails(save({ ...values, bio: 'a'.repeat(281) }), /check constraint/);
    await fails(save({ ...values, accent: 'red' }), /check constraint/);
    await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values('Japon','japon','JP',true),('France','france','FR',false);
      insert into public.cities(country_id,name,slug,is_published) select id,'Tokyo','tokyo',true from public.countries where slug='japon'`);
    const japan = await scalar<string>(
      "select id as value from public.countries where slug='japon'",
    );
    const france = await scalar<string>(
      "select id as value from public.countries where slug='france'",
    );
    const tokyo = await scalar<string>("select id as value from public.cities where slug='tokyo'");
    await fails(save({ ...values, dream_country_id: france }), /profile_destination/);
    await db.exec("update public.countries set is_published=true where slug='france'");
    await fails(
      save({ ...values, dream_country_id: france, dream_city_id: tokyo }),
      /profile_destination/,
    );
    expect(
      await scalar<number>(save({ ...values, dream_country_id: japan, dream_city_id: tokyo })),
    ).toBe(2);
    await fails(save(), /profile_conflict/);
    expect((await scalar<{ dream: { city: string } }>(read(userId, userId))).dream.city).toBe(
      'Tokyo',
    );
    await db.exec("update public.cities set is_published=false where slug='tokyo'");
    expect((await scalar<{ dream: null }>(read(userId, userId))).dream).toBeNull();
  });
  it('keeps dream destinations coherent after city moves and country deletion', async () => {
    await asService();
    await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values('Japon','japon','JP',true),('France','france','FR',true);
      insert into public.cities(country_id,name,slug,is_published) select id,'Tokyo','tokyo',true from public.countries where slug='japon'`);
    const japan = await scalar<string>(
      "select id as value from public.countries where slug='japon'",
    );
    const france = await scalar<string>(
      "select id as value from public.countries where slug='france'",
    );
    const tokyo = await scalar<string>("select id as value from public.cities where slug='tokyo'");
    await scalar(save({ ...values, dream_country_id: japan, dream_city_id: tokyo }));
    await fails(
      `update public.profile_customizations set dream_country_id='${france}' where user_id='${userId}'`,
      /profile_destination/,
    );
    await db.exec(`update public.cities set country_id='${france}' where id='${tokyo}'`);
    expect(
      (await scalar<{ dream: { country_id: string } }>(read(userId, userId))).dream.country_id,
    ).toBe(france);
    await db.exec(
      `delete from public.cities where id='${tokyo}'; delete from public.countries where id='${france}'`,
    );
    const row = await scalar<{ dream_country_id: null; dream_city_id: null }>(
      `select to_jsonb(c) as value from public.profile_customizations c where user_id='${userId}'`,
    );
    expect(row.dream_country_id).toBeNull();
    expect(row.dream_city_id).toBeNull();
  });
  it('preserves all Nagi personalization across verified identity refresh and OAuth reconnect, retaining old URL aliases', async () => {
    await asService();
    const banner = `${userId}/${otherId}.webp`;
    await scalar(save({ ...values, banner_path: banner }));
    const before = await scalar<Record<string, unknown>>(
      `select to_jsonb(c) as value from public.profile_customizations c where user_id='${userId}'`,
    );
    await db.exec(
      `select public.refresh_social_identity('${userId}','111111111111111111','{"username":"new.handle","global_name":"New Name","avatar_url":null}')`,
    );
    expect(
      await scalar<{ id: string; username: string }>(
        "select public.resolve_social_profile('new.handle') as value",
      ),
    ).toMatchObject({ id: userId, username: 'new.handle' });
    // The original username is resolved even after multiple renames.
    await db.exec(
      `select public.refresh_social_identity('${userId}','111111111111111111','{"username":"latest.handle","global_name":"Latest"}')`,
    );
    expect(
      (await scalar<{ id: string }>("select public.resolve_social_profile('new.handle') as value"))
        .id,
    ).toBe(userId);
    await asUser();
    await db.exec('select public.sync_discord_profile()');
    await asService();
    expect(
      await scalar(
        `select to_jsonb(c) as value from public.profile_customizations c where user_id='${userId}'`,
      ),
    ).toEqual(before);
    await fails(
      `select public.refresh_social_identity('${userId}','333333333333333333','{}')`,
      /identity mismatch/,
    );
    // A username reused by a current Discord user takes precedence over an old alias.
    await db.exec(`update public.profiles set username='new.handle' where id='${otherId}'`);
    expect(
      (await scalar<{ id: string }>("select public.resolve_social_profile('new.handle') as value"))
        .id,
    ).toBe(otherId);
  });
  it('queues only the replaced banner and cancels cleanup for a successfully attached upload', async () => {
    await asService();
    const old = `${userId}/${otherId}.webp`,
      next = `${userId}/${adminId}.webp`;
    await db.exec(
      `insert into public.profile_banner_garbage(path,not_before) values('${old}',now()+interval '10 minutes')`,
    );
    await scalar(save({ ...values, banner_path: old }));
    expect(
      await scalar<number>('select count(*)::int as value from public.profile_banner_garbage'),
    ).toBe(0);
    await db.exec(`insert into public.profile_banner_garbage(path) values('${next}')`);
    await scalar(save({ ...values, banner_path: next }, 2));
    expect(await scalar<string>('select path as value from public.profile_banner_garbage')).toBe(
      old,
    );
    await scalar(save({ ...values, banner_path: null }, 3));
    expect(
      await scalar<number>('select count(*)::int as value from public.profile_banner_garbage'),
    ).toBe(2);
  });
  it('exposes contributor links only within an authorized trip', async () => {
    await asUser(otherId);
    const people = await scalar<{ id: string; username: string }[]>(
      `select public.trip_contributor_cards('${tripA}') as value`,
    );
    expect(people).toHaveLength(1);
    expect(people[0]?.id).toBe(userId);
    expect(people[0]?.username).toBeTruthy();
    expect(await scalar(`select public.trip_contributor_cards('${tripB}') as value`)).toEqual([]);
  });
});

describe('Semantic relations: transactional orientation and type administration', () => {
  it('preserves legacy IDs, labels, orientation, timestamps and ambiguous reverse associations through migration', () => {
    expect(legacyRelationsAfter).toEqual(legacyRelationsBefore);
    expect(legacyTypeAfter).toEqual(legacyTypeBefore);
    expect(legacyRelationsAfter).toHaveLength(3);
  });
  const a = 'a1000000-1111-4111-8111-111111111111',
    b = 'b1000000-1111-4111-8111-111111111111',
    c = 'c1000000-1111-4111-8111-111111111111';
  const located = "(select id from public.relation_types where slug='located-in')",
    nearby = "(select id from public.relation_types where slug='nearby')";
  const literal = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const typeData = {
    slug: 'custom-hierarchy',
    name: 'Un lien personnel',
    forward_label: 'Contient',
    inverse_label: 'Appartient à',
    description: 'Sens du lien.',
    icon: 'map-pin',
    is_symmetric: false,
    is_acyclic: true,
    is_enabled: true,
    sort_order: 999,
  };
  async function admin() {
    await db.exec('reset role');
    await asUser(adminId);
  }
  async function create(from = a, to = b, type = located, direction = 'forward') {
    return scalar<{ id: string; entries: string[] }>(
      `select public.catalog_edit_relation('${from}',null,null,'${to}',${type},'${direction}',false) as value`,
    );
  }
  const stamp = (id: string) => `(select updated_at from public.entry_relations where id='${id}')`;
  beforeEach(async () => {
    await asService();
    await db.exec(`insert into public.countries(name,slug,iso_code,is_published) values('Japon','japon','JP',true),('France','france','FR',true);
   insert into public.cities(country_id,name,slug,is_published) select id,'Tokyo','tokyo',true from public.countries where slug='japon';
   insert into public.cities(country_id,name,slug,is_published) select id,'Paris','paris',true from public.countries where slug='france';
   insert into public.entries(id,city_id,category_id,title,slug,published) select '${a}',x.id,k.id,'Pokémon Center','pokemon-center',true from public.cities x,public.categories k where x.slug='tokyo' and k.slug='adresses';
   insert into public.entries(id,city_id,category_id,title,slug,published) select '${b}',x.id,k.id,'Shibuya PARCO','shibuya-parco',true from public.cities x,public.categories k where x.slug='tokyo' and k.slug='tourisme';
   insert into public.entries(id,city_id,category_id,title,slug,published) select '${c}',x.id,k.id,'Une autre destination','autre-destination',true from public.cities x,public.categories k where x.slug='paris' and k.slug='tourisme';`);
    await admin();
  });
  it('creates one canonical association from either reading and rejects its inverse duplicate', async () => {
    const edge = await create(b, a, located, 'inverse');
    expect(edge.entries.sort()).toEqual([a, b]);
    expect(
      await scalar(`select source_id as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(a);
    expect(
      await scalar(`select target_id as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(b);
    expect(
      await scalar(`select created_by as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(adminId);
    await fails(
      `select public.catalog_edit_relation('${a}',null,null,'${b}',${located},'forward',false)`,
      /unique/,
    );
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      1,
    );
  });
  it('normalizes symmetric endpoints and permits genuinely different relation types', async () => {
    const edge = await create(b, a, nearby, 'inverse');
    expect(
      await scalar(`select source_id as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(a);
    await fails(
      `select public.catalog_edit_relation('${a}',null,null,'${b}',${nearby},'forward',false)`,
      /unique/,
    );
    await create(a, b, located);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      2,
    );
  });
  it('retargets and inverts from the incoming end while retaining the ID and reporting all affected entries', async () => {
    const edge = await create();
    const changed = await scalar<{ id: string; entries: string[] }>(
      `select public.catalog_edit_relation('${b}','${edge.id}',${stamp(edge.id)},'${c}',${located},'forward',false) as value`,
    );
    expect(changed.id).toBe(edge.id);
    expect(changed.entries.sort()).toEqual([a, b, c]);
    expect(
      await scalar(`select source_id as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(b);
    expect(
      await scalar(`select target_id as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(c);
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.entry_relations where source_id='${a}' or target_id='${a}'`,
      ),
    ).toBe(0);
    await fails(
      `select public.catalog_edit_relation('${a}','${edge.id}',${stamp(edge.id)},'${c}',${located},'forward',false)`,
      /catalog_relation_missing/,
    );
    const deleted = await scalar<{ entries: string[] }>(
      `select public.catalog_edit_relation('${c}','${edge.id}',${stamp(edge.id)},null,null,'forward',true) as value`,
    );
    expect(deleted.entries.sort()).toEqual([b, c]);
    expect(await scalar<number>('select count(*)::int as value from public.entries')).toBe(3);
  });
  it('rejects stale changes, self links, invalid references and direct or indirect hierarchy cycles', async () => {
    const edge = await create();
    await fails(
      `select public.catalog_edit_relation('${a}','${edge.id}','2000-01-01',null,null,'forward',true)`,
      /catalog_relation_changed/,
    );
    await fails(
      `select public.catalog_edit_relation('${a}',null,null,'${a}',${located},'forward',false)`,
      /catalog_relation_invalid/,
    );
    await fails(
      `select public.catalog_edit_relation('${a}',null,null,'99999999-9999-4999-8999-999999999999',${located},'forward',false)`,
      /foreign key/,
    );
    await fails(
      `select public.catalog_edit_relation('${b}',null,null,'${a}',${located},'forward',false)`,
      /catalog_relation_cycle/,
    );
    await create(b, c);
    await fails(
      `select public.catalog_edit_relation('${c}',null,null,'${a}',${located},'forward',false)`,
      /catalog_relation_cycle/,
    );
    const nonHierarchy = "(select id from public.relation_types where slug='organizes')";
    await create(a, b, nonHierarchy);
    await create(b, c, nonHierarchy);
    await create(c, a, nonHierarchy);
  });
  it('keeps inactive associations readable while preventing new ones in SQL, including direct writes', async () => {
    const edge = await create();
    await db.exec(
      `select public.catalog_toggle_relation_type(${located},false,(select updated_at from public.relation_types where id=${located}))`,
    );
    await fails(
      `select public.catalog_edit_relation('${b}',null,null,'${c}',${located},'forward',false)`,
      /catalog_relation_type_disabled/,
    );
    await fails(
      `update public.entry_relations set target_id='${c}' where id='${edge.id}'`,
      /catalog_relation_type_disabled/,
    );
    await db.exec('reset role');
    await asUser(otherId);
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      1,
    );
    await admin();
    await scalar(
      `select public.catalog_edit_relation('${b}','${edge.id}',${stamp(edge.id)},null,null,'forward',true) as value`,
    );
  });
  it('creates custom types, synchronizes symmetric labels, locks keys and propagates label edits without copying them', async () => {
    const type = await scalar<string>(
      `select public.catalog_save_relation_type(null,${literal(typeData)}) as value`,
    );
    await create(a, b, `'${type}'`);
    await db.exec(
      `select public.catalog_save_relation_type('${type}',${literal({ ...typeData, forward_label: 'Est inclus dans', inverse_label: 'Inclut' })} || jsonb_build_object('updated_at',(select updated_at from public.relation_types where id='${type}')))`,
    );
    expect(
      await scalar(
        `select t.inverse_label as value from public.entry_relations r join public.relation_types t on t.id=r.relation_type_id where r.target_id='${b}'`,
      ),
    ).toBe('Inclut');
    await fails(
      `select public.catalog_save_relation_type('${type}',${literal({ ...typeData, is_symmetric: true, is_acyclic: false })} || jsonb_build_object('updated_at',(select updated_at from public.relation_types where id='${type}')))`,
      /catalog_relation_type_in_use/,
    );
    await asService();
    await fails(
      `update public.relation_types set slug='other-key' where id='${type}'`,
      /catalog_relation_key_immutable/,
    );
    await admin();
    const symmetric = await scalar<string>(
      `select public.catalog_save_relation_type(null,${literal({ ...typeData, slug: 'custom-symmetric', is_symmetric: true, is_acyclic: false, forward_label: 'Correspond à', inverse_label: 'Ignored' })}) as value`,
    );
    expect(
      await scalar(
        `select inverse_label as value from public.relation_types where id='${symmetric}'`,
      ),
    ).toBe('Correspond à');
  });
  it('protects type deletion and reassigns compatible associations atomically, preserving IDs', async () => {
    const edge = await create();
    const target = await scalar<string>(
      `select public.catalog_save_relation_type(null,${literal(typeData)}) as value`,
    );
    const expected = `(select updated_at from public.relation_types where id=${located})`;
    await fails(
      `select public.catalog_remove_relation_type(${located},null,${expected})`,
      /catalog_relation_type_in_use/,
    );
    await fails(
      `select public.catalog_remove_relation_type(${located},${nearby},${expected})`,
      /catalog_relation_reassign/,
    );
    expect(
      await scalar<number>(
        `select public.catalog_remove_relation_type(${located},'${target}',${expected}) as value`,
      ),
    ).toBe(1);
    expect(
      await scalar(
        `select relation_type_id as value from public.entry_relations where id='${edge.id}'`,
      ),
    ).toBe(target);
    expect(
      await scalar(`select created_by as value from public.entry_relations where id='${edge.id}'`),
    ).toBe(adminId);
  });
  it('rolls back a type reassignment that would create duplicate edges or a merged cycle', async () => {
    await create();
    const target = await scalar<string>(
      `select public.catalog_save_relation_type(null,${literal(typeData)}) as value`,
    );
    await create(a, b, `'${target}'`);
    const expected = `(select updated_at from public.relation_types where id=${located})`;
    await fails(
      `select public.catalog_remove_relation_type(${located},'${target}',${expected})`,
      /unique/,
    );
    expect(await scalar<number>('select count(*)::int as value from public.entry_relations')).toBe(
      2,
    );
    await db.exec(`delete from public.entry_relations where relation_type_id='${target}'`);
    await create(b, a, `'${target}'`);
    await fails(
      `select public.catalog_remove_relation_type(${located},'${target}',${expected})`,
      /catalog_relation_cycle/,
    );
    expect(
      await scalar<number>(
        `select count(*)::int as value from public.relation_types where id=${located}`,
      ),
    ).toBe(1);
  });
  it('validates complete reorder snapshots and rejects non-admin RPC and direct table mutations', async () => {
    const ids = await scalar<string[]>(
      'select array_agg(id order by sort_order desc) as value from public.relation_types',
    );
    await db.query('select public.catalog_order_relation_types($1::uuid[])', [ids]);
    expect(
      await scalar(`select id as value from public.relation_types order by sort_order limit 1`),
    ).toBe(ids[0]);
    await fails(
      `select public.catalog_order_relation_types(array[${located},${located}])`,
      /catalog_order_changed/,
    );
    await fails('select public.catalog_order_relation_types(null)', /catalog_order_changed/);
    await db.exec('reset role');
    await asUser(otherId);
    await fails(
      `select public.catalog_edit_relation('${a}',null,null,'${b}',${located},'forward',false)`,
      /catalog_forbidden/,
    );
    await fails(
      `select public.catalog_save_relation_type(null,${literal(typeData)})`,
      /catalog_forbidden/,
    );
    await fails(`select public.catalog_order_relation_types(array[]::uuid[])`, /catalog_forbidden/);
    await fails(
      `select public.catalog_toggle_relation_type(${located},false,now())`,
      /catalog_forbidden/,
    );
    await fails(
      `select public.catalog_remove_relation_type(${located},null,now())`,
      /catalog_forbidden/,
    );
    await fails(
      `insert into public.entry_relations(source_id,target_id,relation_type_id) values('${a}','${b}',${located})`,
      /permission denied|row.level security/,
    );
  });
});
