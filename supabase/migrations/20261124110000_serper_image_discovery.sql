-- Discovery references are private. Only reviewed photographs enter the existing
-- public external_images store. No original files are downloaded or imported.
create table public.image_galleries (
  cache_key text primary key check(cache_key ~ '^[a-f0-9]{64}$'),
  place_source text not null check(place_source in ('nagi','mapbox','custom')),
  place_kind text not null default 'entry' check(place_kind in ('entry','country','city','neighborhood','category')),
  place_id text not null check(length(place_id) between 1 and 8192),
  query_hash text check(query_hash ~ '^[a-f0-9]{64}$'),
  next_page integer not null default 1 check(next_page>0),
  query_index integer not null default 0 check(query_index between 0 and 2),
  pages integer not null default 0 check(pages>=0),
  page_limit integer not null default 5 check(page_limit>0),
  state text not null default 'idle' check(state in ('idle','indexing','more','complete','limited','unavailable')),
  stop_reason text,
  credits numeric not null default 0 check(credits>=0),
  lease_id uuid, lease_until timestamptz, next_retry_at timestamptz,
  searched_at timestamptz, updated_at timestamptz not null default now(),
  unique(place_source,place_kind,place_id)
);
create index image_galleries_lease_idx on public.image_galleries(lease_until) where lease_until is not null;
create table public.image_candidates (
  id uuid primary key,
  gallery_key text not null references public.image_galleries(cache_key) on delete cascade,
  url_key text not null check(url_key ~ '^[a-f0-9]{64}$'),
  provider text not null default 'serper' check(provider='serper'),
  title text not null default '' check(length(title)<=1000),
  metadata jsonb not null check(jsonb_typeof(metadata)='object' and metadata->>'imageUrl' like 'https://%'),
  additional_sources jsonb not null default '[]' check(jsonb_typeof(additional_sources)='array'),
  photo_id uuid references public.external_images(id) on delete set null,
  relevance integer not null default 0,
  rights_status text not null default 'unknown' check(rights_status in ('unknown','open_license','permission_granted','restricted','rejected')),
  creator text, license text, license_url text, rights_evidence text,
  reviewed_by uuid references public.profiles(id) on delete set null, verified_at timestamptz,
  availability_status text not null default 'unknown' check(availability_status in ('available','unavailable','unknown')),
  is_excluded boolean not null default false,
  reports integer not null default 0 check(reports>=0),
  discovered_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(gallery_key,url_key)
);
create index image_candidates_gallery_rank_idx on public.image_candidates(gallery_key,relevance desc,id);
create index image_candidates_rights_idx on public.image_candidates(gallery_key,rights_status);
alter table public.image_galleries enable row level security;
alter table public.image_candidates enable row level security;
create policy gallery_server on public.image_galleries for all to service_role using(true) with check(true);
create policy candidate_server on public.image_candidates for all to service_role using(true) with check(true);
revoke all on public.image_galleries,public.image_candidates from public,anon,authenticated;
grant all on public.image_galleries,public.image_candidates to service_role;

alter table public.external_images drop constraint external_images_provider_check;
alter table public.external_images add constraint external_images_provider_check check(provider in ('wikimedia','wikipedia','openverse','serper'));
alter table public.external_images drop constraint external_images_metadata_check;
alter table public.external_images add constraint external_images_metadata_check check(
  jsonb_typeof(metadata)='object' and metadata ?& array['imageUrl','thumbnailUrl','sourceUrl'] and (
    (provider<>'serper' and metadata ?& array['license','licenseUrl'] and metadata->>'license' in ('CC0','Public domain','CC BY','CC BY-SA')
     and metadata->>'imageUrl' like 'https://upload.wikimedia.org/%'
     and (metadata->>'thumbnailUrl' like 'https://upload.wikimedia.org/%' or metadata->>'thumbnailUrl' like 'https://thumb.wikimedia.org/%')
     and metadata->>'sourceUrl' like 'https://commons.wikimedia.org/%'
     and metadata->>'licenseUrl' like 'https://creativecommons.org/%')
    or (provider='serper' and metadata ?& array['rightsStatus','usageRights'] and metadata->>'rightsStatus' in ('open_license','permission_granted')
      and metadata->>'usageRights' in ('open','permission-granted')
      and metadata->>'imageUrl' like 'https://%' and metadata->>'thumbnailUrl' like 'https://%'
      and metadata->>'sourceUrl' like 'https://%')
  )
);
alter policy open_image_read on public.external_images using(available and (provider='serper' or verified_at>now()-interval '30 days'));

