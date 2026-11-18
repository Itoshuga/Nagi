-- Cover foreign keys used by catalogue maintenance and profile destination updates.
create index profile_aliases_user_idx on private.profile_aliases(user_id);
create index entries_city_country_idx on public.entries(city_id, country_id);
create index profile_dream_city_idx on public.profile_customizations(dream_city_id);
create index profile_dream_country_idx on public.profile_customizations(dream_country_id);

