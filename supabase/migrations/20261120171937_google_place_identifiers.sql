-- Google documents variable-length IDs, including long address identifiers.
-- Store complete references. Hash indexes avoid PostgreSQL btree tuple limits;
-- equality always compares the full ID, including the collision guard below.
do $$ declare tab text; begin
  foreach tab in array array['trip_items','trip_item_stops'] loop
    execute format('alter table public.%I drop constraint %I',tab,tab||'_place_source');
    execute format('alter table public.%I add constraint %I check (
      (source=''nagi'' and entry_id is not null and google_place_id is null and custom_title is null and custom_location is null and custom_latitude is null and custom_longitude is null)
      or (source=''google'' and entry_id is null and google_place_id is not null and google_place_id ~ ''^[A-Za-z0-9_-]+$'' and custom_title is null and custom_location is null and custom_latitude is null and custom_longitude is null)
      or (source=''custom'' and entry_id is null and google_place_id is null and custom_title is not null and length(btrim(custom_title)) between 1 and 160 and length(coalesce(custom_location,''''))<=500
        and ((custom_latitude is null and custom_longitude is null) or (custom_latitude is not null and custom_longitude is not null and custom_latitude between -90 and 90 and custom_longitude between -180 and 180)))
    )',tab,tab||'_place_source');
    execute format('drop index public.%I',tab||'_google_place_idx');
    execute format('create index %I on public.%I using hash(google_place_id) where google_place_id is not null',tab||'_google_place_idx',tab);
  end loop;
end $$;
alter table public.entries drop constraint entries_google_place_id_check;
alter table public.entries add constraint entries_google_place_id_check check(google_place_id is null or google_place_id ~ '^[A-Za-z0-9_-]+$');

alter table private.google_place_references drop constraint google_place_references_pkey;
alter table private.google_place_references add column place_key text generated always as (md5(place_id)) stored;
alter table private.google_place_references add primary key(place_key);
-- place_id retains NOT NULL from its original primary key.
create or replace function public.google_place_reference(p_id text,p_available boolean default null,p_replacement text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_available is not null then
    insert into private.google_place_references(place_id,available,replacement_id) values(p_id,p_available,p_replacement)
      on conflict(place_key) do update set verified_at=now(),available=excluded.available,replacement_id=excluded.replacement_id
      where private.google_place_references.place_id=excluded.place_id;
    if not found then raise exception 'google_reference_collision' using errcode='22023'; end if;
  end if;
  return (select to_jsonb(r)-'place_key' from private.google_place_references r where place_key=md5(p_id) and place_id=p_id);
end $$;
revoke execute on function public.google_place_reference(text,boolean,text) from public,anon,authenticated;
grant execute on function public.google_place_reference(text,boolean,text) to service_role;

do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.edit_trip_plan(text,uuid,integer,text,jsonb)'::regprocedure);
  if position('where place_id=google_ref and available' in definition)=0 then raise exception 'Unexpected place verifier'; end if;
  execute replace(definition,'where place_id=google_ref and available','where place_key=md5(google_ref) and place_id=google_ref and available');
end $$;
