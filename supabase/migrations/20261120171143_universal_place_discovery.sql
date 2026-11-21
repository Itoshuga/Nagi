create type public.trip_item_source as enum ('nagi','google','custom');
alter table public.trip_items alter column entry_id drop not null;
alter table public.trip_item_stops alter column entry_id drop not null;
do $$ declare tab text; begin
  foreach tab in array array['trip_items','trip_item_stops'] loop
    execute format('alter table public.%I
      add column source public.trip_item_source not null default ''nagi'',
      add column google_place_id text,
      add column custom_title text,
      add column custom_location text,
      add column custom_latitude double precision,
      add column custom_longitude double precision,
      add constraint %I check (
        (source=''nagi'' and entry_id is not null and google_place_id is null and custom_title is null and custom_location is null and custom_latitude is null and custom_longitude is null)
        or (source=''google'' and entry_id is null and google_place_id is not null and length(google_place_id) between 10 and 512 and google_place_id ~ ''^[A-Za-z0-9_-]+$'' and custom_title is null and custom_location is null and custom_latitude is null and custom_longitude is null)
        or (source=''custom'' and entry_id is null and google_place_id is null and custom_title is not null and length(btrim(custom_title)) between 1 and 160 and length(coalesce(custom_location,''''))<=500
          and ((custom_latitude is null and custom_longitude is null) or (custom_latitude is not null and custom_longitude is not null and custom_latitude between -90 and 90 and custom_longitude between -180 and 180)))
      )',tab,tab||'_place_source');
    execute format('create index %I on public.%I(google_place_id) where google_place_id is not null',tab||'_google_place_idx',tab);
  end loop;
end $$;
-- Optional editorial association, never an import or a visit identity.
alter table public.entries add column google_place_id text check(google_place_id is null or (length(google_place_id) between 10 and 512 and google_place_id ~ '^[A-Za-z0-9_-]+$'));

create table private.google_place_references (
  place_id text primary key,
  verified_at timestamptz not null default now(),
  replacement_id text,
  available boolean not null default true
);
create table private.trip_place_add_requests (
  id uuid primary key, trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, fingerprint text not null
);
create index trip_place_add_requests_trip_idx on private.trip_place_add_requests(trip_id);
create index trip_place_add_requests_user_idx on private.trip_place_add_requests(user_id);
alter table private.google_place_references enable row level security;
alter table private.trip_place_add_requests enable row level security;
revoke all on private.google_place_references,private.trip_place_add_requests from public,anon,authenticated;

-- Existing audited nesting/detachment functions preserve identity. Copy source
-- metadata before their INSERT constraints run, without rebuilding those RPCs.
create function private.transfer_trip_place_source() returns trigger language plpgsql security definer set search_path='' as $$
declare fields jsonb;
begin
  if new.source='nagi' and new.entry_id is null then
    if tg_table_name='trip_item_stops' then
      select to_jsonb(i) into fields from public.trip_items i join public.trip_items parent on parent.id=new.trip_item_id
        where i.id=new.id and i.trip_id=parent.trip_id;
    else
      select to_jsonb(s) into fields from public.trip_item_stops s join public.trip_items parent on parent.id=s.trip_item_id
        where s.id=new.id and parent.trip_id=new.trip_id;
    end if;
    if fields is not null then
      new.source:=(fields->>'source')::public.trip_item_source;
      new.calendar_color:=coalesce(new.calendar_color,fields->>'calendar_color');
      new.google_place_id:=fields->>'google_place_id'; new.custom_title:=fields->>'custom_title';
      new.custom_location:=fields->>'custom_location'; new.custom_latitude:=(fields->>'custom_latitude')::double precision;
      new.custom_longitude:=(fields->>'custom_longitude')::double precision;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.transfer_trip_place_source() from public,anon,authenticated,service_role;
create trigger transfer_trip_place_source before insert on public.trip_items for each row execute function private.transfer_trip_place_source();
create trigger transfer_trip_place_source before insert on public.trip_item_stops for each row execute function private.transfer_trip_place_source();

alter function public.edit_trip_plan(text,uuid,integer,text,jsonb) set schema private;
alter function private.edit_trip_plan(text,uuid,integer,text,jsonb) rename to edit_trip_plan_before_sources;
revoke execute on function private.edit_trip_plan_before_sources(text,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
create function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare trip public.trips; actor uuid:=auth.uid(); target uuid; parent_ref uuid; entry_ref uuid;
  source_ref public.trip_item_source; place jsonb; google_ref text; title_ref text; location_ref text;
  lat double precision; lng double precision; request_hash text; revised integer;
begin
  if p_operation not in ('add_place','replace_place') then
    return private.edit_trip_plan_before_sources(p_guild,p_trip,p_version,p_operation,p_data);
  end if;
  if actor is null or not public.is_guild_member(p_guild) then raise exception 'trip_forbidden' using errcode='42501'; end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.can_edit_guild_trip(p_trip) or not public.is_guild_member(p_guild) then raise exception 'trip_forbidden' using errcode='42501'; end if;
  target:=(p_data->>'id')::uuid; place:=p_data->'place'; request_hash:=md5(p_data::text);
  if p_operation='add_place' and exists(select 1 from private.trip_place_add_requests where id=target and trip_id=p_trip and user_id=actor and fingerprint=request_hash) then return trip.version; end if;
  if p_version is distinct from trip.version then raise exception 'trip_conflict' using errcode='40001'; end if;
  source_ref:=(place->>'source')::public.trip_item_source;
  if source_ref='nagi' then
    entry_ref:=(place->>'entry')::uuid;
    if not private.visible_trip_entry(entry_ref) then raise exception 'trip_entry_hidden' using errcode='22023'; end if;
  elsif source_ref='google' then
    google_ref:=place->>'placeId';
    if not exists(select 1 from private.google_place_references where place_id=google_ref and available and verified_at>now()-interval '1 day') then
      raise exception 'trip_google_unverified' using errcode='22023'; end if;
  elsif source_ref='custom' then
    title_ref:=btrim(place->>'title'); location_ref:=place->>'location';
    lat:=(place->>'latitude')::double precision; lng:=(place->>'longitude')::double precision;
  else raise exception 'trip_place_invalid' using errcode='22023'; end if;
  if p_operation='replace_place' then
    update public.trip_items set source=source_ref,entry_id=entry_ref,google_place_id=google_ref,custom_title=title_ref,
      custom_location=location_ref,custom_latitude=lat,custom_longitude=lng where id=target and trip_id=p_trip;
    if not found then
      update public.trip_item_stops s set source=source_ref,entry_id=entry_ref,google_place_id=google_ref,custom_title=title_ref,
        custom_location=location_ref,custom_latitude=lat,custom_longitude=lng
        where s.id=target and exists(select 1 from public.trip_items i where i.id=s.trip_item_id and i.trip_id=p_trip);
      if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    end if;
  else
    parent_ref:=(p_data->>'parent')::uuid;
    insert into private.trip_place_add_requests values(target,p_trip,actor,request_hash);
    if parent_ref is not null then
      if not exists(select 1 from public.trip_items where id=parent_ref and trip_id=p_trip) then raise exception 'trip_activity_missing' using errcode='22023'; end if;
      insert into public.trip_item_stops(id,trip_item_id,source,entry_id,google_place_id,custom_title,custom_location,custom_latitude,custom_longitude,added_by,notes,duration_minutes,calendar_color,sort_order)
        values(target,parent_ref,source_ref,entry_ref,google_ref,title_ref,location_ref,lat,lng,actor,coalesce(p_data->>'notes',''),(p_data->>'duration')::integer,upper(p_data->>'color'),private.trip_stop_position(parent_ref,null,(p_data->>'before')::uuid));
    else
      if p_data->>'day' is not null and not exists(select 1 from public.trip_days where id=(p_data->>'day')::uuid and trip_id=p_trip) then raise exception 'trip_day_missing' using errcode='22023'; end if;
      insert into public.trip_items(id,trip_id,trip_day_id,source,entry_id,google_place_id,custom_title,custom_location,custom_latitude,custom_longitude,added_by,notes,start_time,estimated_duration_minutes,calendar_color,sort_order)
        values(target,p_trip,(p_data->>'day')::uuid,source_ref,entry_ref,google_ref,title_ref,location_ref,lat,lng,actor,coalesce(p_data->>'notes',''),(p_data->>'start_time')::time,(p_data->>'duration')::integer,upper(p_data->>'color'),private.trip_item_position(p_trip,(p_data->>'day')::uuid,null,(p_data->>'before')::uuid));
    end if;
  end if;
  update public.trips set updated_at=now() where id=p_trip returning version into revised;
  return revised;
end $$;
revoke execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) to authenticated;

-- Keep the row-level optimistic journal and receipts; only extend its operation
-- dispatch and avoid adding a NULL catalog reference to external-source events.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('private.mutate_trip_plan_before_structure_guards(text,uuid,jsonb)'::regprocedure);
  if position('array[''add_item'',''add_stop''' in definition)=0 then raise exception 'Unexpected mutation dispatcher'; end if;
  execute replace(definition,'array[''add_item'',''add_stop''','array[''add_place'',''replace_place'',''add_item'',''add_stop''');
  definition:=pg_get_functiondef('private.capture_trip_delta()'::regprocedure);
  execute replace(definition,'if tg_op=''INSERT'' and section<>''days'' then','if section<>''days'' and row_data->>''entry_id'' is not null then');
end $$;

create table private.google_places_settings (
  singleton boolean primary key default true check(singleton), enabled boolean not null default true,
  last_error text, last_error_at timestamptz
);
insert into private.google_places_settings(singleton) values(true);
create table private.google_places_usage (
  bucket timestamptz not null, scope text not null check(scope in ('global_day','user_day','user_minute')),
  subject text not null, kind text not null, requests integer not null default 0,
  user_id uuid references auth.users(id) on delete cascade, primary key(bucket,scope,subject,kind)
);
create index google_places_usage_user_idx on private.google_places_usage(user_id);
alter table private.google_places_settings enable row level security;
alter table private.google_places_usage enable row level security;
revoke all on private.google_places_settings,private.google_places_usage from public,anon,authenticated;

create function public.reserve_google_places(p_actor uuid,p_kind text,p_user_daily integer,p_global_daily integer,p_user_minute integer)
returns void language plpgsql security definer set search_path='' as $$
declare window_day timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  window_minute timestamptz:=date_trunc('minute',now()); scope_ref text; bucket_ref timestamptz; subject_ref text;
begin
  perform 1 from private.google_places_settings where singleton and enabled for update;
  if not found then raise exception 'google_disabled' using errcode='P0001'; end if;
  if p_kind not in ('ui_search','ui_details','verify','coordinates') or p_user_daily<1 or p_global_daily<1 or p_user_minute<1 then raise exception 'google_invalid' using errcode='22023'; end if;
  if coalesce((select sum(requests) from private.google_places_usage where scope='global_day' and bucket=window_day),0)>=p_global_daily
    or coalesce((select sum(requests) from private.google_places_usage where scope='user_day' and subject=p_actor::text and bucket=window_day),0)>=p_user_daily
    or coalesce((select sum(requests) from private.google_places_usage where scope='user_minute' and subject=p_actor::text and bucket=window_minute),0)>=p_user_minute then
      raise exception 'google_quota' using errcode='P0001'; end if;
  foreach scope_ref in array array['global_day','user_day','user_minute'] loop
    bucket_ref:=case when scope_ref='user_minute' then window_minute else window_day end;
    subject_ref:=case when scope_ref='global_day' then 'all' else p_actor::text end;
    insert into private.google_places_usage(bucket,scope,subject,kind,requests,user_id)
      values(bucket_ref,scope_ref,subject_ref,p_kind,1,case when scope_ref='global_day' then null else p_actor end)
      on conflict(bucket,scope,subject,kind) do update set requests=private.google_places_usage.requests+1;
  end loop;
  delete from private.google_places_usage where bucket<now()-interval '35 days';
end $$;
revoke execute on function public.reserve_google_places(uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_google_places(uuid,text,integer,integer,integer) to service_role;

create function public.google_place_reference(p_id text,p_available boolean default null,p_replacement text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_available is not null then
    insert into private.google_place_references(place_id,available,replacement_id) values(p_id,p_available,p_replacement)
      on conflict(place_id) do update set verified_at=now(),available=excluded.available,replacement_id=excluded.replacement_id;
  end if;
  return (select to_jsonb(r) from private.google_place_references r where place_id=p_id);
end $$;
revoke execute on function public.google_place_reference(text,boolean,text) from public,anon,authenticated;
grant execute on function public.google_place_reference(text,boolean,text) to service_role;

create function public.google_places_error(p_code text) returns void language sql security definer set search_path='' as $$
  update private.google_places_settings set last_error=left(p_code,64),last_error_at=now() where singleton;
$$;
revoke execute on function public.google_places_error(text) from public,anon,authenticated;
grant execute on function public.google_places_error(text) to service_role;
create function public.google_places_admin(p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_nagi_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_enabled is not null then update private.google_places_settings set enabled=p_enabled where singleton; end if;
  return (select to_jsonb(s)||jsonb_build_object('today',coalesce((select jsonb_object_agg(kind,requests) from private.google_places_usage
    where scope='global_day' and bucket=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),'{}'::jsonb)) from private.google_places_settings s where singleton);
end $$;
revoke execute on function public.google_places_admin(boolean) from public,anon;
grant execute on function public.google_places_admin(boolean) to authenticated;
create function public.google_places_available() returns boolean language sql stable security definer set search_path='' as $$
  select enabled from private.google_places_settings where singleton;
$$;
revoke execute on function public.google_places_available() from public,anon,authenticated;
grant execute on function public.google_places_available() to service_role;
