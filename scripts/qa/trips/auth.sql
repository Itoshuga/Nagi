
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,last_sign_in_at timestamptz,raw_user_meta_data jsonb);
    create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,provider text,provider_id text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create schema realtime;
    create table realtime.messages(extension text,topic text,event text,payload jsonb,private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql as $$ select current_setting('test.realtime_topic',true) $$;
    create function realtime.send(p_payload jsonb,p_event text,p_topic text,p_private boolean) returns void
      language sql as $$insert into realtime.messages values ('broadcast',p_topic,p_event,p_payload,p_private)$$;
  