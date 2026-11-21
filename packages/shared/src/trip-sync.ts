import { z } from 'zod';
import { uuidSchema } from './collaboration';
import { calendarHexSchema } from './calendar-colors';
import { tripEditSchema, tripStatuses, collaborationModes } from './trip-planner';
import { placeSourceDefaults, googlePlaceIdSchema } from './trip-places';

const clock = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .nullable();
const minutes = z.number().int().min(1).max(1440).nullable();
export const tripItemPatchSchema = z
  .object({
    trip_day_id: uuidSchema.nullable().optional(),
    start_time: clock.optional(),
    end_time: clock.optional(),
    estimated_duration_minutes: minutes.optional(),
    notes: z.string().trim().max(4000).optional(),
    calendar_color: calendarHexSchema.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0);
export const tripStopPatchSchema = z
  .object({
    notes: z.string().trim().max(4000).optional(),
    duration_minutes: minutes.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0);
export const tripDayPatchSchema = z
  .object({
    title: z.string().trim().max(160).optional(),
    date: z.iso.date().nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0);
const transportChangeSchema = z.union([
  z
    .object({
      operation: z.literal('patch_item'),
      data: z.object({ id: uuidSchema, patch: tripItemPatchSchema }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('patch_stop'),
      data: z.object({ id: uuidSchema, patch: tripStopPatchSchema }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('patch_day'),
      data: z.object({ id: uuidSchema, patch: tripDayPatchSchema }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('add_day'),
      data: z
        .object({
          id: uuidSchema,
          title: z.string().trim().max(160),
          date: z.iso.date().nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('generate_days'),
      data: z
        .object({ days: z.array(z.object({ id: uuidSchema, date: z.iso.date() })).max(3660) })
        .strict(),
    })
    .strict(),
  tripEditSchema,
]);
const guard = z.record(
  z.string().max(64),
  z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]),
);
export const tripMutationSchema = z
  .object({
    id: uuidSchema,
    base: z.number().int().nonnegative(),
    change: transportChangeSchema,
    expected: z
      .object({
        items: z.record(uuidSchema, guard).default({}),
        stops: z.record(uuidSchema, guard).default({}),
        days: z.record(uuidSchema, guard).default({}),
      })
      .strict(),
  })
  .strict();
export type TripMutationRequest = z.output<typeof tripMutationSchema>;
export type TripTransportChange = TripMutationRequest['change'];

const timestamps = { created_at: z.string(), updated_at: z.string() };
const sourceFields = {
  source: z.enum(['nagi', 'google', 'custom']),
  google_place_id: googlePlaceIdSchema.nullable(),
  custom_title: z.string().max(160).nullable(),
  custom_location: z.string().max(500).nullable(),
  custom_latitude: z.number().min(-90).max(90).nullable(),
  custom_longitude: z.number().min(-180).max(180).nullable(),
};
const itemRow = z.object({
  ...sourceFields,
  id: uuidSchema,
  trip_id: uuidSchema,
  trip_day_id: uuidSchema.nullable(),
  entry_id: uuidSchema.nullable(),
  added_by: uuidSchema.nullable(),
  notes: z.string().max(4000),
  sort_order: z.number(),
  start_time: clock,
  end_time: clock,
  estimated_duration_minutes: minutes,
  calendar_color: calendarHexSchema.nullable(),
  version: z.number().int().nonnegative(),
  ...timestamps,
});
const stopRow = z.object({
  ...sourceFields,
  id: uuidSchema,
  trip_item_id: uuidSchema,
  entry_id: uuidSchema.nullable(),
  added_by: uuidSchema.nullable(),
  notes: z.string().max(4000),
  sort_order: z.number(),
  duration_minutes: minutes,
  calendar_color: calendarHexSchema.nullable(),
  version: z.number().int().nonnegative(),
  ...timestamps,
});
const dayRow = z.object({
  id: uuidSchema,
  trip_id: uuidSchema,
  day_number: z.number().int(),
  date: z.iso.date().nullable(),
  title: z.string(),
  sort_order: z.number(),
  ...timestamps,
});
const delta = <T extends z.ZodObject>(row: T) =>
  z.object({
    upsert: z
      .array(
        z.preprocess(
          (value) =>
            value && typeof value === 'object' ? { ...placeSourceDefaults, ...value } : value,
          row,
        ),
      )
      .max(20000),
    patch: z.array(row.partial().extend({ id: uuidSchema })).max(20000),
    remove: z.array(uuidSchema).max(20000),
  });
export const tripRealtimeEventSchema = z.object({
  event_id: uuidSchema,
  mutation_id: uuidSchema.nullable(),
  trip_id: uuidSchema,
  previous_version: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  changes: z.object({
    items: delta(itemRow),
    stops: delta(stopRow),
    days: delta(dayRow),
    trip: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      cover_image_url: z.string().nullable().optional(),
      start_date: z.iso.date().nullable().optional(),
      end_date: z.iso.date().nullable().optional(),
      destination_country_id: uuidSchema.nullable().optional(),
      timezone: z.string().optional(),
      status: z.enum(tripStatuses).optional(),
      collaboration_mode: z.enum(collaborationModes).optional(),
      updated_at: z.string().optional(),
    }),
  }),
  entry_ids: z.array(uuidSchema).max(20000),
});
export type TripRealtimeEvent = z.output<typeof tripRealtimeEventSchema>;
export const tripSyncBatchSchema = z.object({
  version: z.number().int().nonnegative(),
  events: z.array(tripRealtimeEventSchema).max(1000),
  reset: z.boolean(),
  can_edit: z.boolean(),
  can_manage: z.boolean(),
});
export type TripSyncBatch = z.output<typeof tripSyncBatchSchema>;
