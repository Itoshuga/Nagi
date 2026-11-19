-- Extend the existing graph. Keep every relation ID, endpoint and legacy type key.
alter table public.relation_types
  add column description text not null default '' check(length(description)<=1000),
  add column icon text check(length(icon)<=80 and icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column is_enabled boolean not null default true,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
alter table public.entry_relations add column created_by uuid references public.profiles(id) on delete set null;
create trigger touch_updated_at before update on public.relation_types for each row execute function public.touch_updated_at();

-- Symmetric labels have a single source of truth, including direct privileged writes.
create function private.normalize_relation_type() returns trigger language plpgsql set search_path='' as $$
begin
 if new.is_symmetric then new.inverse_label:=new.forward_label; end if;
 return new;
end $$;
revoke execute on function private.normalize_relation_type() from public,anon,authenticated;
create trigger normalize_relation_type before insert or update of forward_label,inverse_label,is_symmetric on public.relation_types
for each row execute function private.normalize_relation_type();
create or replace function private.protect_relation_type() returns trigger language plpgsql set search_path='' as $$
begin
 if old.slug<>new.slug then raise exception 'catalog_relation_key_immutable' using errcode='23514'; end if;
 if (old.is_symmetric,old.is_acyclic) is distinct from (new.is_symmetric,new.is_acyclic)
 and exists(select 1 from public.entry_relations where relation_type_id=old.id) then
   raise exception 'catalog_relation_type_in_use' using errcode='23514';
 end if;
 return new;
end $$;

create or replace function private.check_catalog_relation() returns trigger language plpgsql security definer set search_path='' as $$
declare relation public.relation_types; swap uuid;
begin
 if auth.role()='authenticated' and not public.is_nagi_admin() then raise exception 'permission denied for catalog relations' using errcode='42501'; end if;
 if new.relation_type_id is null or (tg_op='UPDATE' and old.kind<>new.kind and old.relation_type_id=new.relation_type_id) then
  select * into relation from public.relation_types where slug in (new.kind,'legacy-' || md5(new.kind || ':' || new.bidirectional::text))
  order by (is_symmetric=new.bidirectional) desc limit 1 for no key update;
 else
  select * into relation from public.relation_types where id=new.relation_type_id for no key update;
 end if;
 if not found then raise exception 'catalog_relation_type_missing' using errcode='23503'; end if;
 if not relation.is_enabled and (tg_op='INSERT' or (old.source_id,old.target_id,old.relation_type_id) is distinct from (new.source_id,new.target_id,relation.id))
 then raise exception 'catalog_relation_type_disabled' using errcode='23514'; end if;
 new.relation_type_id:=relation.id; new.kind:=relation.slug; new.bidirectional:=relation.is_symmetric;
 if relation.is_symmetric and new.source_id>new.target_id then swap:=new.source_id;new.source_id:=new.target_id;new.target_id:=swap;end if;
 if relation.is_acyclic and exists(
  with recursive reachable(id) as (
   select new.target_id union select e.target_id from reachable r join public.entry_relations e on e.source_id=r.id
   where e.relation_type_id=relation.id and e.id<>new.id
  ) select 1 from reachable where id=new.source_id
 ) then raise exception 'catalog_relation_cycle' using errcode='23514'; end if;
 return new;
end $$;

-- All editor mutations verify global admin rights again inside PostgreSQL.
create function public.catalog_edit_relation(p_entry uuid,p_id uuid,p_expected timestamptz,p_other uuid,p_type uuid,p_direction text,p_delete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.entry_relations; kind public.relation_types; result public.entry_relations; source uuid; target uuid;
begin
 if not public.is_nagi_admin() then raise exception 'catalog_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nagi:semantic-relations',0));
 if p_entry is null then raise exception 'catalog_relation_invalid' using errcode='23514'; end if;
 if p_id is not null then
  select * into prior from public.entry_relations where id=p_id for update;
  if not found or p_entry not in (prior.source_id,prior.target_id) then raise exception 'catalog_relation_missing' using errcode='42501'; end if;
  if p_expected is null or prior.updated_at<>p_expected then raise exception 'catalog_relation_changed' using errcode='40001'; end if;
 elsif p_delete then raise exception 'catalog_relation_missing' using errcode='42501'; end if;
 if p_delete then
  delete from public.entry_relations where id=p_id;
 else
  if p_entry is null or p_other is null or p_entry=p_other or p_direction not in ('forward','inverse') or p_direction is null then raise exception 'catalog_relation_invalid' using errcode='23514'; end if;
  select * into kind from public.relation_types where id=p_type for no key update;
  if not found then raise exception 'catalog_relation_type_missing' using errcode='23503'; end if;
  source:=case when p_direction='inverse' and not kind.is_symmetric then p_other else p_entry end;
  target:=case when p_direction='inverse' and not kind.is_symmetric then p_entry else p_other end;
  if p_id is null then
   insert into public.entry_relations(source_id,target_id,relation_type_id,created_by) values(source,target,p_type,auth.uid()) returning * into result;
  else
   update public.entry_relations set source_id=source,target_id=target,relation_type_id=p_type where id=p_id returning * into result;
  end if;
 end if;
 return jsonb_build_object('id',coalesce(result.id,prior.id),'entries',array(select distinct x from unnest(array[prior.source_id,prior.target_id,result.source_id,result.target_id]) x where x is not null));
