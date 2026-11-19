import { z } from 'zod';
import { tripInputSchema, uuidSchema } from './collaboration';
import { snowflakeSchema } from './identifiers';

export const tripStatuses = [
  'draft',
  'planned',
  'ongoing',
  'completed',
  'cancelled',
  'archived',
] as const;
export const collaborationModes = ['all_members', 'organizers_only'] as const;
export const tripTimezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    if (value !== 'UTC' && !value.includes('/')) return false;
    try {
      new Intl.DateTimeFormat('fr', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choisissez un fuseau horaire IANA valide.');

export const tripSettingsSchema = tripInputSchema.safeExtend({
  destination_country_id: uuidSchema.nullable(),
  timezone: tripTimezoneSchema,
  status: z.enum(tripStatuses),
  collaboration_mode: z.enum(collaborationModes),
});
export type TripSettings = z.output<typeof tripSettingsSchema>;

const localTime = z
  .string()
  .regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/)
  .nullable();
const dayFields = { title: z.string().trim().max(160), date: z.iso.date().nullable() };
export const tripEditSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add_day'), data: z.object(dayFields) }),
  z.object({ operation: z.literal('edit_day'), data: z.object({ ...dayFields, id: uuidSchema }) }),
  z.object({
    operation: z.literal('move_day'),
    data: z.object({ id: uuidSchema, direction: z.enum(['up', 'down']) }),
  }),
  z.object({
    operation: z.literal('delete_day'),
    data: z.object({ id: uuidSchema, day: uuidSchema.nullable() }),
  }),
  z.object({ operation: z.literal('generate_days'), data: z.object({}) }),
  z.object({
    operation: z.literal('organizer_add'),
    data: z.object({ discord_id: snowflakeSchema }),
  }),
  z.object({ operation: z.literal('organizer_remove'), data: z.object({ id: uuidSchema }) }),
  z.object({
    operation: z.literal('add_item'),
    data: z.object({
      id: uuidSchema,
      entry: uuidSchema,
      day: uuidSchema.nullable(),
      repeat: z.boolean(),
      start_time: localTime.optional(),
      duration: z.number().int().min(1).max(1440).nullable().optional(),
    }),
  }),
  z.object({
    operation: z.literal('move_item'),
    data: z.object({
      id: uuidSchema,
      day: uuidSchema.nullable(),
      before: uuidSchema.nullable(),
    }),
  }),
  z.object({ operation: z.literal('delete_item'), data: z.object({ id: uuidSchema }) }),
  z.object({ operation: z.literal('sort_items'), data: z.object({ day: uuidSchema.nullable() }) }),
  z.object({
    operation: z.literal('schedule_item'),
    data: z
      .object({
        id: uuidSchema,
        item_version: z.number().int().nonnegative(),
        day: uuidSchema.nullable(),
        start_time: localTime,
        end_time: localTime,
        duration: z.number().int().min(1).max(1440).nullable(),
      })
      .refine(
        (v) => !v.end_time || Boolean(v.start_time && v.start_time < v.end_time),
        'L’heure de fin doit suivre le début sur la même journée.',
      ),
  }),
  z.object({
    operation: z.literal('edit_item'),
    data: z
      .object({
        id: uuidSchema,
        item_version: z.number().int().nonnegative(),
        start_time: localTime,
        end_time: localTime,
        duration: z.number().int().min(1).max(1440).nullable(),
        notes: z.string().trim().max(4000),
      })
      .refine(
        (item) => !item.end_time || Boolean(item.start_time && item.start_time < item.end_time),
        'L’heure de fin doit suivre l’heure de début sur la même journée.',
      ),
  }),
]);
export type TripEdit = z.output<typeof tripEditSchema>;
export type TripResult =
  { ok: false; error: string; reason?: 'duplicate' | 'conflict' } | { ok: true; version: number };
export const tripVersionSchema = z.number().int().nonnegative();
export const tripCatalogSearchSchema = z.object({
  search: z.string().trim().max(100),
  page: z.number().int().min(1).max(10000),
  countryId: uuidSchema.optional(),
  cityId: uuidSchema.optional(),
  neighborhoodId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
});
export type TripCatalogSearch = z.input<typeof tripCatalogSearchSchema>;

