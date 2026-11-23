/** Presentation budgets are in CSS pixels; the scheduling scale stays unchanged. */
export function calendarEventPresentation(height: number) {
  return { time: height >= 34, details: height >= 52 };
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
