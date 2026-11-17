-- Keep the existing geographic IDs, foreign keys and entry-to-trip references.
alter table public.countries rename column code to iso_code;
alter table public.cities rename column neighborhoods_enabled to has_neighborhoods;

do $$ declare t text; begin
  foreach t in array array['countries','cities','neighborhoods'] loop
    execute format('alter table public.%I
      add column description text check (length(description) <= 5000),
      add column cover_image_url text,
      add column is_published boolean not null default true,
      add column sort_order integer not null default 0 check (sort_order >= 0)', t);
    -- Existing destinations were visible before this migration. New ones start as drafts.
    execute format('alter table public.%I alter column is_published set default false', t);
    execute format('alter table public.%I add constraint %I check (
      cover_image_url ~ (''^/app/catalog-cover/%s/'' || id::text || ''/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$''))',
      t, t || '_cover_path', t);
  end loop;
end $$;

-- A missing legacy code must not prevent an administrator from withdrawing a country.
create function private.require_country_iso() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.iso_code is null then
    raise exception 'countries_iso_required: ISO code is required' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger require_country_iso before insert or update of iso_code on public.countries
for each row execute function private.require_country_iso();
alter table public.countries rename constraint countries_code_key to countries_iso_code_key;

alter table public.cities
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180);
alter table public.neighborhoods
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180);

create index countries_catalog_order on public.countries(sort_order, name, id);
create index cities_catalog_order on public.cities(sort_order, name, id);
create index neighborhoods_catalog_order on public.neighborhoods(sort_order, name, id);
create index cities_country_catalog_order on public.cities(country_id, sort_order, name, id);
create index neighborhoods_city_catalog_order on public.neighborhoods(city_id, sort_order, name, id);

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
do $$ declare t text; trgm_schema text; begin
  select n.nspname into trgm_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  foreach t in array array['countries','cities','neighborhoods'] loop
    execute format('create index %I on public.%I using gin (name %I.gin_trgm_ops)', t || '_catalog_search', t, trgm_schema);
  end loop;
end $$;

create or replace function public.check_entry_neighborhood() returns trigger language plpgsql set search_path = '' as $$
declare enabled boolean;
begin
  if tg_op = 'UPDATE' and new.city_id = old.city_id
    and new.neighborhood_id is not distinct from old.neighborhood_id then
    return new;
  end if;
  select has_neighborhoods into enabled from public.cities where id = new.city_id for share;
  if new.neighborhood_id is not null and enabled is not true then
    raise exception 'Neighborhoods are disabled for this city' using errcode = '23514';
  end if;
  if new.neighborhood_id is null and enabled then
    raise exception 'A neighborhood is required for this city' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger check_city_neighborhoods on public.cities;

-- Reconcile preexisting districts without relocating or discarding any content.
update public.cities c set has_neighborhoods = true
where not has_neighborhoods and exists(select 1 from public.neighborhoods n where n.city_id = c.id);

create or replace function public.check_city_neighborhoods() returns trigger language plpgsql set search_path = '' as $$
declare enabled boolean;
begin
  -- A deferred check evaluates the city's final mode after an explicit migration.
  select has_neighborhoods into enabled from public.cities where id = new.id;
  if enabled is false then
    if exists(select 1 from public.entries where city_id = new.id and neighborhood_id is not null) then
      raise exception 'Detach entries from neighborhoods before disabling them' using errcode = '23514';
    end if;
    if exists(select 1 from public.neighborhoods where city_id = new.id) then
      raise exception 'Move or remove neighborhoods before disabling them' using errcode = '23514';
    end if;
  elsif enabled
    and exists(select 1 from public.entries where city_id = new.id and neighborhood_id is null) then
    raise exception 'Reorganize city entries before enabling neighborhoods' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger check_city_neighborhoods after update of has_neighborhoods on public.cities
deferrable initially immediate for each row when (old.has_neighborhoods is distinct from new.has_neighborhoods)
execute function public.check_city_neighborhoods();

create function private.check_neighborhood_city() returns trigger language plpgsql set search_path = '' as $$
declare enabled boolean;
begin
  -- FOR SHARE conflicts with updates to the city's mode, including non-key updates.
  select has_neighborhoods into enabled from public.cities where id = new.city_id for share;
  if enabled is false then
    raise exception 'Neighborhoods are disabled for this city' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger check_neighborhood_city before insert or update of city_id on public.neighborhoods
for each row execute function private.check_neighborhood_city();

drop policy content_read on public.countries;
drop policy content_read on public.cities;
drop policy content_read on public.neighborhoods;
create policy content_read on public.countries for select to anon, authenticated using (is_published);
create policy content_read on public.cities for select to anon, authenticated using (
  is_published and exists (select 1 from public.countries where id = country_id and is_published)
);
create policy content_read on public.neighborhoods for select to anon, authenticated using (
  is_published and exists (select 1 from public.cities c join public.countries p on p.id = c.country_id
    where c.id = city_id and c.has_neighborhoods and c.is_published and p.is_published)
);

drop policy entries_read on public.entries;
create policy entries_read on public.entries for select to anon, authenticated using (
  published and exists (select 1 from public.cities where id = city_id)
  and (neighborhood_id is null or exists (select 1 from public.neighborhoods where id = neighborhood_id))
);

-- Raw storage access is reserved for the server. The media route checks geography RLS first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('destination-covers', 'destination-covers', false, 8388608, array['image/webp']);
create policy destination_covers_server_only on storage.objects as restrictive for all
to anon, authenticated using (bucket_id <> 'destination-covers')
with check (bucket_id <> 'destination-covers');
