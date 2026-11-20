-- Confirmed row deltas replace full-page invalidations. These tables are private;
-- definer RPCs are needed because ordinary clients cannot write planner tables.
-- Each entry point checks the verified guild membership and trip permissions.
create table private.trip_plan_events (
  trip_id uuid not null references public.trips(id) on delete cascade,
  version integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(trip_id,version)
);
create table private.trip_mutation_receipts (
  trip_id uuid not null references public.trips(id) on delete cascade,
  mutation_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  request_hash text not null,
  version integer not null,
  primary key(trip_id,mutation_id)
);
alter table private.trip_plan_events enable row level security;
alter table private.trip_mutation_receipts enable row level security;
revoke all on private.trip_plan_events,private.trip_mutation_receipts from public,anon,authenticated;

create function private.capture_trip_delta() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; trip_ref uuid; section text; buffer jsonb; changes jsonb; trip_key text; changed jsonb;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  section:=case tg_table_name when 'trip_items' then 'items' when 'trip_item_stops' then 'stops' else 'days' end;
  if section='stops' then
    select trip_id into trip_ref from public.trip_items where id=(row_data->>'trip_item_id')::uuid;
    -- Cascaded stop removals are already represented by the removed root.
    if trip_ref is null then return null; end if;
  else trip_ref:=(row_data->>'trip_id')::uuid; end if;
  trip_key:=trip_ref::text;
  buffer:=coalesce(nullif(current_setting('nagi.trip_delta',true),'')::jsonb,'{}'::jsonb);
  changes:=coalesce(buffer->trip_key,jsonb_build_object(
    'items',jsonb_build_object('upsert','{}'::jsonb,'patch','{}'::jsonb,'remove','{}'::jsonb),
    'stops',jsonb_build_object('upsert','{}'::jsonb,'patch','{}'::jsonb,'remove','{}'::jsonb),
    'days',jsonb_build_object('upsert','{}'::jsonb,'patch','{}'::jsonb,'remove','{}'::jsonb),'entries','{}'::jsonb));
  if tg_op='DELETE' then
    changes:=jsonb_set(changes,array[section,'upsert'],(changes#>array[section,'upsert'])-(row_data->>'id'));
    changes:=jsonb_set(changes,array[section,'patch'],(changes#>array[section,'patch'])-(row_data->>'id'));
    changes:=jsonb_set(changes,array[section,'remove',row_data->>'id'],'true'::jsonb);
  else
    changes:=jsonb_set(changes,array[section,'remove'],(changes#>array[section,'remove'])-(row_data->>'id'));
    if tg_op='INSERT' or (changes#>array[section,'upsert']) ? (row_data->>'id') then
      changes:=jsonb_set(changes,array[section,'upsert',row_data->>'id'],row_data);
    else
      select jsonb_object_agg(key,value) into changed from jsonb_each(row_data)
        where key='id' or value is distinct from to_jsonb(old)->key;
      changes:=jsonb_set(changes,array[section,'patch',row_data->>'id'],
        coalesce(changes#>array[section,'patch',row_data->>'id'],'{}'::jsonb)||changed);
    end if;
    if tg_op='INSERT' and section<>'days' then
      changes:=jsonb_set(changes,array['entries',row_data->>'entry_id'],'true'::jsonb);
    end if;
  end if;
  perform set_config('nagi.trip_delta',jsonb_set(buffer,array[trip_key],changes)::text,true);
  return null;
end $$;
revoke execute on function private.capture_trip_delta() from public,anon,authenticated,service_role;
create trigger capture_trip_delta after insert or update or delete on public.trip_items
  for each row execute function private.capture_trip_delta();
create trigger capture_trip_delta after insert or update or delete on public.trip_item_stops
  for each row execute function private.capture_trip_delta();
create trigger capture_trip_delta after insert or update or delete on public.trip_days
  for each row execute function private.capture_trip_delta();

create or replace function private.broadcast_trip_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare buffer jsonb; changes jsonb; delta jsonb:='{}'::jsonb; section text; payload jsonb; metadata jsonb;
begin
  if tg_op='DELETE' then
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
      perform realtime.send('{}'::jsonb,'refresh','trip:'||old.id,true);
    end if;
    return null;
  end if;
  buffer:=coalesce(nullif(current_setting('nagi.trip_delta',true),'')::jsonb,'{}'::jsonb);
  changes:=coalesce(buffer->new.id::text,'{}'::jsonb);
  foreach section in array array['items','stops','days'] loop
    delta:=jsonb_set(delta,array[section],jsonb_build_object(
      'upsert',coalesce((select jsonb_agg(value order by key) from jsonb_each(changes#>array[section,'upsert'])),'[]'::jsonb),
      'patch',coalesce((select jsonb_agg(value order by key) from jsonb_each(changes#>array[section,'patch'])),'[]'::jsonb),
      'remove',coalesce((select jsonb_agg(key order by key) from jsonb_each(changes#>array[section,'remove'])),'[]'::jsonb)));
  end loop;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into metadata from jsonb_each(to_jsonb(new))
    where key=any(array['title','description','cover_image_url','start_date','end_date','destination_country_id',
      'timezone','status','collaboration_mode','updated_at']) and value is distinct from to_jsonb(old)->key;
  payload:=jsonb_build_object('event_id',gen_random_uuid(),'mutation_id',
    nullif(current_setting('nagi.trip_mutation_id',true),'')::uuid,'trip_id',new.id,
    'previous_version',old.version,'version',new.version,'changes',delta||jsonb_build_object('trip',metadata),
    'entry_ids',coalesce((select jsonb_agg(key order by key) from jsonb_each(changes->'entries')),'[]'::jsonb));
  insert into private.trip_plan_events(trip_id,version,payload) values(new.id,new.version,payload);
  -- A bounded replay window; lifetime receipts still prevent duplicate writes.
  delete from private.trip_plan_events where trip_id=new.id and version<new.version-1000;
  perform set_config('nagi.trip_delta',(buffer-new.id::text)::text,true);
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    -- This remains an invalidation signal. HTTP/SSE reads the authorized journal;
    -- a client-supplied Broadcast is never treated as a persisted mutation.
    perform realtime.send('{}'::jsonb,'refresh','trip:'||new.id,true);
  end if;
  return null;
end $$;

create function public.read_trip_changes(p_guild text,p_trip uuid,p_after integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare trip public.trips; events jsonb; earliest integer;
begin
  if auth.uid() is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501'; end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for share;
  if not found then raise exception 'trip_missing' using errcode='42501'; end if;
  select min(version) into earliest from private.trip_plan_events where trip_id=p_trip;
  select coalesce(jsonb_agg(payload order by version),'[]'::jsonb) into events
    from private.trip_plan_events where trip_id=p_trip and version>p_after;
  return jsonb_build_object('version',trip.version,'events',events,
    'reset',p_after>trip.version or (p_after<trip.version and (earliest is null or earliest>p_after+1 or
      (select count(*) from private.trip_plan_events where trip_id=p_trip and version>p_after)<>trip.version-p_after)),
    'can_edit',public.can_edit_guild_trip(p_trip),'can_manage',public.is_trip_organizer(p_trip));
end $$;
revoke execute on function public.read_trip_changes(text,uuid,integer) from public,anon;
grant execute on function public.read_trip_changes(text,uuid,integer) to authenticated;

create function public.mutate_trip_plan(p_guild text,p_trip uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare trip public.trips; actor uuid:=auth.uid(); token uuid:=(p_request->>'id')::uuid;
  operation text:=p_request#>>'{change,operation}'; data jsonb:=p_request#>'{change,data}';
  expected jsonb:=p_request->'expected'; patch jsonb:=data->'patch';
  target uuid:=(data->>'id')::uuid; entry record; field record; actual jsonb; kind text;
  fingerprint text:=md5(p_request::text); receipt private.trip_mutation_receipts;
  revised integer; date_ref date; day_data jsonb; current_item public.trip_items;
begin
  if actor is null or token is null or not public.is_guild_member(p_guild) then
    raise exception 'trip_forbidden' using errcode='42501'; end if;
  select * into trip from public.trips where id=p_trip and guild_id=p_guild for update;
  if not found or not public.is_guild_member(p_guild) or not public.can_edit_guild_trip(p_trip) then
    raise exception 'trip_forbidden' using errcode='42501'; end if;
  select * into receipt from private.trip_mutation_receipts where trip_id=p_trip and mutation_id=token;
  if found then
    if receipt.user_id is distinct from actor or receipt.request_hash<>fingerprint then
      raise exception 'trip_mutation_mismatch' using errcode='22023'; end if;
    return public.read_trip_changes(p_guild,p_trip,(p_request->>'base')::integer);
  end if;
  if expected is null or jsonb_typeof(expected)<>'object' then
    raise exception 'trip_patch_invalid' using errcode='22023'; end if;
  foreach kind in array array['items','stops','days'] loop
    for entry in select key,value from jsonb_each(expected->kind) loop
      actual:=null;
      if kind='items' then select to_jsonb(i) into actual from public.trip_items i where i.id=entry.key::uuid and i.trip_id=p_trip;
      elsif kind='stops' then select to_jsonb(s) into actual from public.trip_item_stops s join public.trip_items i on i.id=s.trip_item_id where s.id=entry.key::uuid and i.trip_id=p_trip;
      else select to_jsonb(d) into actual from public.trip_days d where d.id=entry.key::uuid and d.trip_id=p_trip; end if;
      if actual is null then raise exception 'trip_conflict' using errcode='40001'; end if;
      for field in select key,value from jsonb_each(entry.value) loop
        if not (actual ? field.key) or actual->field.key is distinct from field.value then
          raise exception 'trip_conflict' using errcode='40001'; end if;
      end loop;
    end loop;
  end loop;
  perform set_config('nagi.trip_mutation_id',token::text,true);
  if operation in ('patch_item','patch_stop','patch_day') then
    kind:=case operation when 'patch_item' then 'items' when 'patch_stop' then 'stops' else 'days' end;
    if patch is null or patch='{}'::jsonb or jsonb_typeof(patch)<>'object' or
      not coalesce((expected#>array[kind,target::text]) ?& array(select jsonb_object_keys(patch)),false) then
      raise exception 'trip_patch_invalid' using errcode='22023'; end if;
    if operation='patch_item' then
      if patch-array['trip_day_id','start_time','end_time','estimated_duration_minutes','notes','calendar_color']<>'{}'::jsonb then
        raise exception 'trip_patch_invalid' using errcode='22023'; end if;
      select * into current_item from public.trip_items where id=target and trip_id=p_trip;
      if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
      update public.trip_items set
        trip_day_id=case when patch ? 'trip_day_id' then (patch->>'trip_day_id')::uuid else trip_day_id end,
        sort_order=case when patch ? 'trip_day_id' and trip_day_id is distinct from (patch->>'trip_day_id')::uuid
          then private.trip_item_position(p_trip,(patch->>'trip_day_id')::uuid,target,null) else sort_order end,
        start_time=case when patch ? 'start_time' then (patch->>'start_time')::time else start_time end,
        end_time=case when patch ? 'end_time' then (patch->>'end_time')::time else end_time end,
        estimated_duration_minutes=case when patch ? 'estimated_duration_minutes' then (patch->>'estimated_duration_minutes')::integer else estimated_duration_minutes end,
        notes=case when patch ? 'notes' then patch->>'notes' else notes end,
        calendar_color=case when patch ? 'calendar_color' then patch->>'calendar_color' else calendar_color end
        where id=target and trip_id=p_trip;
    elsif operation='patch_stop' then
      if patch-array['notes','duration_minutes']<>'{}'::jsonb then raise exception 'trip_patch_invalid' using errcode='22023'; end if;
      update public.trip_item_stops s set
        notes=case when patch ? 'notes' then patch->>'notes' else notes end,
        duration_minutes=case when patch ? 'duration_minutes' then (patch->>'duration_minutes')::integer else duration_minutes end
        where s.id=target and exists(select 1 from public.trip_items i where i.id=s.trip_item_id and i.trip_id=p_trip);
      if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    else
      if patch-array['title','date']<>'{}'::jsonb then raise exception 'trip_patch_invalid' using errcode='22023'; end if;
      date_ref:=(patch->>'date')::date;
      if date_ref is not null and ((trip.start_date is not null and date_ref<trip.start_date) or
        (trip.end_date is not null and date_ref>trip.end_date)) then raise exception 'trip_day_date' using errcode='22023'; end if;
      update public.trip_days set title=case when patch ? 'title' then patch->>'title' else title end,
        date=case when patch ? 'date' then date_ref else date end where id=target and trip_id=p_trip;
      if not found then raise exception 'trip_conflict' using errcode='40001'; end if;
    end if;
    update public.trips set updated_at=now() where id=p_trip returning version into revised;
  elsif operation='add_day' then
    date_ref:=(data->>'date')::date;
    if target is null or (date_ref is not null and ((trip.start_date is not null and date_ref<trip.start_date) or
      (trip.end_date is not null and date_ref>trip.end_date))) then raise exception 'trip_day_date' using errcode='22023'; end if;
    insert into public.trip_days(id,trip_id,day_number,date,title,sort_order)
      select target,p_trip,coalesce(max(day_number),0)+1,date_ref,coalesce(data->>'title',''),coalesce(max(sort_order),-1)+1
      from public.trip_days where trip_id=p_trip;
    update public.trips set updated_at=now() where id=p_trip returning version into revised;
  elsif operation='generate_days' then
    if trip.start_date is null or trip.end_date is null then raise exception 'trip_dates_required' using errcode='22023'; end if;
    for day_data in select value from jsonb_array_elements(data->'days') loop
      date_ref:=(day_data->>'date')::date;
      if date_ref<trip.start_date or date_ref>trip.end_date then raise exception 'trip_day_date' using errcode='22023'; end if;
      if not exists(select 1 from public.trip_days where trip_id=p_trip and date=date_ref) then
        insert into public.trip_days(id,trip_id,day_number,date,sort_order)
          select (day_data->>'id')::uuid,p_trip,coalesce(max(day_number),0)+1,date_ref,coalesce(max(sort_order),-1)+1 from public.trip_days where trip_id=p_trip;
      end if;
    end loop;
    update public.trips set updated_at=now() where id=p_trip returning version into revised;
  elsif operation=any(array['add_item','add_stop','move_item','delete_item','nest_item','relocate_stop',
    'move_stop','delete_stop','detach_stop','move_day','delete_day','sort_items','organizer_add','organizer_remove']) then
    revised:=public.edit_trip_plan(p_guild,p_trip,trip.version,operation,data);
  else raise exception 'trip_patch_invalid' using errcode='22023';
  end if;
  insert into private.trip_mutation_receipts(trip_id,mutation_id,user_id,request_hash,version)
    values(p_trip,token,actor,fingerprint,revised);
  perform set_config('nagi.trip_mutation_id','',true);
  return public.read_trip_changes(p_guild,p_trip,(p_request->>'base')::integer);
end $$;
revoke execute on function public.mutate_trip_plan(text,uuid,jsonb) from public,anon;
grant execute on function public.mutate_trip_plan(text,uuid,jsonb) to authenticated;