end $$;

create function public.catalog_save_relation_type(p_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; prior public.relation_types;
begin
 if not public.is_nagi_admin() then raise exception 'catalog_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nagi:semantic-relations',0));
 if p_id is null then
  insert into public.relation_types(slug,name,forward_label,inverse_label,is_symmetric,is_acyclic,is_enabled,description,icon,sort_order)
  values(p_data->>'slug',p_data->>'name',p_data->>'forward_label',p_data->>'inverse_label',(p_data->>'is_symmetric')::boolean,(p_data->>'is_acyclic')::boolean,(p_data->>'is_enabled')::boolean,coalesce(p_data->>'description',''),nullif(p_data->>'icon',''),(p_data->>'sort_order')::integer) returning id into result;
 else
  select * into prior from public.relation_types where id=p_id for update;
  if not found then raise exception 'catalog_relation_type_missing' using errcode='23503'; end if;
  if prior.updated_at is distinct from (p_data->>'updated_at')::timestamptz then raise exception 'catalog_relation_changed' using errcode='40001'; end if;
  update public.relation_types set name=p_data->>'name',forward_label=p_data->>'forward_label',inverse_label=p_data->>'inverse_label',
   is_symmetric=(p_data->>'is_symmetric')::boolean,is_acyclic=(p_data->>'is_acyclic')::boolean,is_enabled=(p_data->>'is_enabled')::boolean,
   description=coalesce(p_data->>'description',''),icon=nullif(p_data->>'icon','') where id=p_id returning id into result;
 end if;
 return result;
end $$;
create function public.catalog_toggle_relation_type(p_id uuid,p_enabled boolean,p_expected timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_nagi_admin() then raise exception 'catalog_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nagi:semantic-relations',0));
 update public.relation_types set is_enabled=p_enabled where id=p_id and updated_at=p_expected;
 if not found then raise exception 'catalog_relation_changed' using errcode='40001'; end if;
end $$;
create function public.catalog_order_relation_types(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_nagi_admin() then raise exception 'catalog_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nagi:semantic-relations',0));
 if p_ids is null or cardinality(p_ids)<>(select count(*) from public.relation_types) or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id)
 or exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.relation_types t where t.id=id)) then raise exception 'catalog_order_changed' using errcode='40001'; end if;
 update public.relation_types t set sort_order=ordered.position-1 from (select id,ordinality::integer position from unnest(p_ids) with ordinality ids(id,ordinality)) ordered where t.id=ordered.id;
end $$;
create function public.catalog_remove_relation_type(p_id uuid,p_destination uuid,p_expected timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare source public.relation_types; target public.relation_types; total integer;
begin
 if not public.is_nagi_admin() then raise exception 'catalog_forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nagi:semantic-relations',0));
 select * into source from public.relation_types where id=p_id for update;
 if not found or source.updated_at<>p_expected or p_expected is null then raise exception 'catalog_relation_changed' using errcode='40001'; end if;
 select count(*)::integer into total from public.entry_relations where relation_type_id=p_id;
 if total>0 then
  if p_destination is null then raise exception 'catalog_relation_type_in_use' using errcode='23514'; end if;
  select * into target from public.relation_types where id=p_destination for update;
  if not found or target.id=source.id or not target.is_enabled or (target.is_symmetric,target.is_acyclic) is distinct from (source.is_symmetric,source.is_acyclic)
  then raise exception 'catalog_relation_reassign' using errcode='23514'; end if;
  update public.entry_relations set relation_type_id=target.id where relation_type_id=source.id;
 end if;
 delete from public.relation_types where id=p_id;
 return total;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('catalog_edit_relation','catalog_save_relation_type','catalog_toggle_relation_type','catalog_order_relation_types','catalog_remove_relation_type') loop
 execute format('revoke execute on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Existing semantic equivalents win; never rename user types or merge ambiguous links.
do $$ declare seed record; begin
 for seed in select * from (values
 ('located-in','Se situe dans','Abrite',false,true),('organizes','Organise','Est organisé par',false,false),
 ('part-of','Fait partie de','Comprend',false,true),('access-to','Donne accès à','Est accessible depuis',false,false),
 ('specialty-of','Est une spécialité de','A pour spécialité',false,false),('alternative-to','Est une alternative à','Est une alternative à',true,false)
 ) as seeds(slug,forward_label,inverse_label,is_symmetric,is_acyclic) loop
 if not exists(select 1 from public.relation_types t where t.slug=seed.slug
 or (lower(trim(t.forward_label)),lower(trim(t.inverse_label))) in ((lower(seed.forward_label),lower(seed.inverse_label)),(lower(seed.inverse_label),lower(seed.forward_label)))) then
  insert into public.relation_types(slug,name,forward_label,inverse_label,is_symmetric,is_acyclic,sort_order)
  values(seed.slug,seed.forward_label,seed.forward_label,seed.inverse_label,seed.is_symmetric,seed.is_acyclic,(select coalesce(max(sort_order),0)+10 from public.relation_types));
 end if;
 end loop;
end $$;
