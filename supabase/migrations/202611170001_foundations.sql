-- Nagi v3: all access decisions are made from trusted identities and database roles.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('user', 'admin', 'owner');
create table private.owner_ids (discord_id text primary key check (discord_id ~ '^[0-9]{17,20}$'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text not null unique check (discord_id ~ '^[0-9]{17,20}$'),
  username text not null,
  display_name text not null,
  avatar_url text,
  role public.app_role not null default 'user',
  last_login_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  code text unique check (code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  neighborhoods_enabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (country_id, slug)
);
create table public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(city_id, slug), unique(id, city_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  neighborhood_id uuid,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 180),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 20000),
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (neighborhood_id, city_id) references public.neighborhoods(id, city_id) on delete restrict,
  unique(city_id, category_id, slug)
);
create index entries_geo_idx on public.entries(city_id, neighborhood_id, category_id);
create index entries_category_idx on public.entries(category_id);
create index entries_published_idx on public.entries(published) where published;
create index entries_author_idx on public.entries(created_by);
create table public.entry_relations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.entries(id) on delete cascade,
  target_id uuid not null references public.entries(id) on delete cascade,
  kind text not null default 'related' check (kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  bidirectional boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (source_id <> target_id), unique(source_id, target_id, kind)
);
create unique index relations_symmetric_idx on public.entry_relations(least(source_id,target_id),greatest(source_id,target_id),kind) where bidirectional;
create index relations_target_idx on public.entry_relations(target_id);

create table public.bot_runtime (
  application_id text not null check (application_id ~ '^[0-9]{17,20}$'),
  scope text not null check (scope = 'global' or scope ~ '^guild:[0-9]{17,20}$'),
  instance_id uuid,
  lease_token uuid,
  lease_until timestamptz,
  connected boolean not null default false,
  heartbeat_at timestamptz,
  started_at timestamptz,
  last_sync_at timestamptz,
  command_count integer not null default 0 check (command_count >= 0),
  commands jsonb not null default '[]'::jsonb check (jsonb_typeof(commands) = 'array'),
  sync_error text,
  updated_at timestamptz not null default now(),
  primary key(application_id, scope)
);
create table public.bot_sync_requests (
  id uuid primary key default gen_random_uuid(),
  application_id text not null check (application_id ~ '^[0-9]{17,20}$'),
  scope text not null check (scope = 'global' or scope ~ '^guild:[0-9]{17,20}$'),
  reason text not null check (reason in ('web-startup','bot-startup','admin')),
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed')),
  attempts integer not null default 0,
  lease_token uuid,
  available_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index sync_pending_idx on public.bot_sync_requests(application_id,scope) where status = 'pending';
create index sync_queue_idx on public.bot_sync_requests(application_id,scope,status,available_at);
create index sync_requested_by_idx on public.bot_sync_requests(requested_by);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','countries','cities','neighborhoods','categories','entries','entry_relations','bot_runtime','bot_sync_requests'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
  end loop;
end $$;

-- Lock the city so disabling neighborhoods cannot race an entry creation.
create function public.check_entry_neighborhood() returns trigger language plpgsql set search_path = '' as $$
declare enabled boolean;
begin
  select neighborhoods_enabled into enabled from public.cities where id = new.city_id for share;
  if new.neighborhood_id is not null and enabled is not true then
    raise exception 'Neighborhoods are disabled for this city' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger check_entry_neighborhood before insert or update on public.entries for each row execute function public.check_entry_neighborhood();
create function public.check_city_neighborhoods() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.neighborhoods_enabled and not new.neighborhoods_enabled and exists(select 1 from public.entries where city_id=new.id and neighborhood_id is not null) then
    raise exception 'Detach entries from neighborhoods before disabling them' using errcode = '23514';
  end if; return new;
end $$;
create trigger check_city_neighborhoods before update on public.cities for each row execute function public.check_city_neighborhoods();

create function public.is_nagi_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and
   (p.role='admin' or exists(select 1 from private.owner_ids o where o.discord_id=p.discord_id)))
