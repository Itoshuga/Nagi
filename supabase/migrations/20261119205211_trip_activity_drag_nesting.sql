-- Convert an existing activity to a stop atomically. Keep its identity and notes,
-- rather than issuing an add followed by a separate, potentially failing delete.
alter function public.edit_trip_plan(text,uuid,integer,text,jsonb) set schema private;
alter function private.edit_trip_plan(text,uuid,integer,text,jsonb) rename to edit_trip_plan_stops;
revoke execute on function private.edit_trip_plan_stops(text,uuid,integer,text,jsonb)
  from public,anon,authenticated,service_role;

create function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare
  trip public.trips;
  source public.trip_items;
  parent public.trip_items;
  actor uuid := auth.uid();
  revised integer;
begin
  if p_operation is distinct from 'nest_item' then
    return private.edit_trip_plan_stops(p_guild,p_trip,p_version,p_operation,p_data);
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
  select * into source from public.trip_items where id=(p_data->>'id')::uuid and trip_id=p_trip;
  if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
  select * into parent from public.trip_items where id=(p_data->>'parent')::uuid and trip_id=p_trip;
  if not found then raise exception 'trip_activity_missing' using errcode='22023'; end if;
  if source.id=parent.id or source.entry_id=parent.entry_id then
    raise exception 'trip_stop_self' using errcode='22023';
  end if;
  if exists(select 1 from public.trip_item_stops where trip_item_id=source.id) then
    raise exception 'trip_activity_has_stops' using errcode='22023';
  end if;
  if exists(select 1 from public.trip_item_stops where trip_item_id=parent.id and entry_id=source.entry_id) then
    raise exception 'trip_stop_duplicate' using errcode='22023';
  end if;
  insert into public.trip_item_stops(id,trip_item_id,entry_id,added_by,notes,duration_minutes,sort_order,version,created_at,updated_at)
    values(source.id,parent.id,source.entry_id,source.added_by,source.notes,
      case when source.start_time is not null and source.end_time is not null
        then (extract(epoch from (source.end_time-source.start_time))/60)::integer
        else source.estimated_duration_minutes end,
      private.trip_stop_position(parent.id,null,null),source.version,source.created_at,source.updated_at);
  delete from public.trip_items where id=source.id;
  update public.trips set updated_at=now() where id=p_trip returning version into revised;
  return revised;
end $$;
revoke execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) to authenticated;
