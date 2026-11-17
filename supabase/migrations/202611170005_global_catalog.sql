-- Extend the shared catalog in place so existing trip and relation references remain valid.
alter table public.categories
  add column description text not null default '' check (length(description) <= 1500),
  add column icon text not null default 'compass' check (icon ~ '^[a-z0-9-]{1,60}$'),
  add column color text not null default '#527aa3' check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column is_enabled boolean not null default true;

insert into public.categories (name,slug,icon,color,position) values
  ('Tourisme','tourisme','landmark','#527aa3',10),
  ('Activités','activites','footprints','#587b67',20),
  ('Gastronomie','gastronomie','utensils','#a76047',30),
  ('Produits locaux','produits-locaux','shopping-basket','#92734a',40),
  ('Adresses','adresses','map-pin','#786a9c',50)
on conflict (slug) do update set icon=excluded.icon,color=excluded.color;

alter table public.cities add constraint cities_id_country_key unique (id,country_id);
alter table public.entries
  add column country_id uuid,
  add column summary text not null default '' check (length(summary) <= 400),
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column sort_order integer not null default 0 check (sort_order >= 0),
  add column custom_values jsonb not null default '{}' check (jsonb_typeof(custom_values) = 'object'),
  add column cover_image_url text check (cover_image_url ~
    ('^/app/entry-media/' || id::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}$'));
update public.entries e set country_id=c.country_id from public.cities c where c.id=e.city_id;
alter table public.entries alter column country_id set not null,
  add constraint entries_country_id_fkey foreign key (country_id) references public.countries(id) on delete restrict,
  add constraint entries_city_country_fkey foreign key (city_id,country_id) references public.cities(id,country_id) on update cascade;

create index entries_country_idx on public.entries(country_id);
create index entries_neighborhood_idx on public.entries(neighborhood_id,city_id);
create index entries_catalog_order_idx on public.entries(city_id,neighborhood_id,category_id,sort_order,title,id) where published;
create index entries_modified_idx on public.entries(updated_at desc,id);
do $$ declare extension_schema text; begin
  select n.nspname into extension_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname='pg_trgm';
  execute format('create index entries_title_search on public.entries using gin (title %I.gin_trgm_ops)',extension_schema);
end $$;

create type public.catalog_field_type as enum ('short_text','long_text','number','boolean','url','date','select','multi_select');
create table public.category_fields (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(key) <= 80),
  label text not null check (length(trim(label)) between 1 and 100),
  type public.catalog_field_type not null,
  is_required boolean not null default false,
  options text[] not null default '{}',
  sort_order integer not null default 0 check (sort_order >= 0),
  unique (category_id,key),
  check (cardinality(options) <= 60 and
    ((type in ('select','multi_select') and cardinality(options) > 0) or
     (type not in ('select','multi_select') and cardinality(options) = 0)))
);

