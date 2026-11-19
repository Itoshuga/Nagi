-- All stop moves remain a single transaction, including a drop into a different
-- activity or back onto a day. Existing RPC operations keep their behaviour.
alter function public.edit_trip_plan(text,uuid,integer,text,jsonb) set schema private;
alter function private.edit_trip_plan(text,uuid,integer,text,jsonb) rename to edit_trip_plan_nesting;
revoke execute on function private.edit_trip_plan_nesting(text,uuid,integer,text,jsonb)
  from public,anon,authenticated,service_role;

create function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
  trip public.trips;
  source public.trip_item_stops;
  origin public.trip_items;
  parent public.trip_items;
  actor uuid := auth.uid();
  target uuid := (p_data->>'id')::uuid;
  before_ref uuid := (p_data->>'before')::uuid;
  day_ref uuid;
  revised integer;
  elapsed integer;
  known boolean;
  starts time;
begin
  if p_operation='nest_item' and before_ref is not null then
    revised := private.edit_trip_plan_nesting(p_guild,p_trip,p_version,p_operation,p_data);
    return private.edit_trip_plan_nesting(p_guild,p_trip,revised,'move_stop',
      jsonb_build_object('id',target,'before',before_ref));
  elsif p_operation is distinct from 'relocate_stop' then
    return private.edit_trip_plan_nesting(p_guild,p_trip,p_version,p_operation,p_data);
  end if;
  if actor is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.can_edit_guild_trip(p_trip) or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  if p_version is distinct from trip.version then
    raise exception 'trip_conflict' using errcode='40001';
  end if;
  select s.* into source from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id
    where s.id=target and i.trip_id=p_trip;
  if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
  select * into origin from public.trip_items where id=source.trip_item_id;
  if p_data->>'kind'='stop' then
    select * into parent from public.trip_items where id=(p_data->>'parent')::uuid and trip_id=p_trip;
    if not found then raise exception 'trip_activity_missing' using errcode='22023'; end if;
    if parent.id=origin.id and before_ref=source.id then return trip.version; end if;
    if parent.entry_id=source.entry_id then
      raise exception 'trip_stop_self' using errcode='22023';
    end if;
    if parent.id<>origin.id and exists(select 1 from public.trip_item_stops
      where trip_item_id=parent.id and entry_id=source.entry_id and id<>source.id) then
      raise exception 'trip_stop_duplicate' using errcode='22023';
    end if;
    update public.trip_item_stops set trip_item_id=parent.id,
      sort_order=private.trip_stop_position(parent.id,source.id,before_ref) where id=source.id;
  elsif p_data->>'kind'='activity' then
    day_ref := (p_data->>'day')::uuid;
    if day_ref is not null and not exists(select 1 from public.trip_days where id=day_ref and trip_id=p_trip) then
      raise exception 'trip_day_missing' using errcode='22023';
    end if;
    select coalesce(sum(duration_minutes),0)::integer,coalesce(bool_and(duration_minutes is not null),true)
      into elapsed,known from public.trip_item_stops
      where trip_item_id=origin.id and (sort_order,id)<(source.sort_order,source.id);
    if origin.start_time is not null and known and
      extract(hour from origin.start_time)::integer*60+extract(minute from origin.start_time)::integer+elapsed<1440 then
      starts := (origin.start_time+make_interval(mins=>elapsed))::time;
    end if;
    insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,notes,sort_order,start_time,
      estimated_duration_minutes,created_at)
      values(source.id,p_trip,day_ref,source.entry_id,source.added_by,source.notes,
        private.trip_item_position(p_trip,day_ref,null,before_ref),starts,source.duration_minutes,source.created_at);
    delete from public.trip_item_stops where id=source.id;
  else
    raise exception 'trip_operation_invalid' using errcode='22023';
  end if;
  update public.trips set updated_at=now() where id=p_trip returning version into revised;
  return revised;
end $$;
revoke execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) to authenticated;