alter table public.place_image_assignments
  add column country_id uuid unique references public.countries(id) on delete cascade,
  add column city_id uuid unique references public.cities(id) on delete cascade,
  add column neighborhood_id uuid unique references public.neighborhoods(id) on delete cascade,
  add column category_id uuid unique references public.categories(id) on delete cascade,
  add column gallery_key text unique references public.image_galleries(cache_key) on delete cascade;
alter table public.place_image_assignments drop constraint place_image_assignments_check;
alter table public.place_image_assignments add constraint place_image_assignments_check check(
  num_nonnulls(entry_id,country_id,city_id,neighborhood_id,category_id,gallery_key,visit_id)=1
  and ((trip_id is null and visit_id is null) or (trip_id is not null and visit_id is not null))
);
alter policy catalog_image_assignment_read on public.place_image_assignments using(
  (entry_id is not null and exists(select 1 from public.entries e where e.id=entry_id and e.published))
  or (country_id is not null and exists(select 1 from public.countries c where c.id=country_id and c.is_published))
  or (city_id is not null and exists(select 1 from public.cities c where c.id=city_id and c.is_published))
  or (neighborhood_id is not null and exists(select 1 from public.neighborhoods n where n.id=neighborhood_id and n.is_published))
  or (category_id is not null and exists(select 1 from public.categories c where c.id=category_id and c.is_enabled))
);
alter policy member_image_assignment_read on public.place_image_assignments using(
  (select public.is_nagi_admin()) or
  (entry_id is not null and exists(select 1 from public.entries e where e.id=entry_id and e.published))
  or (country_id is not null and exists(select 1 from public.countries c where c.id=country_id and c.is_published))
  or (city_id is not null and exists(select 1 from public.cities c where c.id=city_id and c.is_published))
  or (neighborhood_id is not null and exists(select 1 from public.neighborhoods n where n.id=neighborhood_id and n.is_published))
  or (category_id is not null and exists(select 1 from public.categories c where c.id=category_id and c.is_enabled))
  or (trip_id is not null and public.can_read_image_visit(trip_id,visit_id))
  -- A global Mapbox choice is returned through the authorized resolver, not a public table scan.
);

create function public.reserve_image_discovery(p_actor uuid,p_key text,p_query_hash text,
 p_pages integer default 5,p_total_pages integer default 50,p_concurrent integer default 2,
 p_global_day integer default 200,p_user_day integer default 30,p_user_minute integer default 6,
 p_continue boolean default false,p_refresh boolean default false,p_refresh_seconds integer default 900)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.image_galleries; token uuid:=gen_random_uuid();
 day_at timestamptz:=date_trunc('day',now()); minute_at timestamptz:=date_trunc('minute',now()); blocked timestamptz; n integer;