create function private.validate_catalog_values(p_category uuid,p_values jsonb,p_published boolean)
returns void language plpgsql set search_path='' as $$
declare field public.category_fields; value jsonb; raw text;
begin
  if exists(select 1 from jsonb_object_keys(p_values) k
    where not exists(select 1 from public.category_fields f where f.category_id=p_category and f.id::text=k)) then
    raise exception 'catalog_unknown_field' using errcode='23514';
  end if;
  for field in select * from public.category_fields where category_id=p_category loop
    value := p_values->field.id::text;
    if value is null then
      if field.is_required and p_published then
        raise exception 'catalog_required_field: %',field.label using errcode='23514';
      end if;
      continue;
    end if;
    raw := value #>> '{}';
    if not coalesce(case field.type
      when 'short_text' then jsonb_typeof(value)='string' and length(trim(raw)) between 1 and 250
      when 'long_text' then jsonb_typeof(value)='string' and length(trim(raw)) between 1 and 5000
      when 'number' then jsonb_typeof(value)='number'
      when 'boolean' then jsonb_typeof(value)='boolean'
      when 'url' then jsonb_typeof(value)='string' and length(raw) <= 2048 and raw ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'
      when 'date' then jsonb_typeof(value)='string' and raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      when 'select' then jsonb_typeof(value)='string' and raw=any(field.options)
      when 'multi_select' then case when jsonb_typeof(value)='array' then
        jsonb_array_length(value) between 1 and cardinality(field.options)
        and not exists(select 1 from jsonb_array_elements(value) item where jsonb_typeof(item)<>'string' or not ((item #>> '{}')=any(field.options)))
        and jsonb_array_length(value)=(select count(distinct item) from jsonb_array_elements(value) item)
        else false end
    end,false) then
      raise exception 'catalog_invalid_field: %',field.label using errcode='23514';
    end if;
    if field.type='date' then
      perform raw::date;
    end if;
  end loop;
end $$;

create function private.check_catalog_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.role()='authenticated' and not public.is_nagi_admin() then
    raise exception 'permission denied for catalog entries' using errcode='42501';
  end if;
  if new.country_id is null or (tg_op='UPDATE' and new.city_id<>old.city_id and new.country_id=old.country_id) then
    select country_id into new.country_id from public.cities where id=new.city_id;
  end if;
  -- Serialize field definition edits and entry writes for this category.
  perform 1 from public.categories where id=new.category_id for no key update;
  perform private.validate_catalog_values(new.category_id,new.custom_values,new.published);
  return new;
end $$;
create trigger check_catalog_entry before insert or update of city_id,country_id,category_id,custom_values,published on public.entries
  for each row execute function private.check_catalog_entry();

create function private.check_catalog_field() returns trigger language plpgsql set search_path='' as $$
declare category uuid := case when tg_op='DELETE' then old.category_id else new.category_id end;
begin
  perform 1 from public.categories where id=category for no key update;
  if tg_op='UPDATE' and new.category_id<>old.category_id then
    raise exception 'catalog_field_category' using errcode='23514';
  end if;
  if tg_op='DELETE' or (tg_op='UPDATE' and old.type<>new.type) then
    if exists(select 1 from public.entries where category_id=category and custom_values ? old.id::text) then
      raise exception 'catalog_field_in_use' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  if exists(select 1 from unnest(new.options) option where option is null or length(trim(option)) not between 1 and 100)
    or cardinality(new.options)<>(select count(distinct option) from unnest(new.options) option) then
    raise exception 'catalog_field_options' using errcode='23514';
  end if;
  return new;
end $$;
create trigger check_catalog_field before insert or update or delete on public.category_fields
  for each row execute function private.check_catalog_field();

create function private.recheck_catalog_field() returns trigger language plpgsql security definer set search_path='' as $$
declare entry public.entries;
begin
  for entry in select * from public.entries where category_id=new.category_id
    and ((published and new.is_required) or custom_values ? new.id::text) loop
    perform private.validate_catalog_values(entry.category_id,entry.custom_values,entry.published);
  end loop;
  return null;
end $$;
create trigger recheck_catalog_field after insert or update of type,options,is_required on public.category_fields
  for each row execute function private.recheck_catalog_field();

create function public.catalog_order_categories(p_ids uuid[]) returns void language plpgsql set search_path='' as $$
begin
  lock table public.categories in share row exclusive mode;
  if cardinality(p_ids)<>(select count(*) from public.categories) or
    cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) or
    exists(select 1 from unnest(p_ids) wanted(id)
      where not exists(select 1 from public.categories c where c.id=wanted.id)) then
    raise exception 'catalog_order_changed' using errcode='23514';
  end if;
  update public.categories c set position=ordered.position-1
  from unnest(p_ids) with ordinality as ordered(id,position) where c.id=ordered.id;
end $$;

create function public.catalog_remove_category(p_id uuid,p_destination text) returns integer language plpgsql set search_path='' as $$
declare moved integer := 0; destination uuid := nullif(p_destination,'')::uuid;
begin
  perform 1 from public.categories where id in (p_id,destination) order by id for update;
  if not exists(select 1 from public.categories where id=p_id) then
    raise exception 'catalog_category_missing' using errcode='P0002';
  end if;
  if destination is not null then
    if p_id=destination or not exists(select 1 from public.categories where id=destination) then
      raise exception 'catalog_invalid_destination' using errcode='23514';
    end if;
    if exists(select 1 from public.entries e join public.category_fields f on f.category_id=p_id and e.custom_values ? f.id::text
      where e.category_id=p_id and not exists(select 1 from public.category_fields target
        where target.category_id=destination and target.key=f.key and target.type=f.type)) then
      raise exception 'catalog_reassign_fields' using errcode='23514';
    end if;
    update public.entries e set category_id=destination,
      custom_values=coalesce((select jsonb_object_agg(target.id::text,e.custom_values->f.id::text)
        from public.category_fields f join public.category_fields target
        on target.category_id=destination and target.key=f.key and target.type=f.type
        where f.category_id=p_id and e.custom_values ? f.id::text),'{}'::jsonb),
      slug=case when exists(select 1 from public.entries other where other.category_id=destination
        and other.city_id=e.city_id and other.slug=e.slug)
        then rtrim(left(e.slug,62),'-') || '-r' || replace(e.id::text,'-','') else e.slug end
    where e.category_id=p_id;
    get diagnostics moved = row_count;
  end if;
  delete from public.categories where id=p_id;
  return moved;
end $$;

create table public.relation_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 100),
  forward_label text not null check (length(trim(forward_label)) between 1 and 120),
  inverse_label text not null check (length(trim(inverse_label)) between 1 and 120),
  is_symmetric boolean not null default false,
  is_acyclic boolean not null default false check (not (is_symmetric and is_acyclic)),
  sort_order integer not null default 0 check (sort_order >= 0)
);
insert into public.relation_types (slug,name,forward_label,inverse_label,is_symmetric,sort_order) values
  ('related','À découvrir avec','À découvrir avec','À découvrir avec',true,0),
  ('available-at','Disponible chez','Où le trouver ?','À découvrir à cette adresse',false,10),
  ('served-at','Servi chez','Où déguster cette spécialité ?','Spécialités à découvrir',false,20),
  ('nearby','À proximité de','À proximité','À proximité',true,30),
  ('activity','Activité associée','Activités associées','Lieux associés',false,40);
