const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fullDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function navigationDayDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return;
  return { value, short: shortDate.format(date), full: fullDate.format(date) };
}
/** Only main itinerary occurrences; nested stops never inflate these counts. */
export function navigationDayCounts(items: ReadonlyArray<{ trip_day_id?: string | null }>) {
  const counts = new Map<string, number>([
    ['all', items.length],
    ['pending', 0],
  ]);
  for (const item of items) {
    const key = item.trip_day_id ?? 'pending';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
type Edges = { top: number; bottom: number; left: number; right: number };
/** Minimal correction inside the navigation's own scrollport, never the page. */
export function navigationScrollDelta(port: Edges, item: Edges) {
  return {
    top:
      item.top < port.top
        ? item.top - port.top
        : item.bottom > port.bottom
          ? item.bottom - port.bottom
          : 0,
    left:
      item.left < port.left
        ? item.left - port.left
        : item.right > port.right
          ? item.right - port.right
          : 0,
  };
}
