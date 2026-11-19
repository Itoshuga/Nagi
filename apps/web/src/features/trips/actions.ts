'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  findCatalogEntry,
  listCatalogEntries,
  listEntryRelations,
  searchCatalogLocations,
} from '@nagi/database';
import {
  destinationKindSchema,
  tripCatalogSearchSchema,
  tripEditSchema,
  tripSettingsSchema,
  tripVersionSchema,
  uuidSchema,
  type DestinationKind,
  type TripCatalogSearch,
  type TripEdit,
  type TripResult,
} from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';
import { publicCatalogDatabase } from '@/lib/supabase/server';
import { discardTripCover, discardUnattachedTripCover, uploadTripCover } from './cover';

type Failure = Extract<TripResult, { ok: false }>;
export type TripFormState = { error: string };

function changed(guild: string, trip?: string) {
  revalidatePath(`/app/${guild}`);
  revalidatePath(`/app/${guild}/trips`);
  if (trip) revalidatePath(`/app/${guild}/trips/${trip}`, 'layout');
}

function parseTripForm(form: FormData) {
  return tripSettingsSchema.safeParse({
    title: form.get('title'),
    description: form.get('description') ?? '',
    start_date: form.get('start_date') ?? '',
    end_date: form.get('end_date') ?? '',
    destination_country_id: form.get('destination_country_id') || null,
    timezone: form.get('timezone'),
    status: form.get('status') ?? 'draft',
    collaboration_mode: form.get('collaboration_mode') ?? 'all_members',
  });
}

async function authorizeDestination(id: string | null) {
  if (!id) return true;
  const { data, error } = await publicCatalogDatabase()
    .from('countries')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function failure(error: unknown): Failure {
  const cause = error instanceof Error ? error.cause : null;
  const message = cause && typeof cause === 'object' && 'message' in cause ? cause.message : null;
  if (message === 'trip_duplicate')
    return {
      ok: false,
      reason: 'duplicate',
      error:
        'Ce lieu figure déjà dans cette journée. Confirmez si vous souhaitez l’ajouter de nouveau.',
    };
  if (message === 'trip_conflict')
    return {
      ok: false,
      reason: 'conflict',
      error:
        'Le voyage a changé. Les données ont été actualisées. Vérifiez les modifications avant de réessayer.',
    };
  const explanations: Record<string, string> = {
    trip_forbidden: 'Vous ne disposez plus des droits nécessaires sur ce voyage.',
    trip_entry_hidden: 'Cette fiche n’est plus disponible dans le catalogue.',
    trip_day_missing: 'Cette journée ne fait plus partie du voyage.',
    trip_day_date: 'Choisissez une date libre dans la période du voyage.',
    trip_dates_required: 'Renseignez les dates de début et de fin du voyage.',
    trip_day_order: 'Les journées datées sont classées par date.',
    trip_member_missing:
      'Ce membre doit ouvrir l’espace Nagi de ce serveur avant de devenir organisateur.',
    trip_organizer_required:
      'L’organisateur à l’origine du voyage et le dernier organisateur doivent être conservés.',
  };
  return {
    ok: false,
    error:
      typeof message === 'string' && explanations[message]
        ? explanations[message]
        : 'Impossible d’enregistrer cette modification. Réessayez.',
  };
}

export async function createPlannedTrip(
  guild: string,
  initialEntry: string | null,
  _state: TripFormState,
  form: FormData,
): Promise<TripFormState> {
  const { viewer } = await requireGuild(guild, 'create', true);
  const parsed = parseTripForm(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Vérifiez le voyage.' };
  const id = randomUUID();
  let cover: string | undefined;
  try {
    if (!(await authorizeDestination(parsed.data.destination_country_id)))
      return { error: 'Choisissez un pays publié du catalogue.' };
    cover = await uploadTripCover(guild, id, form.get('cover'));
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'La couverture ou la destination est indisponible.',
    };
  }
  try {
    await (
      await spaceServices()
    ).trips.createPlan(guild, viewer.id, id, parsed.data, cover ?? null);
  } catch {
    await discardUnattachedTripCover(guild, id, cover);
    return { error: 'Le voyage n’a pas pu être créé. Réessayez.' };
  }
  changed(guild, id);
  const query =
    initialEntry && uuidSchema.safeParse(initialEntry).success ? `?ajouter=${initialEntry}` : '';
  redirect(`/app/${guild}/trips/${id}${query}`);
}

export async function saveTripSettings(
  guild: string,
  trip: string,
  _state: TripFormState,
  form: FormData,
): Promise<TripFormState> {
  await requireGuild(guild, 'read', true);
  const parsed = parseTripForm(form),
    version = tripVersionSchema.safeParse(Number(form.get('version')));
  if (!uuidSchema.safeParse(trip).success || !version.success)
    return { error: 'Voyage introuvable.' };
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Vérifiez les informations.' };
  const { trips, db } = await spaceServices();
  const [existing, permission] = await Promise.all([
    trips.get(guild, trip),
    db.rpc('is_trip_organizer', { p_trip_id: trip }),
  ]);
  if (!existing || permission.error || !permission.data)
    return { error: 'Seuls les organisateurs peuvent modifier ce voyage.' };
  let cover: string | undefined;
  try {
    if (
      parsed.data.destination_country_id !== existing.destination_country_id &&
      !(await authorizeDestination(parsed.data.destination_country_id))
    )
      return { error: 'Choisissez un pays publié du catalogue.' };
    cover = await uploadTripCover(guild, trip, form.get('cover'));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Impossible d’enregistrer la couverture.',
    };
  }
  const nextCover = cover ?? (form.get('remove_cover') === 'yes' ? null : undefined);
  try {
    await trips.edit(guild, trip, version.data, {
      operation: 'settings',
      data: {
        ...parsed.data,
        ...(nextCover !== undefined && { cover_image_url: nextCover }),
      },
    });
  } catch (error) {
    await discardUnattachedTripCover(guild, trip, cover);
    return { error: failure(error).error };
  }
  if (nextCover !== undefined) await discardTripCover(existing.cover_image_url);
  changed(guild, trip);
  redirect(`/app/${guild}/trips/${trip}`);
}