insert into public.relation_types (slug,name,forward_label,inverse_label,is_symmetric)
  select kind,left(kind,100),left(kind,120),left(kind,120),bool_and(bidirectional)
  from public.entry_relations group by kind on conflict (slug) do nothing;
-- Preserve legacy kinds that had both directed and symmetric instances.
insert into public.relation_types (slug,name,forward_label,inverse_label,is_symmetric)
  select distinct 'legacy-' || md5(r.kind || ':' || r.bidirectional::text),
    left(r.kind,80) || case when r.bidirectional then ' (symétrique)' else ' (orientée)' end,
    left(r.kind,120),left(r.kind,120),r.bidirectional
  from public.entry_relations r join public.relation_types t on t.slug=r.kind
  where t.is_symmetric<>r.bidirectional;
alter table public.entry_relations add column relation_type_id uuid references public.relation_types(id) on delete restrict;
update public.entry_relations r set relation_type_id=t.id
  from public.relation_types base,public.relation_types t
  where base.slug=r.kind and t.slug=case when base.is_symmetric=r.bidirectional then base.slug
    else 'legacy-' || md5(r.kind || ':' || r.bidirectional::text) end;
update public.entry_relations r set kind=t.slug
  from public.relation_types t where r.relation_type_id=t.id and r.kind<>t.slug;
alter table public.entry_relations alter column relation_type_id set not null;
create index relations_type_idx on public.entry_relations(relation_type_id);
create unique index relations_type_edge_idx on public.entry_relations(source_id,target_id,relation_type_id);
create unique index relations_type_symmetric_idx on public.entry_relations(least(source_id,target_id),greatest(source_id,target_id),relation_type_id) where bidirectional;

create function private.check_catalog_relation() returns trigger language plpgsql security definer set search_path='' as $$
declare relation public.relation_types;
begin
  if auth.role()='authenticated' and not public.is_nagi_admin() then
    raise exception 'permission denied for catalog relations' using errcode='42501';
  end if;
  if new.relation_type_id is null or (tg_op='UPDATE' and old.kind<>new.kind and old.relation_type_id=new.relation_type_id) then
    select * into relation from public.relation_types
    where slug in (new.kind,'legacy-' || md5(new.kind || ':' || new.bidirectional::text))
    order by (is_symmetric=new.bidirectional) desc limit 1 for no key update;
    if not found then raise exception 'catalog_relation_type_missing' using errcode='23503'; end if;
    new.relation_type_id := relation.id;
  else
    select * into relation from public.relation_types where id=new.relation_type_id for no key update;
    if not found then raise exception 'catalog_relation_type_missing' using errcode='23503'; end if;
  end if;
  new.kind := relation.slug;
  new.bidirectional := relation.is_symmetric;
  if relation.is_acyclic and exists(
    with recursive reachable(id) as (
      select new.target_id
      union
      select edge.target_id from reachable join public.entry_relations edge on edge.source_id=reachable.id
        where edge.relation_type_id=relation.id and edge.id<>new.id
    ) select 1 from reachable where id=new.source_id
  ) then raise exception 'catalog_relation_cycle' using errcode='23514'; end if;
  return new;
