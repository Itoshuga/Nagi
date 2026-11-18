-- Evaluate request-constant identity checks once, preserving the existing predicates.
do $$
declare policy record; clauses text;
begin
  for policy in select * from pg_policies where schemaname='public' and policyname in
    ('profile_read','preferences_read','preferences_insert','preferences_update',
     'trip_create','item_insert','customization_own_read')
  loop
    clauses := '';
    if policy.qual is not null then
      clauses := clauses || format(' using (%s)', replace(replace(policy.qual,
        'auth.uid()', '(select auth.uid())'), 'public.is_nagi_admin()', '(select public.is_nagi_admin())'));
    end if;
    if policy.with_check is not null then
      clauses := clauses || format(' with check (%s)', replace(policy.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;
    execute format('alter policy %I on public.%I%s', policy.policyname, policy.tablename, clauses);
  end loop;
end $$;

-- Keep the same read union while avoiding two permissive SELECT policies per role.
do $$
declare item record; reader text; writer text; write_check text; read_qual text; action text;
begin
  for item in select * from (values
    ('categories','content_read','content_admin'),
    ('countries','content_read','content_admin'),
    ('cities','content_read','content_admin'),
    ('neighborhoods','content_read','content_admin'),
    ('entries','entries_read','entries_admin'),
    ('entry_relations','relations_read','relations_admin'),
    ('trip_days','day_read','day_write')
  ) as policies(table_name,read_name,write_name)
  loop
    select qual into reader from pg_policies where schemaname='public' and tablename=item.table_name and policyname=item.read_name;
    select qual,with_check into writer,write_check from pg_policies where schemaname='public' and tablename=item.table_name and policyname=item.write_name;
    read_qual := regexp_replace(format('(%s) or (%s)', reader, writer), '(public\.)?is_nagi_admin\(\)', '(select public.is_nagi_admin())', 'g');
    execute format('drop policy %I on public.%I', item.write_name, item.table_name);
    if item.table_name='trip_days' then
      execute format('alter policy %I on public.%I using (%s)', item.read_name, item.table_name, read_qual);
    else
      execute format('alter policy %I on public.%I to anon', item.read_name, item.table_name);
      execute format('create policy %I on public.%I for select to authenticated using (%s)', item.read_name || '_authenticated', item.table_name, read_qual);
    end if;
    foreach action in array array['insert','update','delete'] loop
      execute format('create policy %I on public.%I for %s to authenticated%s%s',
        item.write_name || '_' || action, item.table_name, action,
        case when action in ('update','delete') then format(' using (%s)',writer) else '' end,
        case when action in ('insert','update') then format(' with check (%s)',coalesce(write_check,writer)) else '' end);
    end loop;
  end loop;
end $$;

-- A minimal access predicate for banner requests and paginated journeys.
create function private.can_read_social_profile(p_viewer uuid,p_target uuid,p_app text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_viewer is not null and p_target is not null and (
    p_viewer=p_target or exists (
      select 1 from private.guild_memberships a
      join private.guild_memberships b on b.guild_id=a.guild_id and b.user_id=p_target
      join public.discord_guilds g on g.id=a.guild_id
      where a.user_id=p_viewer and a.expires_at>now() and b.expires_at>now()
      and g.application_id=p_app and g.bot_present and g.last_synced_at>now()-interval '120 seconds'
    )
  )
$$;
revoke execute on function private.can_read_social_profile(uuid,uuid,text) from public,anon,authenticated;

create function public.can_read_profile_banner(p_viewer uuid,p_target uuid,p_app text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.can_read_social_profile(p_viewer,p_target,p_app) and exists (
    select 1 from public.profile_customizations where user_id=p_target and banner_path=p_path
  )
$$;
revoke execute on function public.can_read_profile_banner(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.can_read_profile_banner(uuid,uuid,text,text) to service_role;

create or replace function public.social_profile_trips(p_viewer uuid,p_target uuid,p_app text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_read_social_profile(p_viewer,p_target,p_app) then return '[]'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from (
    select t.id,t.guild_id,t.title,t.cover_image_url,t.start_date,t.end_date,t.status,
      case when c.is_published then c.name else null end as destination
    from public.trips t join public.trip_organizers o on o.trip_id=t.id
    left join public.countries c on c.id=t.destination_country_id
    where o.user_id=p_target and private.social_common_guild(p_viewer,p_target,p_app,t.guild_id)
    order by t.created_at desc,t.id offset greatest(0,p_offset) limit 12
  ) rows);
end $$;
