-- Supabase loads safeupdate for PostgREST sessions. Synchronize the allowlist
-- with targeted mutations instead of an unconditional DELETE/reinsert.
-- CREATE OR REPLACE preserves the existing service-role-only EXECUTE grant.
create or replace function public.configure_owners(p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
declare allowed_ids text[] := coalesce(p_ids, array[]::text[]);
begin
  lock table private.owner_ids in exclusive mode;

  delete from private.owner_ids
    where not (discord_id = any(allowed_ids));

  insert into private.owner_ids(discord_id)
    select distinct unnest(allowed_ids)
    on conflict(discord_id) do nothing;

  update public.profiles
    set role = case
      when discord_id = any(allowed_ids) then 'owner'::public.app_role
      else 'user'::public.app_role
    end
    where (role = 'owner' or discord_id = any(allowed_ids))
      and role is distinct from case
        when discord_id = any(allowed_ids) then 'owner'::public.app_role
        else 'user'::public.app_role
      end;
end $$;
