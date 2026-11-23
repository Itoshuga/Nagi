/** Presentation budgets are in CSS pixels; the scheduling scale stays unchanged. */
export const calendarGoogleTitleHeight = 53;
export const calendarGoogleTitleWidth = 160;

export function calendarEventPresentation(height: number, width: number, google: boolean) {
  const titleHeight =
    google && height >= calendarGoogleTitleHeight && width >= calendarGoogleTitleWidth
      ? calendarGoogleTitleHeight
      : 16;
  return {
    time: height >= titleHeight + 18,
    details: height >= titleHeight + 36,
  };
}

export function calendarLocalTime(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === name)!.value;
  const hour = part('hour'),
    minute = part('minute');
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: Number(hour) * 60 + Number(minute),
    label: `${hour}:${minute}`,
  };
}
