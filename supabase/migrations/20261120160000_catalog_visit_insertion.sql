-- Catalogue entries are references; trip rows are independent visits. Keep all
-- membership, scope, row identity, receipt and topology checks. Only entry-based
-- duplicate restrictions are removed. Add positioning in the original INSERT,
-- so creation and its journal event remain one atomic optimistic mutation.
-- Use guarded replacements to retain the audited permission/idempotency bodies.
do $migration$
declare definition text; updated text; edit record;
begin
  for edit in select * from (values
    ('private.edit_trip_plan_roots(text,uuid,integer,text,jsonb)', $old$      if not coalesce((p_data->>'repeat')::boolean,false) and exists(select 1 from public.trip_items
        where trip_id=p_trip and entry_id=entry_ref and trip_day_id is not distinct from day_id) then
        raise exception 'trip_duplicate' using errcode='P0001';
      end if;
$old$, $new$$new$),
    ('private.edit_trip_plan_roots(text,uuid,integer,text,jsonb)', $old$private.trip_item_position(p_trip,day_id,null,null),$old$, $new$private.trip_item_position(p_trip,day_id,null,(p_data->>'before')::uuid),$new$),
    ('private.edit_trip_plan_stops(text,uuid,integer,text,jsonb)', $old$      if entry_ref=parent.entry_id then raise exception 'trip_stop_self' using errcode='22023'; end if;
$old$, $new$$new$),
    ('private.edit_trip_plan_stops(text,uuid,integer,text,jsonb)', $old$      if not coalesce((p_data->>'repeat')::boolean,false) and exists(select 1 from public.trip_item_stops
        where trip_item_id=parent_ref and entry_id=entry_ref) then
        raise exception 'trip_duplicate' using errcode='P0001';
      end if;
$old$, $new$$new$),
    ('private.edit_trip_plan_stops(text,uuid,integer,text,jsonb)', $old$private.trip_stop_position(parent_ref,null,null));$old$, $new$private.trip_stop_position(parent_ref,null,(p_data->>'before')::uuid));$new$),
    ('private.edit_trip_plan_nesting(text,uuid,integer,text,jsonb)', $old$if source.id=parent.id or source.entry_id=parent.entry_id then$old$, $new$if source.id=parent.id then$new$),
    ('private.edit_trip_plan_nesting(text,uuid,integer,text,jsonb)', $old$  if exists(select 1 from public.trip_item_stops where trip_item_id=parent.id and entry_id=source.entry_id) then
    raise exception 'trip_stop_duplicate' using errcode='22023';
  end if;
$old$, $new$$new$),
    ('private.edit_trip_plan_before_colors(text,uuid,integer,text,jsonb)', $old$    if parent.entry_id=source.entry_id then
      raise exception 'trip_stop_self' using errcode='22023';
    end if;
$old$, $new$$new$),
    ('private.edit_trip_plan_before_colors(text,uuid,integer,text,jsonb)', $old$    if parent.id<>origin.id and exists(select 1 from public.trip_item_stops
      where trip_item_id=parent.id and entry_id=source.entry_id and id<>source.id) then
      raise exception 'trip_stop_duplicate' using errcode='22023';
    end if;
$old$, $new$$new$)
  ) as edits(signature,old_body,new_body) loop
    definition:=pg_get_functiondef(edit.signature::regprocedure);
    if position(edit.old_body in definition)=0 then
      raise exception 'Unexpected planner function body: %',edit.signature;
    end if;
    updated:=replace(definition,edit.old_body,edit.new_body);
    execute updated;
  end loop;
end $migration$;
