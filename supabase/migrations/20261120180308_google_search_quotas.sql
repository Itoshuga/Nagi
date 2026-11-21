-- Separate measured REST search attempts from UI Kit component grants.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.reserve_google_places(uuid,text,integer,integer,integer)'::regprocedure);
  if position('(''ui_search'',''ui_details'',''verify'',''coordinates'')' in definition)=0 then raise exception 'Unexpected Google quota kinds'; end if;
  execute replace(definition,'(''ui_search'',''ui_details'',''verify'',''coordinates'')','(''ui_search'',''ui_details'',''verify'',''coordinates'',''autocomplete'',''text_search'')');
end $$;
