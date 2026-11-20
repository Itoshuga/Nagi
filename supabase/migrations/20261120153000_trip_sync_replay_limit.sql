-- Bound replay responses to the validated transport contract. Gaps and older
-- cursors request an authorized snapshot without transferring unusable events.
create or replace function public.read_trip_changes(p_guild text,p_trip uuid,p_after integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare trip public.trips; events jsonb; earliest integer; needs_snapshot boolean;
begin
  if auth.uid() is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501'; end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for share;
  if not found then raise exception 'trip_missing' using errcode='42501'; end if;
  select min(version) into earliest from private.trip_plan_events where trip_id=p_trip;
  needs_snapshot:=p_after>trip.version or trip.version-p_after>1000 or
    (p_after<trip.version and (earliest is null or earliest>p_after+1 or
      (select count(*) from private.trip_plan_events where trip_id=p_trip and version>p_after)<>trip.version-p_after));
  if needs_snapshot then events:='[]'::jsonb;
  else
    select coalesce(jsonb_agg(payload order by version),'[]'::jsonb) into events
      from private.trip_plan_events where trip_id=p_trip and version>p_after;
  end if;
  return jsonb_build_object('version',trip.version,'events',events,
    'reset',needs_snapshot,
    'can_edit',public.can_edit_guild_trip(p_trip),'can_manage',public.is_trip_organizer(p_trip));
end $$;