export async function removeTrip(
  guild: string,
  trip: string,
  _state: TripFormState,
  form: FormData,
): Promise<TripFormState> {
  await requireGuild(guild, 'read', true);
  const version = tripVersionSchema.safeParse(Number(form.get('version')));
  if (!uuidSchema.safeParse(trip).success || !version.success || form.get('confirm') !== 'yes')
    return { error: 'Confirmez la suppression du voyage.' };
  const { trips } = await spaceServices();
  const existing = await trips.get(guild, trip);
  if (!existing) return { error: 'Voyage introuvable.' };
  try {
    await trips.edit(guild, trip, version.data, { operation: 'delete_trip', data: {} });
  } catch (error) {
    return { error: failure(error).error };
  }
  await discardTripCover(existing.cover_image_url);
  changed(guild, trip);
  redirect(`/app/${guild}/trips`);
}

export async function editTrip(
  guild: string,
  trip: string,
  version: number,
  mutation: TripEdit,
): Promise<TripResult> {
  await requireGuild(guild, 'read', true);
  const parsed = tripEditSchema.safeParse(mutation);
  if (!uuidSchema.safeParse(trip).success || !tripVersionSchema.safeParse(version).success)
    return { ok: false, error: 'Voyage introuvable.' };
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Vérifiez les valeurs de cette modification.',
    };
  try {
    const revised = await (await spaceServices()).trips.edit(guild, trip, version, parsed.data);
    changed(guild, trip);
    return { ok: true, version: revised };
  } catch (error) {
    return failure(error);
  }
}

export async function editableTripOptions(guild: string) {
  const { viewer, guild: space, isAdmin } = await requireGuild(guild);
  return {
    trips: await (await spaceServices()).trips.editableTrips(guild, viewer.id, isAdmin),
    canCreate: isAdmin || space.members_can_create_trips,
  };
}

export async function tripCatalogSearch(guild: string, filters: TripCatalogSearch) {
  await requireGuild(guild);
  const query = tripCatalogSearchSchema.parse(filters);
  return listCatalogEntries(publicCatalogDatabase(), { ...query, published: true }, true);
}
export async function tripPlaceOptions(
  guild: string,
  kind: DestinationKind,
  search: string,
  parent?: string,
) {
  await requireGuild(guild);
  if (
    !destinationKindSchema.safeParse(kind).success ||
    typeof search !== 'string' ||
    (parent && !uuidSchema.safeParse(parent).success)
  )
    return [];
  return searchCatalogLocations(publicCatalogDatabase(), kind, search, parent);
}
export async function tripRelatedPlaces(guild: string, trip: string, item: string) {
  await requireGuild(guild);
  if (!uuidSchema.safeParse(trip).success || !uuidSchema.safeParse(item).success) return [];
  const { trips, db } = await spaceServices();
  if (!(await trips.get(guild, trip))) return [];
  const result = await db
    .from('trip_items')
    .select('entry_id')
    .eq('trip_id', trip)
    .eq('id', item)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return [];
  const catalog = publicCatalogDatabase();
  const entry = await findCatalogEntry(catalog, result.data.entry_id);
  return entry ? listEntryRelations(catalog, entry.id) : [];
}
