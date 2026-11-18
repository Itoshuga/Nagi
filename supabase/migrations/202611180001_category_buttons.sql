-- Button groups are stored as ordered {label,url} arrays in entry custom_values.
alter type public.catalog_field_type add value if not exists 'buttons';

create function private.valid_catalog_buttons(p_value jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare button jsonb; href text;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value) not between 1 and 12 then return false; end if;
  for button in select * from jsonb_array_elements(p_value) loop
    if jsonb_typeof(button) is distinct from 'object' then return false; end if;
    if not coalesce(
      (select count(*) from jsonb_object_keys(button))=2
      and jsonb_typeof(button->'label')='string'
      and length(trim(button->>'label')) between 1 and 80
      and jsonb_typeof(button->'url')='string',false) then return false; end if;
    href := button->>'url';
    if length(href)>2048 or href !~* '^https?://[^[:space:]/?#@]+[^[:space:]]*$'
      or href ~* '^https?://[^/?#]*@' then return false; end if;
  end loop;
  return true;
end $$;
revoke execute on function private.valid_catalog_buttons(jsonb) from public;

create or replace function private.validate_catalog_values(p_category uuid,p_values jsonb,p_published boolean)
returns void language plpgsql set search_path='' as $$
declare field public.category_fields; value jsonb; raw text;
begin
  if exists(select 1 from jsonb_object_keys(p_values) k
    where not exists(select 1 from public.category_fields f where f.category_id=p_category and f.id::text=k)) then
    raise exception 'catalog_unknown_field' using errcode='23514';
  end if;
  for field in select * from public.category_fields where category_id=p_category loop
    value := p_values->field.id::text;
    if value is null then
      if field.is_required and p_published then
        raise exception 'catalog_required_field: %',field.label using errcode='23514';
      end if;
      continue;
    end if;
    raw := value #>> '{}';
    if not coalesce(case field.type::text
      when 'short_text' then jsonb_typeof(value)='string' and length(trim(raw)) between 1 and 250
      when 'long_text' then jsonb_typeof(value)='string' and length(trim(raw)) between 1 and 5000
      when 'number' then jsonb_typeof(value)='number'
      when 'boolean' then jsonb_typeof(value)='boolean'
      when 'url' then jsonb_typeof(value)='string' and length(raw) <= 2048 and raw ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'
      when 'date' then jsonb_typeof(value)='string' and raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      when 'select' then jsonb_typeof(value)='string' and raw=any(field.options)
      when 'multi_select' then case when jsonb_typeof(value)='array' then
        jsonb_array_length(value) between 1 and cardinality(field.options)
        and not exists(select 1 from jsonb_array_elements(value) item where jsonb_typeof(item)<>'string' or not ((item #>> '{}')=any(field.options)))
        and jsonb_array_length(value)=(select count(distinct item) from jsonb_array_elements(value) item)
        else false end
      when 'buttons' then private.valid_catalog_buttons(value)
    end,false) then
      raise exception 'catalog_invalid_field: %',field.label using errcode='23514';
    end if;
    if field.type='date' then perform raw::date; end if;
  end loop;
end $$;
