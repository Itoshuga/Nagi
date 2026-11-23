-- Open photographic metadata only. Mapbox presentation/query/context is never
-- persisted in these tables. Existing entry_media remains the upload gallery.
create table public.external_images (
  id uuid primary key,
  provider text not null check(provider in ('wikimedia','wikipedia','openverse')),
  source_id text not null unique check(length(source_id) between 1 and 500),
  metadata jsonb not null check(jsonb_typeof(metadata)='object'
    and metadata ?& array['license','licenseUrl','imageUrl','thumbnailUrl','sourceUrl']
    and metadata->>'license' in ('CC0','Public domain','CC BY','CC BY-SA')
    and metadata->>'imageUrl' like 'https://upload.wikimedia.org/%'
    and (metadata->>'thumbnailUrl' like 'https://upload.wikimedia.org/%' or metadata->>'thumbnailUrl' like 'https://thumb.wikimedia.org/%')
    and metadata->>'sourceUrl' like 'https://commons.wikimedia.org/%'
    and metadata->>'licenseUrl' like 'https://creativecommons.org/%'),
  available boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.image_resolution_cache (
  cache_key text primary key check(cache_key ~ '^[a-f0-9]{64}$'),
  selected uuid references public.external_images(id) on delete set null,
  candidates uuid[] not null default '{}' check(cardinality(candidates)<=6),
  confidence text not null default 'none' check(confidence in ('high','ambiguous','none')),
  coordinate_evidence boolean not null default false,
  reasons text[] not null default '{}',
  entity text check(entity ~ '^Q[1-9][0-9]*$'),
  expires_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz
);
create index image_resolution_cache_selected_idx on public.image_resolution_cache(selected);
create index image_resolution_cache_expiry_idx on public.image_resolution_cache(expires_at);
create index image_resolution_cache_lease_idx on public.image_resolution_cache(lease_until) where lease_until is not null;
create table private.image_resolver_usage (
  bucket text not null,
  window_at timestamptz not null,
  calls integer not null default 0,
  primary key(bucket,window_at)
);
create table public.place_image_assignments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.entries(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  -- Same visit UUID moves between trip_items and trip_item_stops. A foreign
  -- key to either table would delete the override during nest/detach.
  visit_id uuid,
  mode text not null check(mode in ('automatic','manual','fallback')),
  image_id uuid references public.external_images(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check((entry_id is not null and trip_id is null and visit_id is null) or
    (entry_id is null and trip_id is not null and visit_id is not null)),
  unique(entry_id), unique(trip_id,visit_id)
);
create index place_image_assignments_image_idx on public.place_image_assignments(image_id);
create index place_image_assignments_actor_idx on public.place_image_assignments(assigned_by);

create function public.can_read_image_visit(p_trip uuid,p_visit uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips t where t.id=p_trip and public.is_guild_member(t.guild_id)
   and (exists(select 1 from public.trip_items i where i.id=p_visit and i.trip_id=t.id)
     or exists(select 1 from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id where s.id=p_visit and i.trip_id=t.id)))
$$;
revoke execute on function public.can_read_image_visit(uuid,uuid) from public,anon;
grant execute on function public.can_read_image_visit(uuid,uuid) to authenticated,service_role;

alter table public.external_images enable row level security;
alter table public.image_resolution_cache enable row level security;
alter table public.place_image_assignments enable row level security;
create policy open_image_read on public.external_images for select to anon,authenticated using(available and verified_at>now()-interval '30 days');
create policy image_cache_server on public.image_resolution_cache for all to service_role using(true) with check(true);
create policy catalog_image_assignment_read on public.place_image_assignments for select to anon,authenticated using(
  entry_id is not null and exists(select 1 from public.entries e where e.id=entry_id and (e.published or (select public.is_nagi_admin())))
);
create policy trip_image_assignment_read on public.place_image_assignments for select to authenticated using(trip_id is not null and public.can_read_image_visit(trip_id,visit_id));
revoke all on public.external_images,public.image_resolution_cache,public.place_image_assignments from public,anon,authenticated;
grant select on public.external_images,public.place_image_assignments to anon,authenticated;
grant all on public.external_images,public.image_resolution_cache,public.place_image_assignments to service_role;
-- No browser access to provider caches, leases or usage counters.
revoke all on private.image_resolver_usage from public,anon,authenticated;
grant all on private.image_resolver_usage to service_role;

create function public.reserve_image_resolution(p_actor uuid,p_key text,p_openverse boolean default false,p_coordinates boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); minute_at timestamptz:=date_trunc('minute',now()); day_at timestamptz:=date_trunc('day',now()); n integer;
begin
 if p_actor is null or p_key is null or not exists(select 1 from public.profiles where id=p_actor) or p_key !~ '^[a-f0-9]{64}$' then raise exception 'image_forbidden' using errcode='42501'; end if;
 -- Serialise quota checks and global lease count across server instances.
 perform pg_advisory_xact_lock(743191735);
 delete from private.image_resolver_usage where window_at<now()-interval '2 days';
 delete from public.image_resolution_cache where expires_at<now()-interval '60 days' and (lease_until is null or lease_until<now());
 delete from public.place_image_assignments a where a.trip_id is not null and a.updated_at<now()-interval '1 day'
   and not exists(select 1 from public.trip_items i where i.id=a.visit_id and i.trip_id=a.trip_id)
   and not exists(select 1 from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id where s.id=a.visit_id and i.trip_id=a.trip_id);
 if p_openverse then
   insert into private.image_resolver_usage values('openverse:day',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1 returning calls into n;
   if n>90 then return null; end if;
   -- Conservative anonymous budget: at most one request per minute globally.
   insert into private.image_resolver_usage values('openverse:minute',minute_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1 returning calls into n;
   if n>1 then return null; end if;
   return token;
 end if;
 insert into public.image_resolution_cache(cache_key) values(p_key) on conflict do nothing;
 if exists(select 1 from public.image_resolution_cache where cache_key=p_key and
   ((expires_at>now() and not (p_coordinates and not coordinate_evidence and confidence<>'high')) or lease_until>now())) then return null; end if;
 if (select count(*) from public.image_resolution_cache where lease_until>now())>=2 then return null; end if;
 insert into private.image_resolver_usage values(p_actor::text||':minute',minute_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1 returning calls into n;
 if n>10 then return null; end if;
 insert into private.image_resolver_usage values(p_actor::text||':day',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1 returning calls into n;
 if n>100 then return null; end if;
 insert into private.image_resolver_usage values('all',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1 returning calls into n;
 if n>2000 then return null; end if;
 update public.image_resolution_cache set lease_id=token,lease_until=now()+interval '100 seconds' where cache_key=p_key;
 return token;
end $$;
revoke execute on function public.reserve_image_resolution(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.reserve_image_resolution(uuid,text,boolean,boolean) to service_role;

create function public.set_place_image(p_entry uuid default null,p_trip uuid default null,p_visit uuid default null,p_mode text default 'automatic',p_image uuid default null,p_revision integer default 0) returns integer
language plpgsql security definer set search_path='' as $$
declare current_row public.place_image_assignments; target uuid; next_revision integer;
begin
 if auth.uid() is null then raise exception 'image_forbidden' using errcode='42501'; end if;
 if p_entry is not null and p_trip is null and p_visit is null then
   if not public.is_nagi_admin() or not exists(select 1 from public.entries where id=p_entry) then raise exception 'image_forbidden' using errcode='42501'; end if;
 elsif p_entry is null and p_trip is not null and p_visit is not null then
   if not public.can_read_image_visit(p_trip,p_visit) or not public.can_edit_guild_trip(p_trip) then raise exception 'image_forbidden' using errcode='42501'; end if;
 else raise exception 'image_target_invalid' using errcode='22023'; end if;
 if p_mode is null or p_revision is null or p_revision<0 or p_mode not in ('automatic','manual','fallback') or (p_mode='manual' and p_image is null) or (p_mode<>'manual' and p_image is not null) then raise exception 'image_mode_invalid' using errcode='22023'; end if;
 if p_image is not null and not exists(select 1 from public.external_images where id=p_image and available and verified_at>now()-interval '30 days') then raise exception 'image_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_entry::text,p_trip::text||':'||p_visit::text),0));
 select * into current_row from public.place_image_assignments where entry_id=p_entry or (trip_id=p_trip and visit_id=p_visit) for update;
 if coalesce(current_row.revision,0)<>p_revision then raise exception 'image_conflict' using errcode='40001'; end if;
 next_revision:=coalesce(current_row.revision,0)+1;
 if current_row.id is null then
   insert into public.place_image_assignments(entry_id,trip_id,visit_id,mode,image_id,assigned_by,revision) values(p_entry,p_trip,p_visit,p_mode,p_image,auth.uid(),next_revision);
 else update public.place_image_assignments set mode=p_mode,image_id=p_image,assigned_by=auth.uid(),revision=next_revision,updated_at=now() where id=current_row.id;
 end if;
 return next_revision;
end $$;
revoke execute on function public.set_place_image(uuid,uuid,uuid,text,uuid,integer) from public,anon;
grant execute on function public.set_place_image(uuid,uuid,uuid,text,uuid,integer) to authenticated;

create function private.reset_uploaded_cover_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cover_image_url is distinct from old.cover_image_url then delete from public.place_image_assignments where entry_id=new.id; end if;
 return new;
end $$;
revoke execute on function private.reset_uploaded_cover_image() from public,anon,authenticated;
create trigger reset_uploaded_cover_image after update of cover_image_url on public.entries for each row execute function private.reset_uploaded_cover_image();

-- Realtime broadcasts already authorise trip membership via existing policies.
create function private.broadcast_place_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.trip_id is not null then
   perform realtime.send(jsonb_build_object('visit',new.visit_id),'image_changed','trip:'||new.trip_id::text,true);
 end if;
 return new;
end $$;
revoke execute on function private.broadcast_place_image() from public,anon,authenticated;
create trigger broadcast_place_image after insert or update on public.place_image_assignments for each row execute function private.broadcast_place_image();
