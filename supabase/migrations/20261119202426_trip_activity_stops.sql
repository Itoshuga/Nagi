-- A stop belongs to a root activity. It has no independent day or clock, so a
-- group always moves together and cannot form a recursive itinerary hierarchy.
create table public.trip_item_stops (
  id uuid primary key default gen_random_uuid(),
  trip_item_id uuid not null references public.trip_items(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  notes text not null default '' check(length(notes)<=4000),
  duration_minutes integer check(duration_minutes between 1 and 1440),
  sort_order bigint not null default 0,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trip_item_stops_parent_order_idx on public.trip_item_stops(trip_item_id,sort_order,id);
create index trip_item_stops_entry_idx on public.trip_item_stops(entry_id);
create index trip_item_stops_author_idx on public.trip_item_stops(added_by);
alter table public.trip_item_stops enable row level security;
revoke all on public.trip_item_stops from public,anon,authenticated;
grant select on public.trip_item_stops to authenticated;
grant all on public.trip_item_stops to service_role;
create policy trip_item_stops_read on public.trip_item_stops for select to authenticated
  using(exists(select 1 from public.trip_items i where i.id=trip_item_id));
create trigger touch_updated_at before update on public.trip_item_stops
  for each row execute function public.touch_updated_at();
create trigger bump_trip_stop_version before update on public.trip_item_stops
  for each row execute function private.bump_trip_item_version();

-- Retain insertion receipts after an activity/stop is removed, preventing a
-- retried request from resurrecting it. Account and trip deletion remove them.
create table private.trip_stop_add_requests (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_item_id uuid not null,
  entry_id uuid not null
);
create index trip_stop_add_requests_trip_idx on private.trip_stop_add_requests(trip_id);
create index trip_stop_add_requests_user_idx on private.trip_stop_add_requests(user_id);
alter table private.trip_stop_add_requests enable row level security;
revoke all on private.trip_stop_add_requests from public,anon,authenticated;

create function private.trip_stop_position(p_parent uuid,p_stop uuid,p_before uuid)
returns bigint language plpgsql set search_path='' as $$
declare previous bigint; following bigint; attempt integer;
begin
  if p_before is null then
    return coalesce((select max(sort_order) from public.trip_item_stops
      where trip_item_id=p_parent and id is distinct from p_stop),0)+1024;
  end if;
  for attempt in 1..2 loop
    select sort_order into following from public.trip_item_stops
      where id=p_before and trip_item_id=p_parent and id is distinct from p_stop;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    select coalesce(max(sort_order),-1) into previous from public.trip_item_stops
      where trip_item_id=p_parent and id is distinct from p_stop
        and (sort_order,id)<(following,p_before);
    if following-previous>1 then return previous+(following-previous)/2; end if;
    update public.trip_item_stops s set sort_order=ordered.position
      from (select id,1024*row_number() over(order by sort_order,id) as position
        from public.trip_item_stops where trip_item_id=p_parent and id is distinct from p_stop) ordered
      where s.id=ordered.id and s.sort_order<>ordered.position;
  end loop;
  raise exception 'trip_conflict' using errcode='40001';
end $$;
revoke execute on function private.trip_stop_position(uuid,uuid,uuid) from public,anon,authenticated;

-- Preserve the tested root-activity operations and their exact permissions.
alter function public.edit_trip_plan(text,uuid,integer,text,jsonb) set schema private;
alter function private.edit_trip_plan(text,uuid,integer,text,jsonb) rename to edit_trip_plan_roots;
revoke execute on function private.edit_trip_plan_roots(text,uuid,integer,text,jsonb)
  from public,anon,authenticated,service_role;

create function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare trip public.trips;
  actor uuid := auth.uid();
  target uuid;
  parent public.trip_items;
  stop public.trip_item_stops;
  parent_ref uuid;
  entry_ref uuid;
  before_ref uuid;
  revised integer;
  elapsed integer;
  known boolean;
  starts time;
begin
  if p_operation not in ('add_stop','edit_stop','move_stop','delete_stop','detach_stop') then
    return private.edit_trip_plan_roots(p_guild,p_trip,p_version,p_operation,p_data);
  end if;
  if actor is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.can_edit_guild_trip(p_trip) or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  target := (p_data->>'id')::uuid;
  if p_operation='add_stop' then
    parent_ref := (p_data->>'parent')::uuid;
    entry_ref := (p_data->>'entry')::uuid;
    if exists(select 1 from private.trip_stop_add_requests where id=target and trip_id=p_trip
      and user_id=actor and trip_item_id=parent_ref and entry_id=entry_ref) then return trip.version; end if;
  elsif p_version is distinct from trip.version then
    raise exception 'trip_conflict' using errcode='40001';
  end if;
  if p_operation<>'add_stop' then
    select s.* into stop from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id
      where s.id=target and i.trip_id=p_trip;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    parent_ref := stop.trip_item_id;
  end if;
  select * into parent from public.trip_items where id=parent_ref and trip_id=p_trip;
  if not found then raise exception 'trip_activity_missing' using errcode='22023'; end if;

  case p_operation
    when 'add_stop' then
      if not private.visible_trip_entry(entry_ref) then raise exception 'trip_entry_hidden' using errcode='22023'; end if;
      if entry_ref=parent.entry_id then raise exception 'trip_stop_self' using errcode='22023'; end if;
      if not coalesce((p_data->>'repeat')::boolean,false) and exists(select 1 from public.trip_item_stops
        where trip_item_id=parent_ref and entry_id=entry_ref) then
        raise exception 'trip_duplicate' using errcode='P0001';
      end if;
      insert into private.trip_stop_add_requests(id,trip_id,user_id,trip_item_id,entry_id)
        values(target,p_trip,actor,parent_ref,entry_ref);
      insert into public.trip_item_stops(id,trip_item_id,entry_id,added_by,duration_minutes,sort_order)
        values(target,parent_ref,entry_ref,actor,(p_data->>'duration')::integer,
          private.trip_stop_position(parent_ref,null,null));
    when 'edit_stop' then
      if stop.version is distinct from (p_data->>'stop_version')::integer then
        raise exception 'trip_conflict' using errcode='40001';
      end if;
      update public.trip_item_stops set duration_minutes=(p_data->>'duration')::integer,
        notes=coalesce(p_data->>'notes','') where id=target;
    when 'move_stop' then
      before_ref := (p_data->>'before')::uuid;
      if before_ref=target then return trip.version; end if;
      update public.trip_item_stops set sort_order=private.trip_stop_position(parent_ref,target,before_ref)
        where id=target;
    when 'delete_stop' then
      delete from public.trip_item_stops where id=target;
    when 'detach_stop' then
      select coalesce(sum(duration_minutes),0)::integer,coalesce(bool_and(duration_minutes is not null),true)
        into elapsed,known from public.trip_item_stops
        where trip_item_id=parent_ref and (sort_order,id)<(stop.sort_order,stop.id);
      if parent.start_time is not null and known and
        extract(hour from parent.start_time)::integer*60+extract(minute from parent.start_time)::integer+elapsed<1440 then
        starts := (parent.start_time+make_interval(mins=>elapsed))::time;
      end if;
      select id into before_ref from public.trip_items where trip_id=p_trip
        and trip_day_id is not distinct from parent.trip_day_id and (sort_order,id)>(parent.sort_order,parent.id)
        order by sort_order,id limit 1;
      insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,notes,sort_order,start_time,
        estimated_duration_minutes,created_at)
        values(stop.id,p_trip,parent.trip_day_id,stop.entry_id,stop.added_by,stop.notes,
          private.trip_item_position(p_trip,parent.trip_day_id,null,before_ref),starts,stop.duration_minutes,stop.created_at);
      delete from public.trip_item_stops where id=target;
  end case;
  update public.trips set updated_at=now() where id=p_trip returning version into revised;
  return revised;
end $$;
revoke execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) to authenticated;

create or replace function public.trip_contributor_cards(p_trip uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,
    'display_name',p.display_name,'avatar_url',p.avatar_url)),'[]')
  from public.profiles p where auth.uid() is not null and exists(
    select 1 from public.trips t where t.id=p_trip and public.is_guild_member(t.guild_id)
    and (p.id=t.created_by or exists(select 1 from public.trip_items i where i.trip_id=t.id and i.added_by=p.id)
      or exists(select 1 from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id
        where i.trip_id=t.id and s.added_by=p.id)))
$$;
