-- A destructive structural edit must include every child the user saw. A stop
-- or activity created by another member after that snapshot must not be silently
-- removed/moved by a confirmation based on an older child count.
alter function public.mutate_trip_plan(text,uuid,jsonb) set schema private;
alter function private.mutate_trip_plan(text,uuid,jsonb) rename to mutate_trip_plan_before_structure_guards;
revoke execute on function private.mutate_trip_plan_before_structure_guards(text,uuid,jsonb)
  from public,anon,authenticated,service_role;

create function public.mutate_trip_plan(p_guild text,p_trip uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation text:=p_request#>>'{change,operation}'; target uuid; trip_ref uuid;
begin
  if operation in ('delete_item','delete_day') then
    if auth.uid() is null or not public.is_guild_member(p_guild) then
      raise exception 'trip_forbidden' using errcode='42501'; end if;
    select id into trip_ref from public.trips where id=p_trip and guild_id=p_guild for update;
    if not found or not public.is_guild_member(p_guild) or not public.can_edit_guild_trip(p_trip) then
      raise exception 'trip_forbidden' using errcode='42501'; end if;
    -- Already committed requests retain their original idempotent result. The
    -- delegated function still verifies the actor and exact request hash.
    if not exists(select 1 from private.trip_mutation_receipts
      where trip_id=p_trip and mutation_id=(p_request->>'id')::uuid) then
      target:=(p_request#>>'{change,data,id}')::uuid;
      if operation='delete_item' and exists(select 1 from public.trip_item_stops s
        where s.trip_item_id=target and not(coalesce(p_request#>'{expected,stops}','{}'::jsonb) ? s.id::text)) then
        raise exception 'trip_conflict' using errcode='40001';
      elsif operation='delete_day' and exists(select 1 from public.trip_items i
        where i.trip_id=p_trip and i.trip_day_id=target
          and not(coalesce(p_request#>'{expected,items}','{}'::jsonb) ? i.id::text)) then
        raise exception 'trip_conflict' using errcode='40001';
      end if;
    end if;
  end if;
  return private.mutate_trip_plan_before_structure_guards(p_guild,p_trip,p_request);
end $$;
revoke execute on function public.mutate_trip_plan(text,uuid,jsonb) from public,anon;
grant execute on function public.mutate_trip_plan(text,uuid,jsonb) to authenticated;
