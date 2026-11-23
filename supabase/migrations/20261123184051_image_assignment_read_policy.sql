-- One applicable SELECT policy per role, retaining public catalogue visibility
-- and the existing Discord/trip visit checks for authenticated members.
alter policy catalog_image_assignment_read on public.place_image_assignments to anon;
alter policy trip_image_assignment_read on public.place_image_assignments
  using (
    (entry_id is not null and exists(select 1 from public.entries e
      where e.id=entry_id and (e.published or (select public.is_nagi_admin()))))
    or (trip_id is not null and public.can_read_image_visit(trip_id,visit_id))
  );
alter policy trip_image_assignment_read on public.place_image_assignments rename to member_image_assignment_read;
