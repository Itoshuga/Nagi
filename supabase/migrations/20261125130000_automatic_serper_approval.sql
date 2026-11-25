-- Project-level approval of Serper photographs. This is deliberately distinct
-- from a documented open licence or permission from the rights holder.
alter table public.image_candidates drop constraint image_candidates_rights_status_check;
alter table public.image_candidates add constraint image_candidates_rights_status_check
  check (rights_status in ('unknown','open_license','permission_granted','restricted','rejected','auto_approved'));
alter table public.image_candidates alter column rights_status set default 'auto_approved';

alter table public.external_images drop constraint external_images_metadata_check;
alter table public.external_images add constraint external_images_metadata_check check (
  jsonb_typeof(metadata)='object' and metadata ?& array['imageUrl','thumbnailUrl','sourceUrl'] and (
    (provider<>'serper' and metadata ?& array['license','licenseUrl']
     and metadata->>'license' in ('CC0','Public domain','CC BY','CC BY-SA')
     and metadata->>'imageUrl' like 'https://upload.wikimedia.org/%'
     and (metadata->>'thumbnailUrl' like 'https://upload.wikimedia.org/%' or metadata->>'thumbnailUrl' like 'https://thumb.wikimedia.org/%')
     and metadata->>'sourceUrl' like 'https://commons.wikimedia.org/%'
     and metadata->>'licenseUrl' like 'https://creativecommons.org/%')
    or (provider='serper' and metadata ?& array['rightsStatus','usageRights']
     and ((metadata->>'rightsStatus' in ('open_license','permission_granted') and metadata->>'usageRights' in ('open','permission-granted'))
       or (metadata->>'rightsStatus'='auto_approved' and metadata->>'usageRights'='project-approved'))
     and metadata->>'imageUrl' like 'https://%' and metadata->>'thumbnailUrl' like 'https://%'
     and metadata->>'sourceUrl' like 'https://%')
  )
);

create function private.publish_automatically_approved_image() returns trigger
language plpgsql security definer set search_path='' as $$
declare publication jsonb; approved_at timestamptz; source_url text;
begin
 -- Compatibility with a worker explicitly supplying the former default.
 if tg_op='INSERT' and new.rights_status='unknown' then
  update public.image_candidates set rights_status='auto_approved' where id=new.id;
  return new;
 end if;
 if new.provider<>'serper' or new.rights_status<>'auto_approved' then return new; end if;
 approved_at:=coalesce(new.verified_at,now());
 source_url:=case when new.metadata->>'link' like 'https://%' then new.metadata->>'link' else new.metadata->>'imageUrl' end;
 publication:=jsonb_strip_nulls(jsonb_build_object(
  'id',new.id,'provider','serper','sourceId','serper:'||new.url_key,'sourceUrl',source_url,
  'imageUrl',new.metadata->>'imageUrl','thumbnailUrl',coalesce(nullif(new.metadata->>'thumbnailUrl',''),new.metadata->>'imageUrl'),
  'previewUrl',new.metadata->>'imageUrl','title',new.title,
  'creator',new.creator,'license',new.license,'licenseUrl',new.license_url,
  'width',new.metadata->'imageWidth','height',new.metadata->'imageHeight',
  'usageRights','project-approved','rightsStatus','auto_approved',
  'attribution',concat_ws(' · ',nullif(new.title,''),new.creator,new.license,new.metadata->>'source'),
  'verifiedAt',approved_at));
 insert into public.external_images(id,provider,source_id,metadata,available,verified_at)
 values(new.id,'serper','serper:'||new.id::text,publication,not new.is_excluded and new.availability_status<>'unavailable',approved_at)
 on conflict(id) do update set metadata=excluded.metadata,available=excluded.available,verified_at=excluded.verified_at;
 -- Runs after conflict resolution: rediscovery cannot overwrite a manually
 -- verified licence, a Commons association, or an existing cover assignment.
 update public.image_candidates set photo_id=new.id,verified_at=approved_at where id=new.id;
 return new;
end $$;
revoke execute on function private.publish_automatically_approved_image() from public,anon,authenticated;
create trigger publish_automatically_approved_image
 after insert or update of metadata,title,rights_status,availability_status,is_excluded,creator,license,license_url
 on public.image_candidates for each row execute function private.publish_automatically_approved_image();

-- Existing galleries are promoted without a provider request. Explicit manual
-- exclusions and unavailable URLs remain unavailable; documented licences stay intact.
update public.image_candidates set rights_status='auto_approved',updated_at=now()
 where provider='serper' and rights_status in ('unknown','restricted','rejected');
