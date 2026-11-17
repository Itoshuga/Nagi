alter type public.trip_status add value if not exists 'draft';
create type public.trip_collaboration_mode as enum ('all_members','organizers_only');

alter table public.trips
  add column destination_country_id uuid references public.countries(id) on delete set null,
  add column timezone text not null default 'UTC',
  add column collaboration_mode public.trip_collaboration_mode not null default 'all_members',
  add column version integer not null default 0;
create index trips_country_idx on public.trips(destination_country_id);
create index trips_status_idx on public.trips(guild_id,status,created_at desc);
alter table public.trips drop constraint trips_cover_image_url_check;
alter table public.trips add constraint trips_cover_image_url_check check (
  cover_image_url is null or (cover_image_url like 'https://%' and length(cover_image_url)<=2000)
  or cover_image_url ~ ('^/app/trip-cover/' || guild_id || '/' || id || '/[a-f0-9-]{36}$')
);

alter table public.trip_items
  add column start_time time without time zone,
  add column end_time time without time zone,
  add column estimated_duration_minutes integer check(estimated_duration_minutes between 1 and 1440),
  add column version integer not null default 0,
  add constraint trip_items_local_times check(end_time is null or (start_time is not null and end_time>start_time)),
  alter column sort_order type bigint,
  drop constraint trip_items_trip_day_id_trip_id_fkey;
alter table public.trip_items add constraint trip_items_trip_day_id_trip_id_fkey
  foreign key(trip_day_id,trip_id) references public.trip_days(id,trip_id) on delete set null (trip_day_id);
create index trip_items_lane_order_idx on public.trip_items(trip_id,trip_day_id,sort_order,id);
create index trip_days_date_idx on public.trip_days(trip_id,date) where date is not null;

create table public.trip_organizers (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(trip_id,user_id)
);
create index trip_organizers_user_idx on public.trip_organizers(user_id);
insert into public.trip_organizers(trip_id,user_id)
  select id,created_by from public.trips where created_by is not null;
alter table public.trip_organizers enable row level security;
revoke all on public.trip_organizers from public,anon,authenticated;
grant select on public.trip_organizers to authenticated;
grant all on public.trip_organizers to service_role;
create policy trip_organizers_read on public.trip_organizers for select to authenticated
  using (exists(select 1 from public.trips t where t.id=trip_id));

create table private.trip_add_requests (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null,
  entry_id uuid not null
);
create index trip_add_requests_trip_idx on private.trip_add_requests(trip_id);

create function public.is_trip_organizer(p_trip_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trips t join public.trip_organizers o on o.trip_id=t.id
    where t.id=p_trip_id and o.user_id=auth.uid() and public.is_guild_member(t.guild_id))
$$;
create or replace function public.can_edit_guild_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trips t where t.id=p_trip_id and public.is_guild_member(t.guild_id)
    and (t.collaboration_mode='all_members' or exists(select 1 from public.trip_organizers o
      where o.trip_id=t.id and o.user_id=auth.uid())))
$$;
revoke execute on function public.is_trip_organizer(uuid) from public,anon;
grant execute on function public.is_trip_organizer(uuid) to authenticated;

drop policy trip_update on public.trips;
create policy trip_update on public.trips for update to authenticated
  using (public.is_trip_organizer(id)) with check (public.is_trip_organizer(id));
drop policy trip_delete on public.trips;
create policy trip_delete on public.trips for delete to authenticated using (public.is_trip_organizer(id));
-- Multi-row planner mutations are serialized by the RPC below.
revoke delete on public.trips from authenticated;
revoke insert,delete on public.trip_days,public.trip_items from authenticated;
revoke update(day_number,date,title,sort_order) on public.trip_days from authenticated;
revoke update(trip_day_id,notes,sort_order) on public.trip_items from authenticated;

create function private.validate_trip() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from pg_timezone_names where name=new.timezone)
    or new.timezone not like '%/%' and new.timezone<>'UTC' then
    raise exception 'trip_timezone_invalid' using errcode='22023';
  end if;
  if (tg_op='INSERT' or new.destination_country_id is distinct from old.destination_country_id)
    and new.destination_country_id is not null and not exists (
      select 1 from public.countries where id=new.destination_country_id and is_published
    ) then raise exception 'trip_destination_unavailable' using errcode='22023'; end if;
  if auth.uid() is not null and (tg_op='INSERT' or new.cover_image_url is distinct from old.cover_image_url)
    and new.cover_image_url like 'https://%' then raise exception 'trip_cover_invalid' using errcode='22023'; end if;
  if tg_op='UPDATE' then new.version := old.version+1; end if;
  return new;
