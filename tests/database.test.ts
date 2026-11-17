import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const db = new PGlite();
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
    await db.exec("insert into public.countries(name,slug) values ('Japon','japon')");
    await fails("insert into public.countries(name,slug) values ('Duplicate','japon')", /unique/i);
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
    await db.exec(`insert into public.countries(name,slug) values('Japon','japon');
      insert into public.cities(country_id,name,slug,neighborhoods_enabled) select id,'Tokyo','tokyo',true from public.countries;
      insert into public.cities(country_id,name,slug) select id,'Kyoto','kyoto' from public.countries;
      insert into public.neighborhoods(city_id,name,slug) select id,'Shinjuku','shinjuku' from public.cities where slug='tokyo';`);
    await fails(
      `insert into public.entries(city_id,neighborhood_id,category_id,title,slug)
      select c.id,n.id,k.id,'Test','test' from public.cities c,public.neighborhoods n,public.categories k where c.slug='kyoto' limit 1`,
      /disabled/i,
    );
    await db.exec("update public.cities set neighborhoods_enabled=true where slug='kyoto'");
    await fails(
      `insert into public.entries(city_id,neighborhood_id,category_id,title,slug)
      select c.id,n.id,k.id,'Test','test' from public.cities c,public.neighborhoods n,public.categories k where c.slug='kyoto' limit 1`,
      /foreign key/i,
    );
    await db.exec(`insert into public.entries(city_id,neighborhood_id,category_id,title,slug)
      select c.id,n.id,k.id,'Test','test' from public.cities c,public.neighborhoods n,public.categories k where c.slug='tokyo' limit 1`);
    await fails(
      "update public.cities set neighborhoods_enabled=false where slug='tokyo'",
      /Detach entries/i,
    );
  });
  it('enforces bidirectional uniqueness, no self-links, and dependency deletion rules', async () => {
    await db.exec(`insert into public.countries(name,slug) values('Japon','japon');
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
    await db.exec(`insert into public.countries(name,slug) values('Japon','japon');
      insert into public.cities(country_id,name,slug) select id,'Kyoto','kyoto' from public.countries;
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