end $$;
create trigger check_catalog_relation before insert or update of source_id,target_id,kind,bidirectional,relation_type_id on public.entry_relations
  for each row execute function private.check_catalog_relation();

create function private.protect_relation_type() returns trigger language plpgsql set search_path='' as $$
begin
  if (old.slug,old.is_symmetric,old.is_acyclic) is distinct from (new.slug,new.is_symmetric,new.is_acyclic)
    and exists(select 1 from public.entry_relations where relation_type_id=old.id) then
    raise exception 'catalog_relation_type_in_use' using errcode='23514';
  end if;
  return new;
end $$;
create trigger protect_relation_type before update of slug,is_symmetric,is_acyclic on public.relation_types
  for each row execute function private.protect_relation_type();

create table public.entry_media (
  id uuid primary key,
  entry_id uuid not null references public.entries(id) on delete cascade,
  version uuid not null,
  storage_path text not null unique check (storage_path=entry_id::text || '/' || id::text || '/' || version::text || '.webp'),
  alt_text text not null check (length(alt_text) <= 220),
  sort_order integer not null check (sort_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);
create index entry_media_order_idx on public.entry_media(entry_id,sort_order,id);
create unique index entry_media_explicit_cover_idx on public.entry_media(entry_id) where is_cover;
create table public.catalog_media_garbage (
  path text primary key,
  not_before timestamptz not null default now()
);
create index catalog_media_garbage_ready_idx on public.catalog_media_garbage(not_before);

create function private.update_entry_cover() returns trigger language plpgsql set search_path='' as $$
declare entry uuid := case when tg_op='DELETE' then old.entry_id else new.entry_id end;
begin
  if tg_op='DELETE' or (tg_op='UPDATE' and old.storage_path<>new.storage_path) then
    insert into public.catalog_media_garbage(path) values (old.storage_path)
      on conflict (path) do update set not_before=now();
  end if;
  update public.entries set cover_image_url=(
    select '/app/entry-media/' || entry_id::text || '/' || id::text || '/' || version::text
      from public.entry_media where entry_id=entry order by is_cover desc,sort_order,id limit 1
  ) where id=entry;
  return null;
end $$;
create trigger update_entry_cover after insert or update of storage_path,is_cover,sort_order or delete on public.entry_media
  for each row execute function private.update_entry_cover();

create function public.catalog_edit_media(p_entry uuid,p_operation text,p_data jsonb) returns void
language plpgsql set search_path='' as $$
declare media uuid := (p_data->>'id')::uuid; version_id uuid := (p_data->>'version')::uuid;
  media_path text := p_entry::text || '/' || media::text || '/' || version_id::text || '.webp';
  existing public.entry_media; media_count integer; ordered_ids uuid[];
begin
  perform 1 from public.entries where id=p_entry for update;
  if not found then raise exception 'catalog_entry_missing' using errcode='P0002'; end if;
  select count(*) into media_count from public.entry_media where entry_id=p_entry;
  if p_operation in ('replace','remove','alt','cover') then
    select * into existing from public.entry_media where entry_id=p_entry and id=media;
    if not found or existing.version::text is distinct from p_data->>'expected_version' then
      raise exception 'catalog_media_changed' using errcode='23514';
    end if;
  end if;
  case p_operation
    when 'add' then
      if media_count>=20 then raise exception 'catalog_media_limit' using errcode='23514'; end if;
      insert into public.entry_media(id,entry_id,version,storage_path,alt_text,sort_order)
        values (media,p_entry,version_id,media_path,p_data->>'alt_text',
          coalesce((select max(sort_order)+1 from public.entry_media where entry_id=p_entry),0));
    when 'replace' then
      update public.entry_media set version=version_id,storage_path=media_path,alt_text=p_data->>'alt_text' where id=media;
    when 'remove' then
      delete from public.entry_media where id=media;
    when 'alt' then
      update public.entry_media set alt_text=p_data->>'alt_text' where id=media;
    when 'cover' then
      update public.entry_media set is_cover=false where entry_id=p_entry and is_cover;
      update public.entry_media set is_cover=true where id=media;
    when 'auto' then
      update public.entry_media set is_cover=false where entry_id=p_entry and is_cover;
    when 'order' then
      select array(select item::uuid from jsonb_array_elements_text(p_data->'ids') item) into ordered_ids;
      if cardinality(ordered_ids)<>media_count or
        cardinality(ordered_ids)<>(select count(distinct item) from unnest(ordered_ids) item) or
        exists(select 1 from unnest(ordered_ids) item where not exists(select 1 from public.entry_media where entry_id=p_entry and id=item)) then
        raise exception 'catalog_media_changed' using errcode='23514';
      end if;
      update public.entry_media m set sort_order=o.position-1
        from unnest(ordered_ids) with ordinality o(id,position) where m.id=o.id;
    else raise exception 'catalog_unknown_operation' using errcode='22023';
  end case;
  if p_operation in ('add','replace') then
    delete from public.catalog_media_garbage where path=media_path;
  end if;
end $$;

-- Lookup policies on entries, media and relations share the public visibility graph.
drop policy content_read on public.categories;
create policy content_read on public.categories for select to anon,authenticated using (is_enabled);
drop policy entries_read on public.entries;
create policy entries_read on public.entries for select to anon,authenticated using (
  published and exists(select 1 from public.categories c where c.id=category_id and c.is_enabled)
  and exists(select 1 from public.countries p where p.id=country_id and p.is_published)
  and exists(select 1 from public.cities c where c.id=city_id and c.is_published
    and c.has_neighborhoods=(neighborhood_id is not null))
  and (neighborhood_id is null or exists(select 1 from public.neighborhoods n where n.id=neighborhood_id and n.is_published))
);
alter table public.category_fields enable row level security;
alter table public.relation_types enable row level security;
alter table public.entry_media enable row level security;
alter table public.catalog_media_garbage enable row level security;
create policy catalog_fields_read on public.category_fields for select to anon,authenticated using (
  exists(select 1 from public.categories where id=category_id)
);
create policy catalog_relation_types_read on public.relation_types for select to anon,authenticated using (true);
create policy catalog_media_read on public.entry_media for select to anon,authenticated using (
  exists(select 1 from public.entries where id=entry_id)
);
create function public.catalog_categories_at(p_city uuid,p_neighborhood text)
returns setof public.categories language sql stable set search_path='' as $$
  select c.* from public.categories c
  where c.is_enabled and exists (
    select 1 from public.entries e where e.category_id=c.id and e.city_id=p_city and e.published and
    (case when p_neighborhood='' then e.neighborhood_id is null else e.neighborhood_id=p_neighborhood::uuid end)
  ) order by c.position,c.name,c.id
$$;
revoke execute on function public.catalog_categories_at(uuid,text) from public;
grant execute on function public.catalog_categories_at(uuid,text) to anon,authenticated,service_role;
revoke all on public.category_fields,public.relation_types,public.entry_media,public.catalog_media_garbage from public,anon,authenticated;
grant select on public.category_fields,public.relation_types,public.entry_media to anon,authenticated;
grant all on public.category_fields,public.relation_types,public.entry_media,public.catalog_media_garbage to service_role;
revoke execute on function private.validate_catalog_values(uuid,jsonb,boolean),private.check_catalog_entry(),
  private.recheck_catalog_field(),private.check_catalog_relation() from public,anon,authenticated;
revoke execute on function public.catalog_order_categories(uuid[]),public.catalog_remove_category(uuid,text),
  public.catalog_edit_media(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.catalog_order_categories(uuid[]),public.catalog_remove_category(uuid,text),
  public.catalog_edit_media(uuid,text,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('entry-media','entry-media',false,8388608,array['image/webp']);
create policy entry_media_server_only on storage.objects as restrictive for all to anon,authenticated
  using (bucket_id<>'entry-media') with check (bucket_id<>'entry-media');
