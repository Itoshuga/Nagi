'use server';

import { CalendarColorService } from '@nagi/database';
import { calendarHexSchema, uuidSchema, type SavedCalendarColor } from '@nagi/shared';
import { requireGuild, spaceServices } from '@/features/spaces/server';

export type CalendarPaletteResult<T> = { ok: true; data: T } | { ok: false; error: string };
function explanation(error: unknown, fallback: string) {
  const cause = error instanceof Error ? error.cause : null;
  if (
    cause &&
    typeof cause === 'object' &&
    'message' in cause &&
    cause.message === 'calendar_palette_full'
  )
    return 'Votre palette contient déjà 32 couleurs. Retirez-en une pour en ajouter une autre.';
  return fallback;
}

export async function listCalendarColors(
  guild: string,
): Promise<CalendarPaletteResult<SavedCalendarColor[]>> {
  await requireGuild(guild, 'read', true);
  try {
    return { ok: true, data: await new CalendarColorService((await spaceServices()).db).list() };
  } catch {
    return { ok: false, error: 'Impossible de charger vos couleurs. Réessayez.' };
  }
}
export async function addCalendarColor(
  guild: string,
  value: string,
): Promise<CalendarPaletteResult<SavedCalendarColor>> {
  await requireGuild(guild, 'read', true);
  const parsed = calendarHexSchema.safeParse(value);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Couleur invalide.' };
  try {
    return {
      ok: true,
      data: await new CalendarColorService((await spaceServices()).db).add(parsed.data),
    };
  } catch (error) {
    return {
      ok: false,
      error: explanation(error, 'Impossible d’enregistrer cette couleur. Réessayez.'),
    };
  }
}
export async function removeCalendarColor(
  guild: string,
  id: string,
): Promise<CalendarPaletteResult<null>> {
  await requireGuild(guild, 'read', true);
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: 'Couleur introuvable.' };
  try {
    await new CalendarColorService((await spaceServices()).db).remove(id);
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: 'Impossible de retirer cette couleur. Réessayez.' };
  }
}
