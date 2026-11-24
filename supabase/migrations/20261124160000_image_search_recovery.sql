-- Keep one small request per place while allowing explicit manual recovery.
-- The old pagination arguments remain accepted for older application instances.
create or replace function public.reserve_image_discovery(p_actor uuid,p_key text,p_query_hash text,
 p_pages integer default 1,p_total_pages integer default 1,p_concurrent integer default 1,
 p_global_day integer default 50,p_user_day integer default 20,p_user_minute integer default 6,
 p_continue boolean default false,p_refresh boolean default false,p_refresh_seconds integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.image_galleries; token uuid:=gen_random_uuid();
 day_at timestamptz:=date_trunc('day',now()); minute_at timestamptz:=date_trunc('minute',now()); blocked timestamptz;
 refresh_seconds integer:=greatest(5,least(p_refresh_seconds,900));
 administrator boolean;
begin
 if p_actor is null or p_key !~ '^[a-f0-9]{64}$' or p_query_hash !~ '^[a-f0-9]{64}$'
  or not exists(select 1 from public.profiles where id=p_actor)
  or least(p_pages,p_total_pages,p_concurrent,p_global_day,p_user_day,p_user_minute,p_refresh_seconds)<1
  or p_concurrent>20 then raise exception 'image_discovery_invalid' using errcode='22023'; end if;
 select role in ('admin','owner') into administrator from public.profiles where id=p_actor;
 perform pg_advisory_xact_lock(743191738);
 select * into g from public.image_galleries where cache_key=p_key for update;
 if not found then raise exception 'image_gallery_missing' using errcode='22023'; end if;
 if g.lease_until>now() then return jsonb_build_object('state','indexing'); end if;
 if p_refresh then
  if g.searched_at>now()-make_interval(secs=>refresh_seconds) then
   return jsonb_build_object('state','limited','reason','refresh_cooldown','retryAt',g.searched_at+make_interval(secs=>refresh_seconds)); end if;
 elsif g.searched_at is not null or g.pages>0 or exists(select 1 from public.image_candidates where gallery_key=p_key) then
  -- Includes empty, interrupted and failed attempts: no automatic paid retry,
  -- alias query, continuation, or restart of a lease that has expired.
  return jsonb_build_object('state','complete','reason','cached');
 end if;
 select max(window_at) into blocked from private.image_resolver_usage where bucket='serper:blocked';
 if blocked>now() then return jsonb_build_object('state','limited','reason','rate_limit','retryAt',blocked); end if;
 if (select count(*) from public.image_galleries where lease_until>now())>=p_concurrent then return jsonb_build_object('state','indexing','reason','busy','retryAt',now()+interval '2 seconds'); end if;
 if coalesce((select calls from private.image_resolver_usage where bucket='serper:global:day' and window_at=day_at),0)>=p_global_day then
  return jsonb_build_object('state','limited','reason','global_daily_budget','retryAt',day_at+interval '1 day'); end if;
 -- Catalogue administrators use the shared global ceiling. Trip members also
 -- have a personal daily ceiling. Historical usage is never deleted or reset.
 if not administrator and coalesce((select calls from private.image_resolver_usage where bucket='serper:'||p_actor::text||':day' and window_at=day_at),0)>=p_user_day then
  return jsonb_build_object('state','limited','reason','user_daily_budget','retryAt',day_at+interval '1 day'); end if;
 if coalesce((select calls from private.image_resolver_usage where bucket='serper:'||p_actor::text||':minute' and window_at=minute_at),0)>=p_user_minute then
  return jsonb_build_object('state','limited','reason','user_minute_budget','retryAt',minute_at+interval '1 minute'); end if;
 insert into private.image_resolver_usage values('serper:global:day',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1;
 insert into private.image_resolver_usage values('serper:'||p_actor::text||':day',day_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1;
 insert into private.image_resolver_usage values('serper:'||p_actor::text||':minute',minute_at,1) on conflict(bucket,window_at) do update set calls=image_resolver_usage.calls+1;
 update public.image_galleries set next_page=1,query_index=0,pages=0,page_limit=1,
  query_hash=p_query_hash,state='indexing',stop_reason=null,lease_id=token,lease_until=now()+interval '45 seconds',
  searched_at=now(),next_retry_at=null,updated_at=now() where cache_key=p_key;
 return jsonb_build_object('state','indexing','lease',token,'page',1,'variant',0);
end $$;
revoke execute on function public.reserve_image_discovery(uuid,text,text,integer,integer,integer,integer,integer,integer,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function public.reserve_image_discovery(uuid,text,text,integer,integer,integer,integer,integer,integer,boolean,boolean,integer) to service_role;

-- These old empty rows never made a provider request. Let the corrected
-- reservation check evaluate their current quota rather than freezing the UI.
update public.image_galleries set state='idle',stop_reason=null,next_retry_at=null,updated_at=now()
 where searched_at is null and pages=0 and state='limited' and stop_reason='budget';
