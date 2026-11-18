alter table public.category_fields add column icon text
  check (icon is null or (length(icon) between 1 and 80 and icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
