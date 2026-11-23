-- Separate grants for independently typed searches of the same place, so two
-- tabs cannot overwrite each other's authorization before their queued save.
alter table private.mapbox_place_references
  add column query_key text generated always as(md5(user_query)) stored;
alter table private.mapbox_place_references drop constraint mapbox_place_references_pkey;
alter table private.mapbox_place_references add primary key(actor,place_key,query_key);
create or replace function public.mapbox_place_reference(p_actor uuid,p_id text,p_query text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from private.mapbox_settings where singleton and enabled) then raise exception 'mapbox_disabled' using errcode='P0001'; end if;
  if p_actor is null or p_id is null or p_query is null or length(p_id) not between 1 and 8192 or length(btrim(p_query)) not between 1 and 256 then raise exception 'mapbox_reference_invalid' using errcode='22023'; end if;
  insert into private.mapbox_place_references(actor,place_id,user_query) values(p_actor,p_id,btrim(p_query))
    on conflict(actor,place_key,query_key) do update set verified_at=now()
    where private.mapbox_place_references.place_id=excluded.place_id and private.mapbox_place_references.user_query=excluded.user_query;
  if not found then raise exception 'mapbox_reference_collision' using errcode='22023'; end if;
  delete from private.mapbox_place_references where verified_at<now()-interval '1 day';
end $$;