end $$;
create trigger validate_trip before insert or update on public.trips for each row execute function private.validate_trip();

create function private.fill_trip_days(p_trip uuid,p_start date,p_end date) returns void
language plpgsql set search_path='' as $$
declare number_base integer; order_base integer; first_missing date;
begin
  if p_start is null or p_end is null then
    raise exception 'trip_dates_required' using errcode='22023';
  end if;
  select coalesce(max(day_number),0),coalesce(max(sort_order),-1) into number_base,order_base
    from public.trip_days where trip_id=p_trip;
  select min(candidate.date) into first_missing
    from (
      select p_start as date
      union all
      select date+1 from public.trip_days where trip_id=p_trip and date>=p_start and date<p_end
    ) candidate where not exists (
      select 1 from public.trip_days d where d.trip_id=p_trip and d.date=candidate.date
    );
  if first_missing is null then return; end if;
  insert into public.trip_days(trip_id,day_number,date,sort_order)
    select p_trip,number_base+row_number() over(order by missing.date),missing.date,
      order_base+row_number() over(order by missing.date)
    from (
      select first_missing+i as date from generate_series(0,least(p_end-first_missing,365)) i
      where not exists(select 1 from public.trip_days d where d.trip_id=p_trip and d.date=first_missing+i)
    ) missing;
end $$;

create function private.initialize_trip() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.created_by is not null then
    insert into public.trip_organizers(trip_id,user_id) values (new.id,new.created_by);
  end if;
  if new.start_date is not null and new.end_date is not null then
    perform private.fill_trip_days(new.id,new.start_date,new.end_date);
  end if;
  return null;
end $$;
create trigger initialize_trip after insert on public.trips for each row execute function private.initialize_trip();
create function private.bump_trip_item_version() returns trigger language plpgsql set search_path='' as $$
begin new.version := old.version+1; return new; end $$;
create trigger bump_trip_item_version before update on public.trip_items
  for each row execute function private.bump_trip_item_version();

-- This predicate mirrors the ordinary catalog read policy for privileged planner writes.
create function private.visible_trip_entry(p_entry uuid) returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from public.entries e
    join public.categories c on c.id=e.category_id and c.is_enabled
    join public.countries p on p.id=e.country_id and p.is_published
    join public.cities city on city.id=e.city_id and city.is_published
    left join public.neighborhoods n on n.id=e.neighborhood_id and n.is_published
    where e.id=p_entry and e.published and city.has_neighborhoods=(e.neighborhood_id is not null)
      and (e.neighborhood_id is null or n.id is not null))
$$;

-- Reserve space between items. Only compact the destination when the gap has been used up.
create function private.trip_item_position(p_trip uuid,p_day uuid,p_item uuid,p_before uuid)
returns bigint language plpgsql set search_path='' as $$
declare previous bigint; following bigint; attempt integer;
begin
  if p_before is null then
    return coalesce((select max(sort_order) from public.trip_items
      where trip_id=p_trip and trip_day_id is not distinct from p_day and id is distinct from p_item),0)+1024;
  end if;
  for attempt in 1..2 loop
    select sort_order into following from public.trip_items where id=p_before and trip_id=p_trip
      and trip_day_id is not distinct from p_day and id is distinct from p_item;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    select coalesce(max(sort_order),-1) into previous from public.trip_items where trip_id=p_trip
      and trip_day_id is not distinct from p_day and id is distinct from p_item
      and (sort_order,id)<(following,p_before);
    if following-previous>1 then return previous+(following-previous)/2; end if;
    update public.trip_items item set sort_order=ordered.position
    from (select id,1024*row_number() over(order by sort_order,id) as position
      from public.trip_items where trip_id=p_trip and trip_day_id is not distinct from p_day
        and id is distinct from p_item) ordered
    where item.id=ordered.id and item.sort_order<>ordered.position;
  end loop;
  raise exception 'trip_conflict' using errcode='40001';
end $$;

create function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare trip public.trips;
  actor uuid := auth.uid();
  target uuid := (p_data->>'id')::uuid;
  day_id uuid := (p_data->>'day')::uuid;
  entry_ref uuid := (p_data->>'entry')::uuid;
  desired_date date := (p_data->>'date')::date;
  current_item public.trip_items;
  current_day public.trip_days;
  organizer uuid;
  next_order integer;
