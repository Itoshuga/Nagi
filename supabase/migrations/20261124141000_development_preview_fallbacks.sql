-- The existing licensed fallback choices can also be previewed privately.
create or replace function public.set_image_preview(p_actor uuid,p_key text,p_mode text,p_image uuid default null,
  p_revision integer default 0,p_visit uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare g public.image_galleries; slot text; current_choice jsonb; next_revision integer;
begin
  if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role in ('admin','owner')) then
    raise exception 'image_preview_forbidden' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('automatic','manual','fallback','published') or p_revision is null or p_revision<0
    or (p_mode='manual' and p_image is null) or (p_mode<>'manual' and p_image is not null) then
    raise exception 'image_preview_invalid' using errcode='22023'; end if;
  select * into g from public.image_galleries where cache_key=p_key for update;
  if not found then raise exception 'image_gallery_missing' using errcode='22023'; end if;
  if p_mode='manual' and not (
    exists(select 1 from public.image_candidates where id=p_image and gallery_key=p_key and availability_status<>'unavailable')
    or exists(select 1 from public.external_images e where e.id=p_image and e.available and (
      exists(select 1 from public.image_resolution_cache r where r.cache_key=p_key and p_image=any(r.candidates))
      or exists(select 1 from public.image_candidates c where c.gallery_key=p_key and c.photo_id=p_image and c.availability_status<>'unavailable')))) then
    raise exception 'image_preview_missing' using errcode='22023'; end if;
  slot:=p_actor::text||':'||coalesce(p_visit::text,'global');
  current_choice:=g.development_previews->slot;
  if coalesce((current_choice->>'revision')::integer,0)<>p_revision then
    raise exception 'image_preview_conflict' using errcode='40001'; end if;
  next_revision:=p_revision+1;
  update public.image_galleries set development_previews=jsonb_set(development_previews,array[slot],
    jsonb_strip_nulls(jsonb_build_object('mode',p_mode,'image',p_image,'revision',next_revision,
      'selected_by',p_actor,'selected_at',now()))),updated_at=now() where cache_key=p_key;
  return next_revision;
end $$;
revoke execute on function public.set_image_preview(uuid,text,text,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.set_image_preview(uuid,text,text,uuid,integer,uuid) to service_role;
