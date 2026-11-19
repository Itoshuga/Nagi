-- Personal rows with profile foreign keys already cascade. Remove the request IDs
-- that deliberately have no FK, so account deletion also clears their actor identity.
create function private.cleanup_deleted_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from private.trip_add_requests where user_id=old.id;
  return old;
end $$;
revoke execute on function private.cleanup_deleted_account() from public,anon,authenticated;
create trigger cleanup_deleted_account before delete on public.profiles
  for each row execute function private.cleanup_deleted_account();

-- A Discord administrator can manage a shared trip after its final organizer
-- deletes their account. Existing organizers retain their exclusive management.
create or replace function public.is_trip_organizer(p_trip_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.trips t where t.id=p_trip_id and public.is_guild_member(t.guild_id)
    and (
      exists(select 1 from public.trip_organizers o where o.trip_id=t.id and o.user_id=auth.uid())
      or (public.is_guild_admin(t.guild_id) and not exists(select 1 from public.trip_organizers o where o.trip_id=t.id))
    )
  )
$$;
create or replace function public.can_edit_guild_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.trips t where t.id=p_trip_id and public.is_guild_member(t.guild_id)
    and (t.collaboration_mode='all_members' or public.is_trip_organizer(t.id)))
$$;

-- The application checks this before revoking sessions or deleting an Auth user.
-- Its presence means the cleanup and orphan-trip access changes are deployed.
create function public.account_deletion_ready() returns boolean
language sql stable set search_path='' as $$ select true $$;
revoke execute on function public.account_deletion_ready() from public,anon,authenticated;
grant execute on function public.account_deletion_ready() to service_role;