begin
  if actor is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  if p_operation in ('settings','delete_trip','organizer_add','organizer_remove') then
    if not public.is_trip_organizer(p_trip) then raise exception 'trip_forbidden' using errcode='42501'; end if;
  elsif not public.can_edit_guild_trip(p_trip) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;

  if p_operation='add_item' then
    if exists(select 1 from private.trip_add_requests where id=target and trip_id=p_trip
      and user_id=actor and entry_id=entry_ref) then return trip.version; end if;
    if not private.visible_trip_entry(entry_ref) then raise exception 'trip_entry_hidden' using errcode='22023'; end if;
  elsif p_version is distinct from trip.version then
    raise exception 'trip_conflict' using errcode='40001';
  end if;

  if p_operation in ('add_item','move_item','delete_day') and day_id is not null
    and not exists(select 1 from public.trip_days where trip_id=p_trip and id=day_id) then
    raise exception 'trip_day_missing' using errcode='22023';
  end if;
  if p_operation in ('edit_item','move_item','delete_item') then
    select * into current_item from public.trip_items where id=target and trip_id=p_trip;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
  end if;
  if p_operation in ('edit_day','move_day','delete_day') then
    select * into current_day from public.trip_days where id=target and trip_id=p_trip;
    if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
  end if;
  if p_operation in ('add_day','edit_day') and desired_date is not null and desired_date is distinct from current_day.date then
    if (trip.start_date is not null and desired_date<trip.start_date) or
      (trip.end_date is not null and desired_date>trip.end_date) or exists(select 1 from public.trip_days
        where trip_id=p_trip and date=desired_date and id is distinct from target) then
      raise exception 'trip_day_date' using errcode='22023';
    end if;
  end if;

  case p_operation
    when 'settings' then
      update public.trips set title=p_data->>'title',description=p_data->>'description',
        destination_country_id=(p_data->>'destination_country_id')::uuid,
        start_date=(p_data->>'start_date')::date,end_date=(p_data->>'end_date')::date,
        timezone=p_data->>'timezone',status=(p_data->>'status')::public.trip_status,
        collaboration_mode=(p_data->>'collaboration_mode')::public.trip_collaboration_mode,
        cover_image_url=case when p_data ? 'cover_image_url' then p_data->>'cover_image_url' else trip.cover_image_url end
      where id=p_trip returning version into next_order;
      return next_order;
    when 'delete_trip' then
      delete from public.trips where id=p_trip;
      return trip.version+1;
    when 'organizer_add' then
      select m.user_id into organizer from private.guild_memberships m join public.profiles p on p.id=m.user_id
        where m.guild_id=p_guild and m.expires_at>now() and p.discord_id=p_data->>'discord_id';
      if not found then raise exception 'trip_member_missing' using errcode='22023'; end if;
      insert into public.trip_organizers(trip_id,user_id) values(p_trip,organizer) on conflict do nothing;
    when 'organizer_remove' then
      if target=trip.created_by or (select count(*) from public.trip_organizers where trip_id=p_trip)<=1 then
        raise exception 'trip_organizer_required' using errcode='22023';
      end if;
      delete from public.trip_organizers where trip_id=p_trip and user_id=target;
    when 'generate_days' then
      perform private.fill_trip_days(p_trip,trip.start_date,trip.end_date);
    when 'add_day' then
      insert into public.trip_days(trip_id,day_number,date,title,sort_order)
        select p_trip,coalesce(max(day_number),0)+1,desired_date,coalesce(p_data->>'title',''),
          coalesce(max(sort_order),-1)+1 from public.trip_days where trip_id=p_trip;
    when 'edit_day' then
      update public.trip_days set date=desired_date,title=coalesce(p_data->>'title','') where id=target;
    when 'move_day' then
      if current_day.date is not null or trip.start_date is not null or trip.end_date is not null or
        p_data->>'direction' is null or p_data->>'direction' not in ('up','down') then
        raise exception 'trip_day_order' using errcode='22023';
      end if;
      with ordered as (
        select d.id,row_number() over (order by d.sort_order,d.day_number,d.id) as position
        from public.trip_days d where d.trip_id=p_trip
      ), place as (select position from ordered where id=target),
      pair as (select o.id,o.position,p.position as source from ordered o cross join place p
        where o.position=p.position+case when p_data->>'direction'='up' then -1 else 1 end)
      update public.trip_days d set sort_order=case
        when o.id=target then coalesce((select position from pair),o.position)
        when o.id=(select id from pair) then (select source from pair) else o.position end
      from ordered o where d.id=o.id;
    when 'delete_day' then
      if day_id=target then raise exception 'trip_day_missing' using errcode='22023'; end if;
      -- Keep the relative order and append the steps at their new destination.
      update public.trip_items item set trip_day_id=day_id,sort_order=ordered.position
      from (select id,row_number() over (order by sort_order,id)*1024+
        coalesce((select max(sort_order) from public.trip_items where trip_id=p_trip
          and trip_day_id is not distinct from day_id),0) as position
        from public.trip_items where trip_id=p_trip and trip_day_id=target) ordered
      where item.id=ordered.id;
      delete from public.trip_days where id=target;
    when 'add_item' then
      if not coalesce((p_data->>'repeat')::boolean,false) and exists(select 1 from public.trip_items
        where trip_id=p_trip and entry_id=entry_ref and trip_day_id is not distinct from day_id) then
        raise exception 'trip_duplicate' using errcode='P0001';
      end if;
      insert into private.trip_add_requests(id,trip_id,user_id,entry_id) values(target,p_trip,actor,entry_ref);
      insert into public.trip_items(id,trip_id,trip_day_id,entry_id,added_by,sort_order)
        values(target,p_trip,day_id,entry_ref,actor,private.trip_item_position(p_trip,day_id,null,null));
    when 'edit_item' then
      if current_item.version is distinct from (p_data->>'item_version')::integer then
        raise exception 'trip_conflict' using errcode='40001';
      end if;
      update public.trip_items set start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,
        estimated_duration_minutes=(p_data->>'duration')::integer,notes=coalesce(p_data->>'notes','') where id=target;
    when 'move_item' then
      update public.trip_items set trip_day_id=day_id,
        sort_order=private.trip_item_position(p_trip,day_id,target,(p_data->>'before')::uuid) where id=target;
    when 'delete_item' then
      delete from public.trip_items where id=target;
    else raise exception 'trip_operation_invalid' using errcode='22023';
  end case;
  update public.trips set updated_at=now() where id=p_trip returning version into next_order;
  return next_order;
