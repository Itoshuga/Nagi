-- Phase 4.6: keep the existing planner, permissions and versioned transaction boundary.
alter type public.trip_status add value if not exists 'archived';
-- Search keys preserve non-Latin scripts while making decomposed accents/case equivalent.
create function public.catalog_search_key(value text) returns text
language sql immutable parallel safe set search_path='' as $$
  select lower(regexp_replace(normalize(coalesce(value,''),NFD),U&'[\0300-\036f]','','g'))
$$;
alter table public.entries add column search_key text
  generated always as (public.catalog_search_key(title)) stored;
create index entries_planner_coordinates_idx on public.entries(latitude,longitude)
  where published and latitude is not null and longitude is not null;
do $$ declare trgm_schema text; begin
  select n.nspname into trgm_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
  execute format('create index entries_planner_search_idx on public.entries using gin (search_key %I.gin_trgm_ops)',trgm_schema);
end $$;

-- Preserve all existing days and steps; date changes only fill missing dates.
create or replace function private.fill_trip_days(p_trip uuid,p_start date,p_end date) returns void
language plpgsql set search_path='' as $$
declare number_base integer; order_base integer;
begin
  if p_start is null or p_end is null then raise exception 'trip_dates_required' using errcode='22023'; end if;
  select coalesce(max(day_number),0),coalesce(max(sort_order),-1) into number_base,order_base
    from public.trip_days where trip_id=p_trip;
  insert into public.trip_days(trip_id,day_number,date,sort_order)
    select p_trip,number_base+row_number() over(order by missing.date),missing.date,
      order_base+row_number() over(order by missing.date)
    from (select p_start+i as date from generate_series(0,p_end-p_start) i
      where not exists(select 1 from public.trip_days d where d.trip_id=p_trip and d.date=p_start+i)) missing;
end $$;

-- Bring already dated voyages up to date without removing or redating anything.
do $$ declare trip record; begin
  for trip in select id,start_date,end_date from public.trips
    where start_date is not null and end_date is not null order by id for update loop
    perform private.fill_trip_days(trip.id,trip.start_date,trip.end_date);
  end loop;
end $$;

create function private.complete_trip_calendar() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.start_date is not null and new.end_date is not null then
    perform private.fill_trip_days(new.id,new.start_date,new.end_date);
  end if;
  return null;
end $$;
create trigger complete_trip_calendar after update of start_date,end_date on public.trips
for each row when (old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date)
execute function private.complete_trip_calendar();
revoke execute on function private.complete_trip_calendar() from public,anon,authenticated;

create or replace function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare trip public.trips;
  actor uuid := auth.uid();
  target uuid := (p_data->>'id')::uuid;
  day_id uuid := (p_data->>'day')::uuid;
  entry_ref uuid := (p_data->>'entry')::uuid;
  desired_date date := (p_data->>'date')::date;
  current_item public.trip_items;
  current_day public.trip_days;
  organizer uuid;
  next_order integer;
