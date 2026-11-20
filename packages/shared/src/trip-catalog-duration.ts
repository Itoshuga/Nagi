/** Use explicit visit-duration fields only. A bare number without a unit is not
 * interpreted as minutes; prices, opening hours and ranges are never guessed. */
export function suggestedVisitDuration(
  fields: { id: string; key: string; label: string }[],
  values: unknown,
): number | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  for (const field of fields) {
    const semantic = `${field.key} ${field.label}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (
      !/(?:duree|duration)/.test(semantic) ||
      !/(?:visit|conseille|recommend|estimated)/.test(semantic)
    )
      continue;
    const value = (values as Record<string, unknown>)[field.id];
    let minutes: number | undefined;
    if (typeof value === 'number' && /(?:minutes?|\bmin\b)/.test(semantic)) minutes = value;
    if (typeof value === 'string') {
      const match = value
        .trim()
        .match(/^(?:(\d+)\s*(?:h|heures?|hours?)\s*)?(?:(\d+)\s*(?:min|minutes?)?)?$/i);
      if (match && (match[1] || /min/i.test(value)))
        minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
    }
    if (minutes !== undefined && Number.isInteger(minutes) && minutes > 0 && minutes <= 1440)
      return minutes;
  }
  return null;
}
