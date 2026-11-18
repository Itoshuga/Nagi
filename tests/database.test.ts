import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const db = new PGlite({ extensions: { pg_trgm } });
const userId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const applicationId = '123456789012345678';
const scope = 'guild:987654321098765432';
async function scalar<T>(sql: string): Promise<T> {
  const result = await db.query<{ value: T }>(sql);
  return result.rows[0]!.value;
}
async function fails(sql: string, pattern?: RegExp) {
  await db.exec('savepoint expected_failure');
  try {
    await expect(db.exec(sql)).rejects.toThrow(pattern);
  } finally {
    await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');
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
    create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb);
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
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
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
        `select source_id as value from public.entry_relations where target_id=${restaurant}`,
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
    await fails(operation(1, 'add_item', { ...add, id: secondItem }), /trip_duplicate/);
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
