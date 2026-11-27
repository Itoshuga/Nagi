-- Only operational counters: no Directions geometry or travel data is stored.
create function public.reserve_mapbox_directions(
  p_actor uuid, p_user_daily integer, p_global_daily integer, p_user_minute integer
) returns void language plpgsql security definer set search_path='' as $$
declare
  day_ref timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  minute_ref timestamptz:=date_trunc('minute',now());
  second_ref timestamptz:=date_trunc('second',now());
  month_ref timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  s text; b timestamptz; subject_ref text;
begin
  perform 1 from private.mapbox_settings where singleton and enabled for update;
  if not found then raise exception 'mapbox_disabled' using errcode='P0001'; end if;
  if p_actor is null or p_user_daily is null or p_global_daily is null or p_user_minute is null or least(p_user_daily,p_global_daily,p_user_minute)<1 then
    raise exception 'mapbox_invalid' using errcode='22023';
  end if;
  if coalesce((select sum(requests) from private.mapbox_usage where kind='directions' and scope='global_day' and bucket=day_ref),0)>=least(p_global_daily,100000)
    or coalesce((select sum(requests) from private.mapbox_usage where kind='directions' and scope='user_day' and subject=p_actor::text and bucket=day_ref),0)>=least(p_user_daily,10000)
    or coalesce((select sum(requests) from private.mapbox_usage where kind='directions' and scope='user_minute' and subject=p_actor::text and bucket=minute_ref),0)>=least(p_user_minute,60)
    or coalesce((select sum(requests) from private.mapbox_usage where scope='global_second' and bucket=second_ref),0)>=8
    or coalesce((select sum(requests) from private.mapbox_usage where kind='directions' and scope='global_second' and bucket>now()-interval '1 minute'),0)>=240
  then raise exception 'mapbox_quota' using errcode='P0001'; end if;
  foreach s in array array['global_day','global_second','global_month','user_day','user_minute'] loop
    b:=case s when 'global_day' then day_ref when 'user_day' then day_ref when 'global_month' then month_ref when 'global_second' then second_ref else minute_ref end;
    subject_ref:=case when s like 'global_%' then 'all' else p_actor::text end;
    insert into private.mapbox_usage(bucket,scope,subject,kind,requests,user_id)
      values(b,s,subject_ref,'directions',1,case when s like 'global_%' then null else p_actor end)
      on conflict(bucket,scope,subject,kind) do update set requests=private.mapbox_usage.requests+1;
  end loop;
  delete from private.mapbox_usage where (scope='global_second' and bucket<now()-interval '1 minute') or (scope='user_minute' and bucket<now()-interval '1 day') or bucket<now()-interval '62 days';
end $$;
revoke all on function public.reserve_mapbox_directions(uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_mapbox_directions(uuid,integer,integer,integer) to service_role;
