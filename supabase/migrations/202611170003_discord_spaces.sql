-- Phase 2 is additive. Global catalog tables and their admin policies are preserved.
alter table public.profiles
  add column global_name text,
  add column avatar_hash text,
  add column banner_hash text,
  add column banner_url text,
  add column accent_color integer check (accent_color between 0 and 16777215),
  add column discord_synced_at timestamptz;

create table public.discord_guilds (
  id text primary key check (id ~ '^[0-9]{17,20}$'),
  application_id text not null check (application_id ~ '^[0-9]{17,20}$'),
  name text not null check (length(name) between 1 and 100),
  icon_hash text, icon_url text,
  bot_present boolean not null default false,
  last_synced_at timestamptz not null default now(),
  members_can_create_trips boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index discord_guilds_application_idx on public.discord_guilds(application_id,bot_present);

-- Not exposed through PostgREST. Only trusted service RPCs can write verification results.
create table private.discord_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  encrypted_tokens text not null,
  expires_at timestamptz not null,
  scopes text[] not null,
  version integer not null default 1,
  refresh_lease uuid, refresh_lease_until timestamptz,
  updated_at timestamptz not null default now()
);
create table private.guild_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  guild_id text not null references public.discord_guilds(id) on delete cascade,
  permissions text not null check (permissions ~ '^[0-9]{1,30}$'),
  is_owner boolean not null default false,
  expires_at timestamptz not null,
  primary key(user_id,guild_id)
);
create index membership_guild_idx on private.guild_memberships(guild_id,user_id);
create table private.guild_snapshots (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create table private.bot_guild_inventory (
  application_id text primary key, verified_at timestamptz not null default now()
);

create table public.user_guild_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_guild_id text references public.discord_guilds(id) on delete set null,
  last_active_guild_id text references public.discord_guilds(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index preferences_default_guild_idx on public.user_guild_preferences(default_guild_id);
create index preferences_last_guild_idx on public.user_guild_preferences(last_active_guild_id);

create type public.trip_status as enum ('planned','ongoing','completed','cancelled');
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.discord_guilds(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description)<=4000),
  cover_image_url text check (cover_image_url is null or (cover_image_url like 'https://%' and length(cover_image_url)<=2000)),
  start_date date, end_date date,
  status public.trip_status not null default 'planned',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date<=end_date)
);
create index trips_guild_created_idx on public.trips(guild_id,created_at desc);
create index trips_author_idx on public.trips(created_by);
create table public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_number integer not null check(day_number>0),
  date date, title text not null default '' check(length(title)<=160),
  sort_order integer not null default 0 check(sort_order>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(trip_id,day_number), unique(id,trip_id)
);
create table public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_day_id uuid,
  entry_id uuid not null references public.entries(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  notes text not null default '' check(length(notes)<=4000),
  sort_order integer not null default 0 check(sort_order>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(trip_day_id,trip_id) references public.trip_days(id,trip_id) on delete cascade
);
create index trip_items_order_idx on public.trip_items(trip_id,sort_order);
create index trip_items_day_idx on public.trip_items(trip_day_id,trip_id);
create index trip_items_entry_idx on public.trip_items(entry_id);
create index trip_items_author_idx on public.trip_items(added_by);

do $$ declare t text; begin
 foreach t in array array['discord_guilds','user_guild_preferences','trips','trip_days','trip_items'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;

create function public.is_guild_member(p_guild_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.guild_memberships m join public.discord_guilds g on g.id=m.guild_id
   where m.user_id=auth.uid() and m.guild_id=p_guild_id and m.expires_at>now()
   and g.bot_present and g.last_synced_at>now()-interval '120 seconds')
$$;
create function public.is_guild_admin(p_guild_id text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_guild_member(p_guild_id) and exists(select 1 from private.guild_memberships m
  where m.user_id=auth.uid() and m.guild_id=p_guild_id and (m.is_owner or mod(floor(m.permissions::numeric/8),2)=1 or mod(floor(m.permissions::numeric/32),2)=1))
$$;
create function public.can_create_guild_trip(p_guild_id text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_guild_member(p_guild_id) and (public.is_guild_admin(p_guild_id) or exists(select 1 from public.discord_guilds where id=p_guild_id and members_can_create_trips))
$$;
create function public.can_edit_guild_trip(p_trip_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t where t.id=p_trip_id and public.is_guild_member(t.guild_id) and (t.created_by=auth.uid() or public.is_guild_admin(t.guild_id)))
$$;

create policy guild_read on public.discord_guilds for select to authenticated using(public.is_guild_member(id));
create policy guild_settings on public.discord_guilds for update to authenticated using(public.is_guild_admin(id)) with check(public.is_guild_admin(id));
create policy preferences_read on public.user_guild_preferences for select to authenticated using(user_id=auth.uid());
create policy preferences_insert on public.user_guild_preferences for insert to authenticated with check(user_id=auth.uid() and (default_guild_id is null or public.is_guild_member(default_guild_id)) and (last_active_guild_id is null or public.is_guild_member(last_active_guild_id)));
create policy preferences_update on public.user_guild_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (default_guild_id is null or public.is_guild_member(default_guild_id)) and (last_active_guild_id is null or public.is_guild_member(last_active_guild_id)));
create policy trip_read on public.trips for select to authenticated using(public.is_guild_member(guild_id));
create policy trip_create on public.trips for insert to authenticated with check(created_by=auth.uid() and public.can_create_guild_trip(guild_id));
create policy trip_update on public.trips for update to authenticated using(public.can_edit_guild_trip(id)) with check(public.can_edit_guild_trip(id));
create policy trip_delete on public.trips for delete to authenticated using(public.can_edit_guild_trip(id));
create policy day_read on public.trip_days for select to authenticated using(exists(select 1 from public.trips where id=trip_id));
create policy day_write on public.trip_days for all to authenticated using(public.can_edit_guild_trip(trip_id)) with check(public.can_edit_guild_trip(trip_id));
create policy item_read on public.trip_items for select to authenticated using(exists(select 1 from public.trips where id=trip_id));
create policy item_insert on public.trip_items for insert to authenticated with check(public.can_edit_guild_trip(trip_id) and added_by=auth.uid() and exists(select 1 from public.entries where id=entry_id and published));
create policy item_update on public.trip_items for update to authenticated using(public.can_edit_guild_trip(trip_id)) with check(public.can_edit_guild_trip(trip_id));
create policy item_delete on public.trip_items for delete to authenticated using(public.can_edit_guild_trip(trip_id));

revoke all on public.discord_guilds,public.user_guild_preferences,public.trips,public.trip_days,public.trip_items from anon,authenticated;
grant select on public.discord_guilds,public.user_guild_preferences,public.trips,public.trip_days,public.trip_items to authenticated;
grant update(members_can_create_trips) on public.discord_guilds to authenticated;
grant insert,delete on public.trips,public.trip_days,public.trip_items to authenticated;
grant update(title,description,cover_image_url,start_date,end_date,status) on public.trips to authenticated;
grant update(day_number,date,title,sort_order) on public.trip_days to authenticated;
grant update(trip_day_id,notes,sort_order) on public.trip_items to authenticated;
grant insert on public.user_guild_preferences to authenticated;
grant update(default_guild_id,last_active_guild_id) on public.user_guild_preferences to authenticated;
grant all on public.discord_guilds,public.user_guild_preferences,public.trips,public.trip_days,public.trip_items to service_role;

-- Credential RPCs are service-only. AEAD encryption is performed by the backend.
create function public.save_discord_credentials(p_user_id uuid,p_discord_id text,p_profile jsonb,p_encrypted_tokens text,p_expires_at timestamptz,p_scopes text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.identities where user_id=p_user_id and provider='discord' and provider_id=p_discord_id) then raise exception 'Discord identity mismatch' using errcode='42501'; end if;
 update public.profiles set username=p_profile->>'username',global_name=p_profile->>'global_name',display_name=coalesce(nullif(p_profile->>'global_name',''),p_profile->>'username'),avatar_hash=p_profile->>'avatar',avatar_url=p_profile->>'avatar_url',banner_hash=p_profile->>'banner',banner_url=p_profile->>'banner_url',accent_color=(p_profile->>'accent_color')::integer,discord_synced_at=now() where id=p_user_id and discord_id=p_discord_id;
 if not found then raise exception 'Verified profile required'; end if;
 insert into private.discord_credentials(user_id,encrypted_tokens,expires_at,scopes) values(p_user_id,p_encrypted_tokens,p_expires_at,p_scopes)
 on conflict(user_id) do update set encrypted_tokens=excluded.encrypted_tokens,expires_at=excluded.expires_at,scopes=excluded.scopes,version=private.discord_credentials.version+1,refresh_lease=null,refresh_lease_until=null,updated_at=now();
 delete from private.guild_snapshots where user_id=p_user_id;
end $$;
create function public.read_discord_credentials(p_user_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(c) from private.discord_credentials c where user_id=p_user_id
$$;
create function public.claim_discord_refresh(p_user_id uuid,p_version integer,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update private.discord_credentials set refresh_lease=p_lease,refresh_lease_until=now()+interval '30 seconds' where user_id=p_user_id and version=p_version and (refresh_lease_until is null or refresh_lease_until<now()); return found;
end $$;
create function public.finish_discord_refresh(p_user_id uuid,p_lease uuid,p_encrypted_tokens text,p_expires_at timestamptz,p_scopes text[]) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update private.discord_credentials set encrypted_tokens=p_encrypted_tokens,expires_at=p_expires_at,scopes=p_scopes,version=version+1,refresh_lease=null,refresh_lease_until=null,updated_at=now() where user_id=p_user_id and refresh_lease=p_lease and refresh_lease_until>now(); return found;
end $$;
create function public.release_discord_refresh(p_user_id uuid,p_lease uuid) returns void language sql security definer set search_path='' as $$
 update private.discord_credentials set refresh_lease=null,refresh_lease_until=null where user_id=p_user_id and refresh_lease=p_lease
$$;
create function public.revoke_discord_credentials(p_user_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.discord_credentials where user_id=p_user_id and version=p_version;
 if found then delete from private.guild_memberships where user_id=p_user_id; delete from private.guild_snapshots where user_id=p_user_id; end if;
end $$;

create function public.reconcile_discord_guilds(p_application_id text,p_guilds jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('nagi-guilds:'||p_application_id,0));
 insert into public.discord_guilds(id,application_id,name,icon_hash,icon_url,bot_present,last_synced_at)
 select g->>'id',p_application_id,g->>'name',g->>'icon',g->>'icon_url',true,now() from jsonb_array_elements(p_guilds) g
 on conflict(id) do update set name=excluded.name,icon_hash=excluded.icon_hash,icon_url=excluded.icon_url,bot_present=true,last_synced_at=now() where public.discord_guilds.application_id=p_application_id;
 update public.discord_guilds set bot_present=false,last_synced_at=now() where application_id=p_application_id and id not in (select g->>'id' from jsonb_array_elements(p_guilds) g);
 insert into private.bot_guild_inventory(application_id) values(p_application_id) on conflict(application_id) do update set verified_at=now();
 delete from private.guild_memberships m using public.discord_guilds g where m.guild_id=g.id and g.application_id=p_application_id and not g.bot_present;
 update public.user_guild_preferences set default_guild_id=case when default_guild_id in(select id from public.discord_guilds where not bot_present and application_id=p_application_id) then null else default_guild_id end,last_active_guild_id=case when last_active_guild_id in(select id from public.discord_guilds where not bot_present and application_id=p_application_id) then null else last_active_guild_id end
 where default_guild_id in(select id from public.discord_guilds where not bot_present and application_id=p_application_id) or last_active_guild_id in(select id from public.discord_guilds where not bot_present and application_id=p_application_id);
end $$;
create function public.set_discord_guild_presence(p_application_id text,p_guild jsonb,p_present boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('nagi-guilds:'||p_application_id,0));
 insert into public.discord_guilds(id,application_id,name,icon_hash,icon_url,bot_present,last_synced_at) values(p_guild->>'id',p_application_id,p_guild->>'name',p_guild->>'icon',p_guild->>'icon_url',p_present,now())
 on conflict(id) do update set name=excluded.name,icon_hash=excluded.icon_hash,icon_url=excluded.icon_url,bot_present=p_present,last_synced_at=now() where public.discord_guilds.application_id=p_application_id;
 if not p_present then
  delete from private.guild_memberships where guild_id=p_guild->>'id';
  update public.user_guild_preferences set default_guild_id=case when default_guild_id=p_guild->>'id' then null else default_guild_id end,last_active_guild_id=case when last_active_guild_id=p_guild->>'id' then null else last_active_guild_id end where default_guild_id=p_guild->>'id' or last_active_guild_id=p_guild->>'id';
 end if;
end $$;
create function public.record_discord_memberships(p_user_id uuid,p_application_id text,p_guilds jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('nagi-membership:'||p_user_id::text,0));
 delete from private.guild_memberships where user_id=p_user_id;
 insert into private.guild_memberships(user_id,guild_id,permissions,is_owner,expires_at)
 select p_user_id,g.id,coalesce(u->>'permissions','0'),coalesce((u->>'owner')::boolean,false),now()+interval '60 seconds' from jsonb_array_elements(p_guilds) u join public.discord_guilds g on g.id=u->>'id' where g.application_id=p_application_id and g.bot_present and g.last_synced_at>now()-interval '120 seconds';
 insert into private.guild_snapshots(user_id) values(p_user_id) on conflict(user_id) do update set verified_at=now();
 update public.user_guild_preferences set default_guild_id=case when default_guild_id in(select guild_id from private.guild_memberships where user_id=p_user_id) then default_guild_id else null end,last_active_guild_id=case when last_active_guild_id in(select guild_id from private.guild_memberships where user_id=p_user_id) then last_active_guild_id else null end where user_id=p_user_id;
end $$;
create function public.read_discord_guild_snapshot(p_user_id uuid,p_application_id text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('verified_at',s.verified_at,'bot_verified_at',b.verified_at,'guilds',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('permissions',m.permissions,'owner',m.is_owner)) from private.guild_memberships m join public.discord_guilds g on g.id=m.guild_id where m.user_id=p_user_id and m.expires_at>now() and g.application_id=p_application_id and g.bot_present and g.last_synced_at>now()-interval '120 seconds'),'[]'::jsonb))
 from private.guild_snapshots s left join private.bot_guild_inventory b on b.application_id=p_application_id where s.user_id=p_user_id
$$;
create function public.trip_author_card(p_trip_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('display_name',p.display_name,'avatar_url',p.avatar_url) from public.trips t join public.profiles p on p.id=t.created_by where t.id=p_trip_id and public.is_guild_member(t.guild_id)
$$;

-- New functions are deny-by-default. Ordinary accounts cannot forge memberships or read tokens.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_guild_member','is_guild_admin','can_create_guild_trip','can_edit_guild_trip','save_discord_credentials','read_discord_credentials','claim_discord_refresh','finish_discord_refresh','release_discord_refresh','revoke_discord_credentials','reconcile_discord_guilds','set_discord_guild_presence','record_discord_memberships','read_discord_guild_snapshot','trip_author_card') loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.is_guild_member(text),public.is_guild_admin(text),public.can_create_guild_trip(text),public.can_edit_guild_trip(uuid),public.trip_author_card(uuid) to authenticated;