begin
  if actor is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  if p_operation in ('settings','delete_trip','organizer_add','organizer_remove') then
    if not public.is_trip_organizer(p_trip) then raise exception 'trip_forbidden' using errcode='42501'; end if;
  elsif not public.can_edit_guild_trip(p_trip) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;

  if p_operation='add_item' then
    if exists(select 1 from private.trip_add_requests where id=target and trip_id=p_trip
      and user_id=actor and entry_id=entry_ref) then return trip.version; end if;
    if not private.visible_trip_entry(entry_ref) then raise exception 'trip_entry_hidden' using errcode='22023'; end if;
  elsif p_version is distinct from trip.version then
    raise exception 'trip_conflict' using errcode='40001';
  end if;

  if p_operation in ('add_item','move_item','schedule_item','sort_items','delete_day') and day_id is not null
    and not exists(select 1 from public.trip_days where trip_id=p_trip and id=day_id) then
    raise exception 'trip_day_missing' using errcode='22023';
  end if;
  if p_operation in ('edit_item','move_item','schedule_item','delete_item') then
    select * into current_item from public.trip_items where id=target and trip_id=p_trip;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
  end if;
  if p_operation in ('edit_day','move_day','delete_day') then
    select * into current_day from public.trip_days where id=target and trip_id=p_trip;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
  end if;
  if p_operation in ('add_day','edit_day') and desired_date is not null and desired_date is distinct from current_day.date then
    if (trip.start_date is not null and desired_date<trip.start_date) or
      (trip.end_date is not null and desired_date>trip.end_date) or exists(select 1 from public.trip_days
        where trip_id=p_trip and date=desired_date and id is distinct from target) then
      raise exception 'trip_day_date' using errcode='22023';
    end if;
  end if;

  case p_operation
    when 'settings' then
      update public.trips set title=p_data->>'title',description=p_data->>'description',
        destination_country_id=(p_data->>'destination_country_id')::uuid,
        start_date=(p_data->>'start_date')::date,end_date=(p_data->>'end_date')::date,
        timezone=p_data->>'timezone',status=(p_data->>'status')::public.trip_status,
        collaboration_mode=(p_data->>'collaboration_mode')::public.trip_collaboration_mode,
        cover_image_url=case when p_data ? 'cover_image_url' then p_data->>'cover_image_url' else trip.cover_image_url end
      where id=p_trip returning version into next_order;
      return next_order;
    when 'delete_trip' then
      delete from public.trips where id=p_trip;
      return trip.version+1;
    when 'organizer_add' then
      select m.user_id into organizer from private.guild_memberships m join public.profiles p on p.id=m.user_id
        where m.guild_id=p_guild and m.expires_at>now() and p.discord_id=p_data->>'discord_id';
      if not found then raise exception 'trip_member_missing' using errcode='22023'; end if;
      insert into public.trip_organizers(trip_id,user_id) values(p_trip,organizer) on conflict do nothing;
    when 'organizer_remove' then
      if target=trip.created_by or (select count(*) from public.trip_organizers where trip_id=p_trip)<=1 then
        raise exception 'trip_organizer_required' using errcode='22023';
      end if;
      delete from public.trip_organizers where trip_id=p_trip and user_id=target;
    when 'generate_days' then
      perform private.fill_trip_days(p_trip,trip.start_date,trip.end_date);
    when 'add_day' then
      insert into public.trip_days(trip_id,day_number,date,title,sort_order)
        select p_trip,coalesce(max(day_number),0)+1,desired_date,coalesce(p_data->>'title',''),
          coalesce(max(sort_order),-1)+1 from public.trip_days where trip_id=p_trip;
    when 'edit_day' then
      update public.trip_days set date=desired_date,title=coalesce(p_data->>'title','') where id=target;
    when 'move_day' then
      if current_day.date is not null or trip.start_date is not null or trip.end_date is not null or
        p_data->>'direction' is null or p_data->>'direction' not in ('up','down') then
        raise exception 'trip_day_order' using errcode='22023';
      end if;
      with ordered as (
        select d.id,row_number() over (order by d.sort_order,d.day_number,d.id) as position
        from public.trip_days d where d.trip_id=p_trip
      ), place as (select position from ordered where id=target),
      pair as (select o.id,o.position,p.position as source from ordered o cross join place p
        where o.position=p.position+case when p_data->>'direction'='up' then -1 else 1 end)
      update public.trip_days d set sort_order=case
        when o.id=target then coalesce((select position from pair),o.position)
        when o.id=(select id from pair) then (select source from pair) else o.position end
      from ordered o where d.id=o.id;
    when 'delete_day' then
      if day_id=target then raise exception 'trip_day_missing' using errcode='22023'; end if;
      -- Keep the relative order and append the steps at their new destination.
      update public.trip_items item set trip_day_id=day_id,sort_order=ordered.position
      from (select id,row_number() over (order by sort_order,id)*1024+
        coalesce((select max(sort_order) from public.trip_items where trip_id=p_trip
          and trip_day_id is not distinct from day_id),0) as position
        from public.trip_items where trip_id=p_trip and trip_day_id=target) ordered
      where item.id=ordered.id;
      delete from public.trip_days where id=target;
    when 'add_item' then
      if not coalesce((p_data->>'repeat')::boolean,false) and exists(select 1 from public.trip_items
        where trip_id=p_trip and entry_id=entry_ref and trip_day_id is not distinct from day_id) then
        raise exception 'trip_duplicate' using errcode='P0001';
      end if;
      insert into private.trip_add_requests(id,trip_id,user_id,entry_id) values(target,p_trip,actor,entry_ref);
      insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,sort_order,start_time,estimated_duration_minutes)
        values(target,p_trip,day_id,entry_ref,actor,private.trip_item_position(p_trip,day_id,null,null),
          (p_data->>'start_time')::time,(p_data->>'duration')::integer);
    when 'edit_item' then
      if current_item.version is distinct from (p_data->>'item_version')::integer then
        raise exception 'trip_conflict' using errcode='40001';
      end if;
      update public.trip_items set start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,
        estimated_duration_minutes=(p_data->>'duration')::integer,notes=coalesce(p_data->>'notes','') where id=target;
    when 'schedule_item' then
      if current_item.version is distinct from (p_data->>'item_version')::integer then
        raise exception 'trip_conflict' using errcode='40001';
      end if;
      update public.trip_items set trip_day_id=day_id,
        sort_order=case when trip_day_id is distinct from day_id then
          private.trip_item_position(p_trip,day_id,target,null) else sort_order end,
        start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,
        estimated_duration_minutes=(p_data->>'duration')::integer where id=target;
    when 'sort_items' then
      update public.trip_items item set sort_order=ordered.position
      from (select id,row_number() over(order by start_time nulls last,sort_order,id)*1024 as position
        from public.trip_items where trip_id=p_trip and trip_day_id is not distinct from day_id) ordered
      where item.id=ordered.id and item.sort_order<>ordered.position;
    when 'move_item' then
      update public.trip_items set trip_day_id=day_id,
        sort_order=private.trip_item_position(p_trip,day_id,target,(p_data->>'before')::uuid) where id=target;
    when 'delete_item' then
      delete from public.trip_items where id=target;
    else raise exception 'trip_operation_invalid' using errcode='22023';
  end case;
  update public.trips set updated_at=now() where id=p_trip returning version into next_order;
  return next_order;
end $$;

-- The public RPC keeps its existing grants. New operations use the same membership,
-- organizer, row locking, trip-version and item-version checks as all existing edits.
