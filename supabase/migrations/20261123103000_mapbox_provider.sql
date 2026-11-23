-- Replace the provider without changing occurrence identities or planning data.
-- Historical migration files remain immutable; this migration removes the active
-- Google schema. The archive is private, has RLS, and is not exposed by any RPC.
create table private.mapbox_migration_archive (
  key text primary key, payload jsonb not null, captured_at timestamptz not null default now()
);
alter table private.mapbox_migration_archive enable row level security;
revoke all on private.mapbox_migration_archive from public,anon,authenticated,service_role;
insert into private.mapbox_migration_archive(key,payload) values('previous_provider',jsonb_build_object(
  'items',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.trip_items i where source='google'),
  'stops',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.trip_item_stops s where source='google'),
  'editorial_references',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'reference',google_place_id)),'[]') from public.entries where google_place_id is not null),
  'references',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from private.google_place_references r),
  'settings',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from private.google_places_settings r),
  'usage',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from private.google_places_usage r)
));

alter table public.trip_items drop constraint trip_items_place_source;
alter table public.trip_item_stops drop constraint trip_item_stops_place_source;
alter table public.trip_items add column external_query text, add column needs_place_relink boolean not null default false;
alter table public.trip_item_stops add column external_query text, add column needs_place_relink boolean not null default false;
-- No provider names, addresses or coordinates are copied to custom fields.
-- Pausing user triggers preserves timestamps/versions during this schema-only conversion.
alter table public.trip_items disable trigger user;
alter table public.trip_item_stops disable trigger user;
update public.trip_items set source='custom',google_place_id=null,custom_title='Étape à réassocier',needs_place_relink=true where source='google';
update public.trip_item_stops set source='custom',google_place_id=null,custom_title='Arrêt à réassocier',needs_place_relink=true where source='google';
alter table public.trip_items enable trigger user;
alter table public.trip_item_stops enable trigger user;
alter type public.trip_item_source rename value 'google' to 'mapbox';
alter table public.trip_items rename column google_place_id to external_place_id;
alter table public.trip_item_stops rename column google_place_id to external_place_id;
alter table public.entries drop column google_place_id;
drop index public.trip_items_google_place_idx;
drop index public.trip_item_stops_google_place_idx;
create index trip_items_external_place_idx on public.trip_items using hash(external_place_id) where external_place_id is not null;
create index trip_item_stops_external_place_idx on public.trip_item_stops using hash(external_place_id) where external_place_id is not null;
do $$ declare tab text; begin
  foreach tab in array array['trip_items','trip_item_stops'] loop
    execute format('alter table public.%I add constraint %I check (
      (source=''nagi'' and entry_id is not null and external_place_id is null and external_query is null and not needs_place_relink and custom_title is null and custom_location is null and custom_latitude is null and custom_longitude is null)
      or (source=''mapbox'' and entry_id is null and external_place_id is not null and length(external_place_id) between 1 and 8192 and external_place_id !~ ''[[:cntrl:]]'' and external_query is not null and length(btrim(external_query)) between 1 and 256 and not needs_place_relink and custom_title is null and custom_location is null and custom_latitude is null and custom_longitude is null)
      or (source=''custom'' and entry_id is null and external_place_id is null and external_query is null and custom_title is not null and length(btrim(custom_title)) between 1 and 160 and length(coalesce(custom_location,''''))<=500
        and ((custom_latitude is null and custom_longitude is null) or (custom_latitude is not null and custom_longitude is not null and custom_latitude between -90 and 90 and custom_longitude between -180 and 180)))
    )',tab,tab||'_place_source');
  end loop;
end $$;

create table private.mapbox_place_references (
  actor uuid not null references auth.users(id) on delete cascade,
  place_id text not null, place_key text generated always as(md5(place_id)) stored,
  user_query text not null, verified_at timestamptz not null default now(),
  primary key(actor,place_key)
);
alter table private.mapbox_place_references enable row level security;
revoke all on private.mapbox_place_references from public,anon,authenticated;
create function public.mapbox_place_reference(p_actor uuid,p_id text,p_query text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from private.mapbox_settings where singleton and enabled) then raise exception 'mapbox_disabled' using errcode='P0001'; end if;
  if p_actor is null or length(p_id) not between 1 and 8192 or length(btrim(p_query)) not between 1 and 256 then raise exception 'mapbox_reference_invalid' using errcode='22023'; end if;
  insert into private.mapbox_place_references(actor,place_id,user_query) values(p_actor,p_id,p_query)
    on conflict(actor,place_key) do update set user_query=excluded.user_query,verified_at=now()
    where private.mapbox_place_references.place_id=excluded.place_id;
  if not found then raise exception 'mapbox_reference_collision' using errcode='22023'; end if;
  delete from private.mapbox_place_references where verified_at<now()-interval '1 day';
end $$;
revoke execute on function public.mapbox_place_reference(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mapbox_place_reference(uuid,text,text) to service_role;

create or replace function private.transfer_trip_place_source() returns trigger language plpgsql security definer set search_path='' as $$
declare fields jsonb;
begin
  if new.source='nagi' and new.entry_id is null then
    if tg_table_name='trip_item_stops' then
      select to_jsonb(i) into fields from public.trip_items i join public.trip_items parent on parent.id=new.trip_item_id where i.id=new.id and i.trip_id=parent.trip_id;
    else
      select to_jsonb(s) into fields from public.trip_item_stops s join public.trip_items parent on parent.id=s.trip_item_id where s.id=new.id and parent.trip_id=new.trip_id;
    end if;
    if fields is not null then
      new.source:=(fields->>'source')::public.trip_item_source;
      new.calendar_color:=coalesce(new.calendar_color,fields->>'calendar_color');
      new.external_place_id:=fields->>'external_place_id'; new.external_query:=fields->>'external_query';
      new.needs_place_relink:=coalesce((fields->>'needs_place_relink')::boolean,false);
      new.custom_title:=fields->>'custom_title'; new.custom_location:=fields->>'custom_location';
      new.custom_latitude:=(fields->>'custom_latitude')::double precision; new.custom_longitude:=(fields->>'custom_longitude')::double precision;
    end if;
  end if;
  return new;
end $$;

create or replace function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare trip public.trips; actor uuid:=auth.uid(); target uuid; parent_ref uuid; entry_ref uuid;
  source_ref public.trip_item_source; place jsonb; external_ref text; query_ref text; title_ref text; location_ref text;
  lat double precision; lng double precision; request_hash text; revised integer;
begin
  if p_operation not in ('add_place','replace_place') then return private.edit_trip_plan_before_sources(p_guild,p_trip,p_version,p_operation,p_data); end if;
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
  elsif source_ref='mapbox' then
    external_ref:=place->>'placeId'; query_ref:=btrim(place->>'query');
    if not exists(select 1 from private.mapbox_place_references r where r.actor=auth.uid() and place_key=md5(external_ref) and place_id=external_ref and user_query=query_ref and verified_at>now()-interval '10 minutes') then
      raise exception 'trip_mapbox_unverified' using errcode='22023'; end if;
  elsif source_ref='custom' then
    title_ref:=btrim(place->>'title'); location_ref:=place->>'location';
    lat:=(place->>'latitude')::double precision; lng:=(place->>'longitude')::double precision;
  else raise exception 'trip_place_invalid' using errcode='22023'; end if;
  if p_operation='replace_place' then
    update public.trip_items set source=source_ref,entry_id=entry_ref,external_place_id=external_ref,external_query=query_ref,needs_place_relink=false,
      custom_title=title_ref,custom_location=location_ref,custom_latitude=lat,custom_longitude=lng where id=target and trip_id=p_trip;
    if not found then
      update public.trip_item_stops s set source=source_ref,entry_id=entry_ref,external_place_id=external_ref,external_query=query_ref,needs_place_relink=false,
        custom_title=title_ref,custom_location=location_ref,custom_latitude=lat,custom_longitude=lng
        where s.id=target and exists(select 1 from public.trip_items i where i.id=s.trip_item_id and i.trip_id=p_trip);
      if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    end if;
  else
    parent_ref:=(p_data->>'parent')::uuid;
    insert into private.trip_place_add_requests values(target,p_trip,actor,request_hash);
    if parent_ref is not null then
      if not exists(select 1 from public.trip_items where id=parent_ref and trip_id=p_trip) then raise exception 'trip_activity_missing' using errcode='22023'; end if;
      insert into public.trip_item_stops(id,trip_item_id,source,entry_id,external_place_id,external_query,custom_title,custom_location,custom_latitude,custom_longitude,added_by,notes,duration_minutes,calendar_color,sort_order)
        values(target,parent_ref,source_ref,entry_ref,external_ref,query_ref,title_ref,location_ref,lat,lng,actor,coalesce(p_data->>'notes',''),(p_data->>'duration')::integer,upper(p_data->>'color'),private.trip_stop_position(parent_ref,null,(p_data->>'before')::uuid));
    else
      if p_data->>'day' is not null and not exists(select 1 from public.trip_days where id=(p_data->>'day')::uuid and trip_id=p_trip) then raise exception 'trip_day_missing' using errcode='22023'; end if;
      insert into public.trip_items(id,trip_id,trip_day_id,source,entry_id,external_place_id,external_query,custom_title,custom_location,custom_latitude,custom_longitude,added_by,notes,start_time,estimated_duration_minutes,calendar_color,sort_order)
        values(target,p_trip,(p_data->>'day')::uuid,source_ref,entry_ref,external_ref,query_ref,title_ref,location_ref,lat,lng,actor,coalesce(p_data->>'notes',''),(p_data->>'start_time')::time,(p_data->>'duration')::integer,upper(p_data->>'color'),private.trip_item_position(p_trip,(p_data->>'day')::uuid,null,(p_data->>'before')::uuid));
    end if;
  end if;
  update public.trips set updated_at=now() where id=p_trip returning version into revised;
  return revised;
end $$;

-- Retain the replay window and lifetime idempotency receipts. Only normalize
-- historical row JSON to the new transport schema; no old provider is queried.
create function private.migrate_external_place_json(value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; begin
  if jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(private.migrate_external_place_json(v)),'[]') into result from jsonb_array_elements(value) v; return result;
  elsif jsonb_typeof(value)='object' then
    select coalesce(jsonb_object_agg(case when key='google_place_id' then 'external_place_id' else key end,private.migrate_external_place_json(val)),'{}') into result from jsonb_each(value) as pair(key,val);
    if result->>'source'='google' then result:=result||jsonb_build_object('source','custom','external_place_id',null,'external_query',null,'custom_title','Étape à réassocier','needs_place_relink',true); end if;
    return result;
  end if; return value;
end $$;
update private.trip_plan_events set payload=private.migrate_external_place_json(payload);
drop function private.migrate_external_place_json(jsonb);

drop function public.reserve_google_places(uuid,text,integer,integer,integer);
drop function public.google_place_reference(text,boolean,text);
drop function public.google_places_error(text);
drop function public.google_places_admin(boolean);
drop function public.google_places_available();
drop table private.google_place_references,private.google_places_usage,private.google_places_settings;

create table private.mapbox_settings (
  singleton boolean primary key default true check(singleton), enabled boolean not null default true,
  last_error text, last_error_at timestamptz
);
insert into private.mapbox_settings(singleton) values(true);
create table private.mapbox_usage (
  bucket timestamptz not null, scope text not null check(scope in ('global_day','global_second','global_month','user_day','user_minute')),
  subject text not null, kind text not null, requests integer not null default 0,
  user_id uuid references auth.users(id) on delete cascade, primary key(bucket,scope,subject,kind)
);
alter table private.mapbox_settings enable row level security;
alter table private.mapbox_usage enable row level security;
revoke all on private.mapbox_settings,private.mapbox_usage from public,anon,authenticated;
create function public.reserve_mapbox_places(p_actor uuid,p_kind text,p_user_daily integer,p_global_daily integer,p_user_minute integer,p_details_monthly integer)
returns void language plpgsql security definer set search_path='' as $$
declare day_ref timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  minute_ref timestamptz:=date_trunc('minute',now()); second_ref timestamptz:=date_trunc('second',now());
  month_ref timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'; s text; b timestamptz; subject_ref text;
begin
  perform 1 from private.mapbox_settings where singleton and enabled for update;
  if not found then raise exception 'mapbox_disabled' using errcode='P0001'; end if;
  if p_actor is null or p_kind not in ('suggest','forward','retrieve','details') or least(p_user_daily,p_global_daily,p_user_minute,p_details_monthly)<1 then raise exception 'mapbox_invalid' using errcode='22023'; end if;
  if coalesce((select sum(requests) from private.mapbox_usage where scope='global_day' and bucket=day_ref),0)>=p_global_daily
    or coalesce((select sum(requests) from private.mapbox_usage where scope='user_day' and subject=p_actor::text and bucket=day_ref),0)>=p_user_daily
    or coalesce((select sum(requests) from private.mapbox_usage where scope='user_minute' and subject=p_actor::text and bucket=minute_ref),0)>=p_user_minute
    or coalesce((select sum(requests) from private.mapbox_usage where scope='global_second' and bucket=second_ref),0)>=8
    or (p_kind='details' and coalesce((select sum(requests) from private.mapbox_usage where scope='global_month' and bucket=month_ref and kind='details'),0)>=p_details_monthly)
    then raise exception 'mapbox_quota' using errcode='P0001'; end if;
  foreach s in array array['global_day','global_second','global_month','user_day','user_minute'] loop
    b:=case s when 'global_day' then day_ref when 'user_day' then day_ref when 'global_month' then month_ref when 'global_second' then second_ref else minute_ref end;
    subject_ref:=case when s in ('global_day','global_second','global_month') then 'all' else p_actor::text end;
    insert into private.mapbox_usage(bucket,scope,subject,kind,requests,user_id) values(b,s,subject_ref,p_kind,1,case when s like 'global_%' then null else p_actor end)
      on conflict(bucket,scope,subject,kind) do update set requests=private.mapbox_usage.requests+1;
  end loop;
  delete from private.mapbox_usage where (scope='global_second' and bucket<now()-interval '1 minute') or (scope='user_minute' and bucket<now()-interval '1 day') or bucket<now()-interval '62 days';
end $$;
revoke execute on function public.reserve_mapbox_places(uuid,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_mapbox_places(uuid,text,integer,integer,integer,integer) to service_role;
create function public.mapbox_error(p_code text) returns void language sql security definer set search_path='' as $$
  update private.mapbox_settings set last_error=left(p_code,64),last_error_at=now() where singleton;
$$;
revoke execute on function public.mapbox_error(text) from public,anon,authenticated;
grant execute on function public.mapbox_error(text) to service_role;
create function public.mapbox_admin(p_enabled boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_nagi_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_enabled is not null then update private.mapbox_settings set enabled=p_enabled where singleton; end if;
  return (select to_jsonb(s)||jsonb_build_object('today',coalesce((select jsonb_object_agg(kind,requests) from private.mapbox_usage where scope='global_day' and bucket=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),'{}'::jsonb),
    'details_month',coalesce((select sum(requests) from private.mapbox_usage where scope='global_month' and kind='details' and bucket=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0)) from private.mapbox_settings s where singleton);
end $$;
revoke execute on function public.mapbox_admin(boolean) from public,anon;
grant execute on function public.mapbox_admin(boolean) to authenticated;
create function public.mapbox_available() returns boolean language sql stable security definer set search_path='' as $$ select enabled from private.mapbox_settings where singleton; $$;
revoke execute on function public.mapbox_available() from public,anon,authenticated;
grant execute on function public.mapbox_available() to service_role;