$$;
-- Deployment configuration, accessible only to the service role.
create function public.configure_owners(p_ids text[]) returns void language plpgsql security definer set search_path = '' as $$
begin
  lock table private.owner_ids in exclusive mode;
  delete from private.owner_ids;
  insert into private.owner_ids select distinct unnest(p_ids);
  update public.profiles set role = case when discord_id=any(p_ids) then 'owner'::public.app_role else 'user'::public.app_role end
    where role='owner' or discord_id=any(p_ids);
end $$;

-- Never read user-editable raw_user_meta_data for identity or privileges.
create function public.sync_discord_profile() returns public.profiles language plpgsql security definer set search_path = '' as $$
declare identity_record record; result public.profiles; discord text; desired_role public.app_role;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select i.provider_id, i.identity_data, u.last_sign_in_at into identity_record
    from auth.identities i join auth.users u on u.id=i.user_id
    where i.user_id=auth.uid() and i.provider='discord' limit 1;
  if not found then raise exception 'Discord identity required' using errcode='42501'; end if;
  discord := identity_record.provider_id;
  if discord !~ '^[0-9]{17,20}$' then raise exception 'Invalid Discord identity'; end if;
  desired_role := case when exists(select 1 from private.owner_ids where discord_id=discord) then 'owner'::public.app_role else 'user'::public.app_role end;
  insert into public.profiles(id, discord_id, username, display_name, avatar_url, last_login_at, role)
  values(auth.uid(),discord,
    coalesce(nullif(identity_record.identity_data->>'preferred_username',''),identity_record.identity_data->>'name',discord),
    coalesce(nullif(identity_record.identity_data->>'full_name',''),identity_record.identity_data->>'name',discord),
    identity_record.identity_data->>'avatar_url',coalesce(identity_record.last_sign_in_at,now()),desired_role)
  on conflict(id) do update set
    discord_id=excluded.discord_id,username=excluded.username,display_name=excluded.display_name,
    avatar_url=excluded.avatar_url,last_login_at=excluded.last_login_at,
    role=case when excluded.role='owner' then excluded.role when public.profiles.role='admin' then 'admin'::public.app_role else 'user'::public.app_role end
  returning * into result;
  return result;
end $$;

