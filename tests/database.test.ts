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
  it('shares trips with other members while keeping editing with the author or local admin', async () => {
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
      /row.level security/i,
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
