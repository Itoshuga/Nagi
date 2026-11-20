-- Event colors are values on occurrences, independent of personal palette entries.
alter table public.trip_items add column calendar_color text
  check(calendar_color is null or calendar_color ~ '^#[0-9A-F]{6}$');
alter table public.trip_item_stops add column calendar_color text
  check(calendar_color is null or calendar_color ~ '^#[0-9A-F]{6}$');

-- Existing nest/detach operations insert the destination before removing the
-- source. Preserve the occurrence color without changing their version rules.
create function private.copy_trip_calendar_color() returns trigger language plpgsql set search_path='' as $$
begin
  if new.calendar_color is not null then return new; end if;
  if tg_table_name='trip_items' then
    select s.calendar_color into new.calendar_color from public.trip_item_stops s
      join public.trip_items parent on parent.id=s.trip_item_id
      where s.id=new.id and s.entry_id=new.entry_id and parent.trip_id=new.trip_id;
  else
    select i.calendar_color into new.calendar_color from public.trip_items i
      join public.trip_items parent on parent.id=new.trip_item_id
      where i.id=new.id and i.entry_id=new.entry_id and i.trip_id=parent.trip_id;
  end if;
  return new;
end $$;
revoke execute on function private.copy_trip_calendar_color() from public,anon,authenticated;
create trigger copy_calendar_color before insert on public.trip_items
  for each row execute function private.copy_trip_calendar_color();
create trigger copy_calendar_color before insert on public.trip_item_stops
  for each row execute function private.copy_trip_calendar_color();

create table public.user_calendar_colors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  hex_color text not null check(hex_color ~ '^#[0-9A-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,hex_color)
);
create index user_calendar_colors_order_idx on public.user_calendar_colors(user_id,sort_order,id);
alter table public.user_calendar_colors enable row level security;
revoke all on public.user_calendar_colors from public,anon,authenticated;
grant select,delete on public.user_calendar_colors to authenticated;
grant all on public.user_calendar_colors to service_role;
create policy user_calendar_colors_read on public.user_calendar_colors for select to authenticated using(user_id=auth.uid());
create policy user_calendar_colors_remove on public.user_calendar_colors for delete to authenticated using(user_id=auth.uid());
create trigger touch_updated_at before update on public.user_calendar_colors
  for each row execute function public.touch_updated_at();

create function public.save_user_calendar_color(p_hex text) returns jsonb
  language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); color text:=upper(p_hex); saved public.user_calendar_colors;
begin
  if actor is null then raise exception 'calendar_palette_forbidden' using errcode='42501'; end if;
  if color is null or color !~ '^#[0-9A-F]{6}$' then raise exception 'calendar_color_invalid' using errcode='22023'; end if;
  -- One profile lock serializes the uniqueness and 32-color limit per account.
  perform 1 from public.profiles where id=actor for update;
  if not found then raise exception 'calendar_palette_forbidden' using errcode='42501'; end if;
  select * into saved from public.user_calendar_colors where user_id=actor and hex_color=color;
  if found then return jsonb_build_object('id',saved.id,'hex_color',saved.hex_color,'sort_order',saved.sort_order); end if;
  if (select count(*) from public.user_calendar_colors where user_id=actor)>=32 then
    raise exception 'calendar_palette_full' using errcode='22023';
  end if;
  insert into public.user_calendar_colors(user_id,hex_color,sort_order)
    select actor,color,coalesce(max(sort_order),0)+1 from public.user_calendar_colors where user_id=actor
    returning * into saved;
  return jsonb_build_object('id',saved.id,'hex_color',saved.hex_color,'sort_order',saved.sort_order);
end $$;
revoke execute on function public.save_user_calendar_color(text) from public,anon;
grant execute on function public.save_user_calendar_color(text) to authenticated;

alter function public.edit_trip_plan(text,uuid,integer,text,jsonb) set schema private;
alter function private.edit_trip_plan(text,uuid,integer,text,jsonb) rename to edit_trip_plan_before_colors;
revoke execute on function private.edit_trip_plan_before_colors(text,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;

create function public.edit_trip_plan(p_guild text,p_trip uuid,p_version integer,p_operation text,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare trip public.trips; item public.trip_items; color text:=upper(p_data->>'color'); revised integer;
begin
  if p_operation is distinct from 'color_item' then
    return private.edit_trip_plan_before_colors(p_guild,p_trip,p_version,p_operation,p_data);
  end if;
  if auth.uid() is null or not public.is_guild_member(p_guild) then raise exception 'trip_forbidden' using errcode='42501'; end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.can_edit_guild_trip(p_trip) or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501';
  end if;
  if p_version is distinct from trip.version then raise exception 'trip_conflict' using errcode='40001'; end if;
  select * into item from public.trip_items where id=(p_data->>'id')::uuid and trip_id=p_trip;
  if not found or item.version is distinct from (p_data->>'item_version')::integer then
    raise exception 'trip_conflict' using errcode='40001';
  end if;
  if not (p_data ? 'color') or (color is not null and color !~ '^#[0-9A-F]{6}$') then
    raise exception 'calendar_color_invalid' using errcode='22023';
  end if;
  if item.calendar_color is not distinct from color then return trip.version; end if;
  update public.trip_items set calendar_color=color where id=item.id;
  update public.trips set updated_at=now() where id=p_trip returning version into revised;
  return revised;
end $$;
revoke execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.edit_trip_plan(text,uuid,integer,text,jsonb) to authenticated;
