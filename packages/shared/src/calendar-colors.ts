import { z } from 'zod';

export const calendarPresets = [
  { name: 'Bleu Nagi', hex: '#73A6DF' },
  { name: 'Vert', hex: '#69AA91' },
  { name: 'Orange', hex: '#D9A16C' },
  { name: 'Violet', hex: '#A28BC9' },
] as const;
export const calendarPaletteLimit = 32;

export function normalizeCalendarHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[\da-f]{3}$/i.test(hex))
    return `#${hex
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`;
  return null;
}
export const calendarHexSchema = z.string().transform((value, context) => {
  const hex = normalizeCalendarHex(value);
  if (hex) return hex;
  context.addIssue({
    code: 'custom',
    message: 'Saisissez une couleur HEX valide, par exemple #73A6DF.',
  });
  return z.NEVER;
});
export const savedCalendarColorSchema = z.object({
  id: z.uuid(),
  hex_color: calendarHexSchema,
  sort_order: z.number().int(),
});
export type SavedCalendarColor = z.infer<typeof savedCalendarColorSchema>;
export type CalendarHsv = { h: number; s: number; v: number };
const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

export function hsvToCalendarHex({ h, s, v }: CalendarHsv) {
  const hue = (((h % 360) + 360) % 360) / 60;
  const saturation = clamp(s, 100) / 100,
    value = clamp(v, 100) / 100;
  const chroma = value * saturation,
    x = chroma * (1 - Math.abs((hue % 2) - 1)),
    m = value - chroma;
  const rgb =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${rgb
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}
export function calendarHexToHsv(value: string): CalendarHsv {
  const hex = normalizeCalendarHex(value) ?? calendarPresets[0].hex;
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const hue = !delta
    ? 0
    : max === r
      ? ((g - b) / delta) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return { h: (hue * 60 + 360) % 360, s: max ? (delta / max) * 100 : 0, v: max * 100 };
}
export function calendarEventColor(color?: string | null, category?: string | null) {
  return (
    normalizeCalendarHex(color ?? '') ??
    normalizeCalendarHex(category ?? '') ??
    calendarPresets[0].hex
  );
}
export const calendarColorStyle = (color: string) => ({
  '--trip-calendar-color': calendarEventColor(color),
});
export function calendarSwatchInk(value: string) {
  const hex = calendarEventColor(value);
  const linear = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722 > 0.24
    ? '#142B48'
    : '#FFFFFF';
}