create function public.enqueue_bot_sync(p_application_id text,p_scope text,p_reason text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not public.is_nagi_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.bot_sync_requests(application_id,scope,reason,requested_by)
    values(p_application_id,p_scope,p_reason,auth.uid())
    on conflict(application_id,scope) where status='pending' do update set updated_at=now()
    returning id into result;
  return result;
end $$;

-- A database lease protects the only process allowed to modify this exact Discord scope.
create function public.acquire_bot_lease(p_application_id text,p_scope text,p_instance uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  insert into public.bot_runtime(application_id,scope,instance_id,lease_token,lease_until,started_at)
  values(p_application_id,p_scope,p_instance,gen_random_uuid(),now()+interval '90 seconds',now())
  on conflict(application_id,scope) do update set instance_id=p_instance,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',started_at=now(),connected=false
  where public.bot_runtime.lease_until < now() or public.bot_runtime.lease_until is null
  returning lease_token into result;
  return result;
end $$;
create function public.renew_bot_lease(p_application_id text,p_scope text,p_token uuid,p_connected boolean) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.bot_runtime set lease_until=now()+interval '90 seconds',heartbeat_at=now(),connected=p_connected
    where application_id=p_application_id and scope=p_scope and lease_token=p_token and lease_until>now();
  return found;
end $$;
create function public.release_bot_lease(p_application_id text,p_scope text,p_token uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bot_runtime set lease_until=now(),connected=false
    where application_id=p_application_id and scope=p_scope and lease_token=p_token;
end $$;
create function public.claim_bot_sync(p_application_id text,p_scope text,p_token uuid) returns setof public.bot_sync_requests language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  perform 1 from public.bot_runtime where application_id=p_application_id and scope=p_scope and lease_token=p_token and lease_until>now() for update;
  if not found then raise exception 'Lease lost'; end if;
  select id into request_id from public.bot_sync_requests where application_id=p_application_id and scope=p_scope
    and ((status='pending' and available_at<=now()) or (status='processing' and (lease_token is distinct from p_token or updated_at<now()-interval '2 minutes')))
    order by created_at for update skip locked limit 1;
  return query update public.bot_sync_requests set status='processing',lease_token=p_token,attempts=attempts+1 where id=request_id returning *;
end $$;
create function public.finish_bot_sync(p_id uuid,p_token uuid,p_success boolean,p_error text,p_commands jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare req public.bot_sync_requests; next_status text;
begin
  select * into req from public.bot_sync_requests where id=p_id and lease_token=p_token and status='processing' for update;
  if not found then raise exception 'Request lease lost'; end if;
  perform 1 from public.bot_runtime where application_id=req.application_id and scope=req.scope and lease_token=p_token and lease_until>now() for update;
  if not found then raise exception 'Lease lost'; end if;
  -- When a newer pending request exists, fail this attempt instead of violating queue coalescing.
  next_status := case when p_success then 'succeeded' when req.attempts>=5 or exists(select 1 from public.bot_sync_requests q where q.application_id=req.application_id and q.scope=req.scope and q.status='pending') then 'failed' else 'pending' end;
  update public.bot_sync_requests set
    status=next_status,
    error=case when p_success then null else left(p_error,500) end,finished_at=case when next_status in ('succeeded','failed') then now() else null end,
    available_at=now()+make_interval(secs=>least(300,10*(2^least(attempts,5))::integer)),lease_token=null
  where id=p_id;
  update public.bot_runtime set
    last_sync_at=case when p_success then now() else last_sync_at end,
    command_count=case when p_success then jsonb_array_length(p_commands) else command_count end,
    commands=case when p_success then p_commands else commands end,
    sync_error=case when p_success then null else left(p_error,500) end
  where application_id=req.application_id and scope=req.scope;
end $$;

-- RLS: no profile write policy, no browser write access to operational tables.
alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_nagi_admin());
do $$ declare t text; begin
  foreach t in array array['countries','cities','neighborhoods','categories'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy content_read on public.%I for select to anon,authenticated using(true)',t);
    execute format('create policy content_admin on public.%I for all to authenticated using(public.is_nagi_admin()) with check(public.is_nagi_admin())',t);
  end loop;
end $$;
alter table public.entries enable row level security;
create policy entries_read on public.entries for select to anon,authenticated using(published or public.is_nagi_admin());
create policy entries_admin on public.entries for all to authenticated using(public.is_nagi_admin()) with check(public.is_nagi_admin());
alter table public.entry_relations enable row level security;
create policy relations_read on public.entry_relations for select to anon,authenticated using(
  exists(select 1 from public.entries where id=source_id) and exists(select 1 from public.entries where id=target_id));
create policy relations_admin on public.entry_relations for all to authenticated using(public.is_nagi_admin()) with check(public.is_nagi_admin());
alter table public.bot_runtime enable row level security;
alter table public.bot_sync_requests enable row level security;
create policy runtime_read on public.bot_runtime for select to authenticated using(public.is_nagi_admin());
create policy requests_read on public.bot_sync_requests for select to authenticated using(public.is_nagi_admin());

revoke all on all tables in schema public from anon,authenticated;
grant select on public.countries,public.cities,public.neighborhoods,public.categories,public.entries,public.entry_relations to anon,authenticated;
grant insert,update,delete on public.countries,public.cities,public.neighborhoods,public.categories,public.entries,public.entry_relations to authenticated;
grant select on public.profiles,public.bot_runtime,public.bot_sync_requests to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_nagi_admin() to anon,authenticated,service_role;
grant execute on function public.sync_discord_profile() to authenticated;
grant execute on function public.enqueue_bot_sync(text,text,text) to authenticated,service_role;
grant execute on all functions in schema public to service_role;

-- Editable data, never a hardcoded list in the applications.
insert into public.categories(name,slug,position) values
('Tourisme','tourisme',0),('Activités','activites',1),('Gastronomie','gastronomie',2),('Produits locaux','produits-locaux',3),('Adresses','adresses',4);
