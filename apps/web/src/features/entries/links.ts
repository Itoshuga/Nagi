export function entryHref(guildId: string, entry: { id: string; slug: string }) {
  return `/app/${guildId}/fiches/${entry.id}/${entry.slug}`;
}