end $$;
revoke execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) to authenticated;
revoke execute on function private.initialize_trip(),private.fill_trip_days(uuid,date,date),
  private.visible_trip_entry(uuid),private.trip_item_position(uuid,uuid,uuid,uuid) from public,anon,authenticated;

-- Guild contact cards use verified Nagi profiles and contain only presentation data.
create function public.trip_organizer_cards(p_trip uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'discord_id',p.discord_id,
    'name',p.display_name,'avatar',p.avatar_url) order by o.created_at,p.id),'[]')
  from public.trips t join public.trip_organizers o on o.trip_id=t.id join public.profiles p on p.id=o.user_id
  where t.id=p_trip and public.is_guild_member(t.guild_id)
$$;
revoke execute on function public.trip_organizer_cards(uuid) from public,anon;
grant execute on function public.trip_organizer_cards(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('trip-covers','trip-covers',false,8388608,array['image/webp']);
create policy trip_covers_server_only on storage.objects as restrictive for all to anon,authenticated
  using (bucket_id<>'trip-covers') with check (bucket_id<>'trip-covers');

-- Send an invalidation only. The client must read the new state through authorized queries.
create function private.broadcast_trip_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare request_trip uuid := case when tg_op='DELETE' then old.id else new.id end;
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    perform realtime.send('{}'::jsonb,'refresh','trip:' || request_trip,true);
  end if;
  return null;
end $$;
revoke execute on function private.broadcast_trip_revision() from public,anon,authenticated;
create trigger broadcast_trip_revision after update or delete on public.trips
  for each row execute function private.broadcast_trip_revision();
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$create policy nagi_trip_revisions on realtime.messages for select to authenticated
      using (extension='broadcast' and topic=realtime.topic() and exists(select 1 from public.trips
        where id=case when realtime.topic() ~ '^trip:[0-9a-f-]{36}$'
          then case when substring(realtime.topic(),6) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
            then substring(realtime.topic(),6)::uuid end end))$policy$;
    execute $policy$create policy nagi_trip_revisions_isolation on realtime.messages as restrictive for select to authenticated
      using (coalesce(topic,'') not like 'trip:%' or (topic=realtime.topic() and exists(select 1 from public.trips
        where id=case when substring(realtime.topic(),6) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
          then substring(realtime.topic(),6)::uuid end)))$policy$;
  end if;
end $$;
