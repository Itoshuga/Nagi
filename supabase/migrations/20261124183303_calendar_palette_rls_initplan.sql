-- Identity is constant during a request. Use an InitPlan for both palette
-- operations, preserving the existing owner predicate, roles and grants.
-- No rows, columns or existing migrations are modified.
alter policy user_calendar_colors_read on public.user_calendar_colors
  using (user_id = (select auth.uid()));

alter policy user_calendar_colors_remove on public.user_calendar_colors
  using (user_id = (select auth.uid()));
