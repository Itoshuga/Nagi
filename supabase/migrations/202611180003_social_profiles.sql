-- Social identity stays separate from Discord-owned profile columns.
create table public.profile_customizations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_title text not null default '' check (length(profile_title)<=40),
  bio text not null default '' check (length(bio)<=280),
  accent text not null default '#73a6df' check (accent in ('#73a6df','#4f8bab','#638872','#ce8fa9','#9385ba','#c98c64','#b6a385','#7d899a')),
  banner_path text check (banner_path is null or banner_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  banner_x smallint not null default 50 check (banner_x between 0 and 100),
  banner_y smallint not null default 50 check (banner_y between 0 and 100),
  dream_country_id uuid references public.countries(id) on delete set null,
  dream_city_id uuid references public.cities(id) on delete set null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check (dream_city_id is null or dream_country_id is not null),
  check (banner_path is null or split_part(banner_path,'/',1)=user_id::text)
);
alter table public.profile_customizations enable row level security;
revoke all on public.profile_customizations from public,anon,authenticated;
grant select on public.profile_customizations to authenticated;
grant all on public.profile_customizations to service_role;
create policy customization_own_read on public.profile_customizations for select to authenticated using(user_id=auth.uid());

-- Keep dreams coherent when catalogue destinations are deleted or a city is moved.
create function private.check_profile_destination() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.dream_country_id is null then new.dream_city_id:=null;
 elsif new.dream_city_id is not null and not exists(select 1 from public.cities where id=new.dream_city_id and country_id=new.dream_country_id)
 then raise exception 'profile_destination' using errcode='23514'; end if;
 return new;
end $$;
revoke execute on function private.check_profile_destination() from public,anon,authenticated;
create trigger profile_destination_coherence before insert or update of dream_country_id,dream_city_id on public.profile_customizations
for each row execute function private.check_profile_destination();
create function private.profile_dream_city_moved() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.country_id is distinct from old.country_id then
   update public.profile_customizations set dream_country_id=new.country_id,revision=revision+1,updated_at=now() where dream_city_id=new.id;
 end if;
 return new;
end $$;
revoke execute on function private.profile_dream_city_moved() from public,anon,authenticated;
create trigger profile_dream_city_moved after update of country_id on public.cities for each row execute function private.profile_dream_city_moved();

create table private.profile_aliases (
  handle text not null, user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(handle,user_id)
);
create index profile_username_lookup on public.profiles(lower(username));
create index trip_organizer_social_lookup on public.trip_organizers(user_id,trip_id);
create table public.profile_banner_garbage (
  path text primary key, not_before timestamptz not null default now()
);
alter table public.profile_banner_garbage enable row level security;
revoke all on public.profile_banner_garbage from public,anon,authenticated;
grant all on public.profile_banner_garbage to service_role;

create function private.social_identity_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.profile_customizations(user_id) values(new.id);
  elsif lower(old.username)<>lower(new.username) then
    insert into private.profile_aliases(handle,user_id) values(lower(old.username),new.id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function private.social_identity_changed() from public,anon,authenticated;
create trigger social_identity_insert after insert on public.profiles for each row execute function private.social_identity_changed();
create trigger social_identity_rename after update of username on public.profiles for each row execute function private.social_identity_changed();
insert into public.profile_customizations(user_id) select id from public.profiles;

create function private.profile_banner_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.banner_path is not null then insert into public.profile_banner_garbage(path) values(old.banner_path) on conflict do nothing; end if;
    return old;
  end if;
  if new.banner_path is distinct from old.banner_path then
    if old.banner_path is not null then insert into public.profile_banner_garbage(path) values(old.banner_path) on conflict do nothing; end if;
    delete from public.profile_banner_garbage where path=new.banner_path;
  end if;
  return new;
end $$;
revoke execute on function private.profile_banner_changed() from public,anon,authenticated;
create trigger profile_banner_cleanup after update or delete on public.profile_customizations for each row execute function private.profile_banner_changed();

create function private.social_common_guild(p_viewer uuid,p_target uuid,p_app text,p_guild text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.guild_memberships a join private.guild_memberships b on b.guild_id=a.guild_id
 join public.discord_guilds g on g.id=a.guild_id where a.user_id=p_viewer and b.user_id=p_target
 and a.guild_id=p_guild and a.expires_at>now() and b.expires_at>now()
 and g.application_id=p_app and g.bot_present and g.last_synced_at>now()-interval '120 seconds')
$$;
revoke execute on function private.social_common_guild(uuid,uuid,text,text) from public,anon,authenticated;

create function public.resolve_social_profile(p_handle text) returns jsonb
language sql stable security definer set search_path='' as $$
 with current_profile as (select id,username,discord_synced_at from public.profiles where lower(username)=lower(p_handle)),
 candidate as (
   select * from current_profile
   union all select p.id,p.username,p.discord_synced_at from private.profile_aliases a join public.profiles p on p.id=a.user_id
   where a.handle=lower(p_handle) and not exists(select 1 from current_profile)
 ) select case when count(*)=1 then jsonb_agg(to_jsonb(candidate))->0 else null end from candidate
$$;

create function public.read_social_profile(p_viewer uuid,p_target uuid,p_app text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; common_guilds jsonb;
begin
  if p_viewer is null or p_target is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'icon_url',g.icon_url) order by g.name),'[]')
  into common_guilds from private.guild_memberships a
  join private.guild_memberships b on b.guild_id=a.guild_id and b.user_id=p_target
  join public.discord_guilds g on g.id=a.guild_id
  where a.user_id=p_viewer and a.expires_at>now() and b.expires_at>now()
  and g.application_id=p_app and g.bot_present and g.last_synced_at>now()-interval '120 seconds';
  if p_viewer<>p_target and jsonb_array_length(common_guilds)=0 then return null; end if;
  select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
    'created_at',p.created_at,'customization',to_jsonb(c)-'user_id', 'common_guilds',common_guilds,
    'dream',case when country.is_published and (c.dream_city_id is null or city.is_published) then
      jsonb_build_object('country_id',country.id,'country',country.name,'country_slug',country.slug,'iso_code',country.iso_code,
        'city_id',city.id,'city',city.name,'city_slug',city.slug,'cover',coalesce(city.cover_image_url,country.cover_image_url)) else null end,
    'organized_count',(select count(*) from public.trips t join public.trip_organizers o on o.trip_id=t.id
      where o.user_id=p.id and private.social_common_guild(p_viewer,p_target,p_app,t.guild_id))) into result
  from public.profiles p join public.profile_customizations c on c.user_id=p.id
  left join public.countries country on country.id=c.dream_country_id
  left join public.cities city on city.id=c.dream_city_id and city.country_id=c.dream_country_id
  where p.id=p_target;
  return result;