begin
 if p_actor is null or p_key !~ '^[a-f0-9]{64}$' or p_query_hash !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from public.profiles where id=p_actor)
  or least(p_pages,p_total_pages,p_concurrent,p_global_day,p_user_day,p_user_minute,p_refresh_seconds)<1
  or p_pages>50 or p_total_pages>100 or p_concurrent>20 then raise exception 'image_discovery_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(743191738);
 select * into g from public.image_galleries where cache_key=p_key for update;
 if not found then raise exception 'image_gallery_missing' using errcode='22023'; end if;
 select max(window_at) into blocked from private.image_resolver_usage where bucket='serper:blocked';
 if blocked>now() then return jsonb_build_object('state','limited','reason','rate_limit','retryAt',blocked); end if;
 if g.lease_until>now() then return jsonb_build_object('state','indexing'); end if;
 if g.query_hash is null then g.page_limit:=least(p_pages,p_total_pages); end if;
 if p_refresh then
   if g.searched_at>now()-make_interval(secs=>p_refresh_seconds) then
    return jsonb_build_object('state','limited','reason','refresh_cooldown','retryAt',g.searched_at+make_interval(secs=>p_refresh_seconds)); end if;
   g.next_page:=1;g.query_index:=0;g.pages:=0;g.page_limit:=p_pages;g.state:='idle';g.query_hash:=p_query_hash;
 elsif g.query_hash is not null and g.query_hash<>p_query_hash then
   return jsonb_build_object('state','limited','reason','context_changed');
 elsif g.state='complete' then return jsonb_build_object('state','complete');
 elsif g.next_retry_at>now() then return jsonb_build_object('state',g.state,'reason',g.stop_reason,'retryAt',g.next_retry_at);
 end if;
 if g.pages>=p_total_pages then return jsonb_build_object('state','limited','reason','technical_limit'); end if;
 if g.pages>=g.page_limit then
   if not p_continue then return jsonb_build_object('state','limited','reason','page_limit'); end if;
   g.page_limit:=least(g.pages+p_pages,p_total_pages);
 end if;
 if (select count(*) from public.image_galleries where lease_until>now())>=p_concurrent then return jsonb_build_object('state','indexing'); end if;
 if coalesce((select calls from private.image_resolver_usage where bucket='serper:global:day' and window_at=day_at),0)>=p_global_day
  or coalesce((select calls from private.image_resolver_usage where bucket='serper:'||p_actor::text||':day' and window_at=day_at),0)>=p_user_day
  or coalesce((select calls from private.image_resolver_usage where bucket='serper:'||p_actor::text||':minute' and window_at=minute_at),0)>=p_user_minute then
   return jsonb_build_object('state','limited','reason','budget'); end if;
 insert into private.image_resolver_usage values('serper:global:day',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1;
 insert into private.image_resolver_usage values('serper:'||p_actor::text||':day',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1;
 insert into private.image_resolver_usage values('serper:'||p_actor::text||':minute',minute_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1;
 update public.image_galleries set next_page=g.next_page,query_index=g.query_index,pages=g.pages,page_limit=g.page_limit,
  query_hash=p_query_hash,state='indexing',stop_reason=null,lease_id=token,lease_until=now()+interval '45 seconds',
  searched_at=case when g.pages=0 then now() else searched_at end,next_retry_at=null,updated_at=now() where cache_key=p_key;
 return jsonb_build_object('state','indexing','lease',token,'page',g.next_page,'variant',g.query_index);
end $$;
revoke execute on function public.reserve_image_discovery(uuid,text,text,integer,integer,integer,integer,integer,integer,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function public.reserve_image_discovery(uuid,text,text,integer,integer,integer,integer,integer,integer,boolean,boolean,integer) to service_role;

create function public.finish_image_discovery(p_key text,p_lease uuid,p_items jsonb default '[]',p_credits numeric default 0,
 p_error text default null,p_retry integer default 60,p_variant_count integer default 1)
returns boolean language plpgsql security definer set search_path='' as $$
declare g public.image_galleries; item jsonb; added integer:=0; existing boolean; total integer; next_state text; reason text;
begin
 select * into g from public.image_galleries where cache_key=p_key and lease_id=p_lease for update;
 if not found then return false; end if;
 if p_error is not null then
   if p_error='rate_limit' then
    insert into private.image_resolver_usage values('serper:blocked',now()+make_interval(secs=>greatest(60,least(p_retry,86400))),0) on conflict do nothing;
   end if;
   update public.image_galleries set state=case when p_error='canceled' then 'more' else 'unavailable' end,
    stop_reason=p_error,next_retry_at=case when p_error='canceled' then null else now()+make_interval(secs=>greatest(60,least(p_retry,86400))) end,
    lease_id=null,lease_until=null,updated_at=now() where cache_key=p_key;
   return true;
 end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 or p_credits<0 then raise exception 'image_candidates_invalid' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
   select exists(select 1 from public.image_candidates where gallery_key=p_key and url_key=item->>'urlKey') into existing;
   insert into public.image_candidates(id,gallery_key,url_key,title,metadata,additional_sources,relevance)
    values((item->>'id')::uuid,p_key,item->>'urlKey',coalesce(item->'metadata'->>'title',''),item->'metadata',coalesce(item->'sources','[]'),coalesce((item->>'rank')::integer,0))
    on conflict(gallery_key,url_key) do update set
      metadata=image_candidates.metadata||excluded.metadata,title=excluded.title,
      relevance=greatest(image_candidates.relevance,excluded.relevance),
      additional_sources=(select coalesce(jsonb_agg(distinct value),'[]') from jsonb_array_elements(image_candidates.additional_sources||excluded.additional_sources)),updated_at=now();
   if not existing then added:=added+1; end if;
 end loop;
 select count(*) into total from public.image_candidates where gallery_key=p_key;
 if added=0 and total=0 and g.query_index+1<least(3,p_variant_count) then
   g.query_index:=g.query_index+1;g.next_page:=0;next_state:='more';reason:='language_variant';
 elsif added=0 then next_state:='complete';reason:=case when jsonb_array_length(p_items)=0 then 'exhausted' else 'duplicates' end;
 elsif g.pages+1>=g.page_limit then next_state:='limited';reason:='page_limit';
 else next_state:='more';reason:=null; end if;
 update public.image_galleries set next_page=g.next_page+1,query_index=g.query_index,pages=g.pages+1,
  state=next_state,stop_reason=reason,credits=credits+p_credits,
  next_retry_at=case when next_state='complete' and total=0 then now()+interval '1 day' else null end,
  lease_id=null,lease_until=null,updated_at=now() where cache_key=p_key;
 return true;
end $$;
revoke execute on function public.finish_image_discovery(text,uuid,jsonb,numeric,text,integer,integer) from public,anon,authenticated;
grant execute on function public.finish_image_discovery(text,uuid,jsonb,numeric,text,integer,integer) to service_role;

create function public.review_image_candidate(p_id uuid,p_status text,p_creator text default '',p_license text default '',
 p_license_url text default '',p_evidence text default '',p_excluded boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare c public.image_candidates; publication jsonb; author text; assignment record;
begin
 if auth.uid() is null or not public.is_nagi_admin() then raise exception 'image_forbidden' using errcode='42501'; end if;
 if p_status not in ('unknown','open_license','permission_granted','restricted','rejected') or length(p_evidence)>2000
  or length(p_creator)>500 or length(p_license)>150 or length(p_license_url)>4096 then raise exception 'image_rights_invalid' using errcode='22023'; end if;
 select * into c from public.image_candidates where id=p_id for update;
 if not found then raise exception 'image_candidate_missing' using errcode='22023'; end if;
 if p_status in ('open_license','permission_granted') and (length(btrim(p_evidence))<5 or c.metadata->>'link' not like 'https://%') then
  raise exception 'image_rights_evidence_required' using errcode='22023'; end if;
 if p_status='open_license' and (p_license !~ '^(CC0|Public domain|CC BY(-SA)?( [1-4]\.[0-9])?)$' or p_license_url not like 'https://creativecommons.org/%'
   or (p_license like 'CC BY%' and length(btrim(p_creator))=0)) then
  raise exception 'image_license_required' using errcode='22023'; end if;
 update public.image_candidates set rights_status=p_status,photo_id=null,creator=nullif(p_creator,''),license=nullif(p_license,''),license_url=nullif(p_license_url,''),
  rights_evidence=nullif(p_evidence,''),reviewed_by=auth.uid(),verified_at=now(),is_excluded=p_excluded,updated_at=now() where id=p_id;
 if p_status in ('open_license','permission_granted') and not p_excluded and c.availability_status<>'unavailable' then
   publication:=jsonb_strip_nulls(jsonb_build_object(
    'id',c.id,'provider','serper','sourceId','serper:'||c.url_key,'sourceUrl',c.metadata->>'link',
    'imageUrl',c.metadata->>'imageUrl','thumbnailUrl',coalesce(c.metadata->>'thumbnailUrl',c.metadata->>'imageUrl'),
    'previewUrl',c.metadata->>'imageUrl','title',c.title,'creator',nullif(p_creator,''),'license',nullif(p_license,''),'licenseUrl',nullif(p_license_url,''),
    'width',c.metadata->'imageWidth','height',c.metadata->'imageHeight',
    'usageRights',case when p_status='open_license' then 'open' else 'permission-granted' end,'rightsStatus',p_status,
    'attribution',concat_ws(' · ',nullif(c.title,''),nullif(p_creator,''),nullif(p_license,''),c.metadata->>'source'),'verifiedAt',now()));
   insert into public.external_images(id,provider,source_id,metadata,available,verified_at)
    values(c.id,'serper','serper:'||c.id::text,publication,true,now())
    on conflict(id) do update set metadata=excluded.metadata,available=true,verified_at=now();
 else update public.external_images set available=false where id=c.id and provider='serper'; end if;
 for assignment in select trip_id,visit_id from public.place_image_assignments where image_id=c.id and trip_id is not null loop
   perform realtime.send(jsonb_build_object('visit',assignment.visit_id),'image_changed','trip:'||assignment.trip_id::text,true);
 end loop;
end $$;
revoke execute on function public.review_image_candidate(uuid,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.review_image_candidate(uuid,text,text,text,text,text,boolean) to authenticated;

create function public.set_catalog_image(p_key text,p_mode text default 'automatic',p_image uuid default null,p_revision integer default 0)
returns integer language plpgsql security definer set search_path='' as $$
declare g public.image_galleries; a public.place_image_assignments; next_revision integer; target uuid;
begin
 if auth.uid() is null or not public.is_nagi_admin() then raise exception 'image_forbidden' using errcode='42501'; end if;
 select * into g from public.image_galleries where cache_key=p_key;
 if not found or g.place_source='custom' then raise exception 'image_target_invalid' using errcode='22023'; end if;
 if p_mode not in ('automatic','manual','fallback') or p_revision<0 or (p_mode='manual' and p_image is null) or (p_mode<>'manual' and p_image is not null) then raise exception 'image_mode_invalid' using errcode='22023'; end if;
 if p_image is not null and not exists(select 1 from public.external_images where id=p_image and available and (provider='serper' or verified_at>now()-interval '30 days')) then raise exception 'image_unavailable' using errcode='22023'; end if;
 if g.place_source='nagi' then target:=g.place_id::uuid; end if;
 perform pg_advisory_xact_lock(hashtextextended('catalog-image:'||p_key,0));
 select * into a from public.place_image_assignments where
  (g.place_source='mapbox' and gallery_key=p_key) or
  (g.place_source='nagi' and ((g.place_kind='entry' and entry_id=target) or (g.place_kind='country' and country_id=target)
   or (g.place_kind='city' and city_id=target) or (g.place_kind='neighborhood' and neighborhood_id=target) or (g.place_kind='category' and category_id=target))) for update;
 if coalesce(a.revision,0)<>p_revision then raise exception 'image_conflict' using errcode='40001'; end if;
 next_revision:=coalesce(a.revision,0)+1;
 if a.id is null then
  insert into public.place_image_assignments(entry_id,country_id,city_id,neighborhood_id,category_id,gallery_key,mode,image_id,assigned_by,revision)
   values(case when g.place_kind='entry' and g.place_source='nagi' then target end,
    case when g.place_kind='country' then target end,case when g.place_kind='city' then target end,
    case when g.place_kind='neighborhood' then target end,case when g.place_kind='category' then target end,
    case when g.place_source='mapbox' then p_key end,p_mode,p_image,auth.uid(),next_revision);
 else update public.place_image_assignments set mode=p_mode,image_id=p_image,assigned_by=auth.uid(),revision=next_revision,updated_at=now() where id=a.id; end if;
 return next_revision;
end $$;
revoke execute on function public.set_catalog_image(text,text,uuid,integer) from public,anon;
grant execute on function public.set_catalog_image(text,text,uuid,integer) to authenticated;

create function private.reset_destination_cover_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cover_image_url is distinct from old.cover_image_url then
  delete from public.place_image_assignments where
   (tg_table_name='countries' and country_id=new.id) or (tg_table_name='cities' and city_id=new.id) or (tg_table_name='neighborhoods' and neighborhood_id=new.id);
 end if;return new;
end $$;
revoke execute on function private.reset_destination_cover_image() from public,anon,authenticated;
create trigger reset_country_photo after update of cover_image_url on public.countries for each row execute function private.reset_destination_cover_image();
create trigger reset_city_photo after update of cover_image_url on public.cities for each row execute function private.reset_destination_cover_image();
create trigger reset_neighborhood_photo after update of cover_image_url on public.neighborhoods for each row execute function private.reset_destination_cover_image();

-- Reuse occurrence selection and its Discord checks for reviewed Serper photos.
create or replace function public.set_place_image(p_entry uuid default null,p_trip uuid default null,p_visit uuid default null,p_mode text default 'automatic',p_image uuid default null,p_revision integer default 0) returns integer
language plpgsql security definer set search_path='' as $$
declare current_row public.place_image_assignments; target uuid; next_revision integer;
begin
 if auth.uid() is null then raise exception 'image_forbidden' using errcode='42501'; end if;
 if p_entry is not null and p_trip is null and p_visit is null then
   if not public.is_nagi_admin() or not exists(select 1 from public.entries where id=p_entry) then raise exception 'image_forbidden' using errcode='42501'; end if;
 elsif p_entry is null and p_trip is not null and p_visit is not null then
   if not public.can_read_image_visit(p_trip,p_visit) or not public.can_edit_guild_trip(p_trip) then raise exception 'image_forbidden' using errcode='42501'; end if;
 else raise exception 'image_target_invalid' using errcode='22023'; end if;
 if p_mode is null or p_revision is null or p_revision<0 or p_mode not in ('automatic','manual','fallback') or (p_mode='manual' and p_image is null) or (p_mode<>'manual' and p_image is not null) then raise exception 'image_mode_invalid' using errcode='22023'; end if;
 if p_image is not null and not exists(select 1 from public.external_images where id=p_image and available and (provider='serper' or verified_at>now()-interval '30 days')) then raise exception 'image_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_entry::text,p_trip::text||':'||p_visit::text),0));
 select * into current_row from public.place_image_assignments where entry_id=p_entry or (trip_id=p_trip and visit_id=p_visit) for update;
 if coalesce(current_row.revision,0)<>p_revision then raise exception 'image_conflict' using errcode='40001'; end if;
 next_revision:=coalesce(current_row.revision,0)+1;
 if current_row.id is null then
   insert into public.place_image_assignments(entry_id,trip_id,visit_id,mode,image_id,assigned_by,revision) values(p_entry,p_trip,p_visit,p_mode,p_image,auth.uid(),next_revision);
 else update public.place_image_assignments set mode=p_mode,image_id=p_image,assigned_by=auth.uid(),revision=next_revision,updated_at=now() where id=current_row.id;
 end if;
 return next_revision;
end $$;