export const tripPlaceQuery = z.object({
  mode: z.enum(['search', 'detail', 'locations', 'nearby']).default('search'),
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(0).max(10000).default(0),
  day: uuidSchema.optional(),
  entry: uuidSchema.optional(),
  category: uuidSchema.optional(),
  country: uuidSchema.optional(),
  city: uuidSchema.optional(),
  neighborhood: uuidSchema.optional(),
  kind: z.enum(['countries', 'cities', 'neighborhoods']).optional(),
  parent: uuidSchema.optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
});
export type TripPlaceQuery = z.output<typeof tripPlaceQuery>;

// Only suggest destinations for which one timezone is an unambiguous default.
const countryTimezones: Record<string, string> = {
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  CN: 'Asia/Shanghai',
  TW: 'Asia/Taipei',
  IN: 'Asia/Kolkata',
  TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh',
  SG: 'Asia/Singapore',
  KH: 'Asia/Phnom_Penh',
  DE: 'Europe/Berlin',
  IT: 'Europe/Rome',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  BE: 'Europe/Brussels',
  NL: 'Europe/Amsterdam',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  DK: 'Europe/Copenhagen',
  SE: 'Europe/Stockholm',
  GR: 'Europe/Athens',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  TR: 'Europe/Istanbul',
  EG: 'Africa/Cairo',
  MA: 'Africa/Casablanca',
  ZA: 'Africa/Johannesburg',
  IS: 'Atlantic/Reykjavik',
  AE: 'Asia/Dubai',
};

export function suggestedTripZone(countryCode?: string | null) {
  return (countryCode && countryTimezones[countryCode]) || 'UTC';
}

export function tripDateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('fr-FR', {
    ...(options ?? { dateStyle: 'long' }),
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function isOutsideTrip(date: string | null, start: string | null, end: string | null) {
  return Boolean(date && ((start && date < start) || (end && date > end)));
}

export function sortTripDays<
  T extends { date: string | null; sort_order: number; day_number: number },
>(days: T[]) {
  return [...days].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || a.day_number - b.day_number;
    if (a.date || b.date) return a.date ? -1 : 1;
    return a.sort_order - b.sort_order || a.day_number - b.day_number;
  });
}

const timeMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function overlappingTripItems(
  items: {
    id: string;
    start_time: string | null;
    end_time: string | null;
    estimated_duration_minutes: number | null;
  }[],
) {
  const conflicts = new Set<string>();
  const ranges = items
    .flatMap((item) => {
      if (!item.start_time) return [];
      const start = timeMinutes(item.start_time);
      const end = item.end_time
        ? timeMinutes(item.end_time)
        : Math.min(1440, start + (item.estimated_duration_minutes ?? 0));
      return end > start ? [{ id: item.id, start, end }] : [];
    })
    .sort((a, b) => a.start - b.start);
  let latest: (typeof ranges)[number] | undefined;
  for (const range of ranges) {
    if (latest && range.start < latest.end) {
      conflicts.add(latest.id);
      conflicts.add(range.id);
    }
    if (!latest || range.end > latest.end) latest = range;
  }
  return conflicts;
}

export function tripPoints<
  T extends {
    trip_day_id: string | null;
    entry: { latitude: number | null; longitude: number | null } | null;
  },
>(items: T[], filter: 'all' | 'pending' | string) {
  const located: { item: T; latitude: number; longitude: number }[] = [];
  const missing: T[] = [];
  for (const item of items) {
    if (filter !== 'all' && item.trip_day_id !== (filter === 'pending' ? null : filter)) continue;
    const lat = item.entry?.latitude;
    const lng = item.entry?.longitude;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    )
      located.push({ item, latitude: lat, longitude: lng });
    else missing.push(item);
  }
  return { located, missing };
}

/** Unwrap points through the largest empty longitude interval to keep the viewport compact. */
export function tripMapLongitudes(longitudes: number[]) {
  if (longitudes.length < 2) return longitudes;
  const normalize = (value: number) => (value + 360) % 360;
  const sorted = longitudes.map(normalize).sort((a, b) => a - b);
  let gap = -1;
  let start = sorted[0]!;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1] ?? sorted[0]! + 360;
    if (next - current > gap) {
      gap = next - current;
      start = next % 360;
    }
  }
  const offset = start > 180 ? -360 : 0;
  return longitudes.map((lng) => {
    const normalized = normalize(lng);
    return normalized + (normalized < start ? 360 : 0) + offset;
  });
}