end $$;

create function public.social_profile_trips(p_viewer uuid,p_target uuid,p_app text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.read_social_profile(p_viewer,p_target,p_app) is null then return '[]'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from (
   select t.id,t.guild_id,t.title,t.cover_image_url,t.start_date,t.end_date,t.status,
     case when c.is_published then c.name else null end as destination
   from public.trips t join public.trip_organizers o on o.trip_id=t.id left join public.countries c on c.id=t.destination_country_id
   where o.user_id=p_target and private.social_common_guild(p_viewer,p_target,p_app,t.guild_id)
   order by t.created_at desc,t.id offset greatest(0,p_offset) limit 12
 ) rows);
end $$;

-- Mutation RPCs are exclusively called by the validated, authenticated server layer.
create function public.save_social_customization(p_user uuid,p_revision integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare current public.profile_customizations; country uuid := nullif(p_data->>'dream_country_id','')::uuid;
 city uuid := nullif(p_data->>'dream_city_id','')::uuid;
begin
 select * into current from public.profile_customizations where user_id=p_user for update;
 if not found or current.revision<>p_revision then raise exception 'profile_conflict' using errcode='40001'; end if;
 if country is not null and not exists(select 1 from public.countries where id=country and is_published) then raise exception 'profile_destination' using errcode='23514'; end if;
 if city is not null and not exists(select 1 from public.cities where id=city and country_id=country and is_published) then raise exception 'profile_destination' using errcode='23514'; end if;
 update public.profile_customizations set profile_title=coalesce(p_data->>'profile_title',''),bio=coalesce(p_data->>'bio',''),
   accent=p_data->>'accent', banner_path=nullif(p_data->>'banner_path',''),banner_x=(p_data->>'banner_x')::smallint,banner_y=(p_data->>'banner_y')::smallint,
   dream_country_id=country,dream_city_id=city,revision=revision+1,updated_at=now() where user_id=p_user;
 return current.revision+1;
end $$;

create function public.refresh_social_identity(p_user uuid,p_discord text,p_profile jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.identities where user_id=p_user and provider='discord' and provider_id=p_discord)
 or not exists(select 1 from public.profiles where id=p_user and discord_id=p_discord) then raise exception 'Discord identity mismatch' using errcode='42501'; end if;
 update public.profiles set username=p_profile->>'username',global_name=p_profile->>'global_name',
 display_name=coalesce(nullif(p_profile->>'global_name',''),p_profile->>'username'),avatar_hash=p_profile->>'avatar',avatar_url=p_profile->>'avatar_url',
 banner_hash=p_profile->>'banner',banner_url=p_profile->>'banner_url',accent_color=(p_profile->>'accent_color')::integer,discord_synced_at=now() where id=p_user;
end $$;

-- Profile links for already-authorized travel surfaces; no private account columns.
create or replace function public.trip_author_card(p_trip_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url)
 from public.trips t join public.profiles p on p.id=t.created_by where t.id=p_trip_id and public.is_guild_member(t.guild_id)
$$;
create or replace function public.trip_organizer_cards(p_trip uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'discord_id',p.discord_id,'username',p.username,'name',p.display_name,'avatar',p.avatar_url) order by o.created_at,p.id),'[]')
 from public.trips t join public.trip_organizers o on o.trip_id=t.id join public.profiles p on p.id=o.user_id
 where t.id=p_trip and public.is_guild_member(t.guild_id)
$$;
create function public.trip_contributor_cards(p_trip uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url)),'[]')
 from public.profiles p where exists(select 1 from public.trips t where t.id=p_trip and public.is_guild_member(t.guild_id)
 and (p.id=t.created_by or exists(select 1 from public.trip_items i where i.trip_id=t.id and i.added_by=p.id)))
$$;
revoke execute on function public.trip_contributor_cards(uuid) from public,anon;
grant execute on function public.trip_contributor_cards(uuid) to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('resolve_social_profile','read_social_profile','social_profile_trips','save_social_customization','refresh_social_identity') loop
   execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-banners','profile-banners',false,5242880,array['image/webp']);
create policy profile_banners_server_only on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'profile-banners') with check(bucket_id<>'profile-banners');
