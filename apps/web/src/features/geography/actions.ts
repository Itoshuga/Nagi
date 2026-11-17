'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { GeographyService } from '@nagi/database';
import {
  coverFileSchema,
  destinationIdSchema,
  destinationInputs,
  destinationKindSchema,
  type DestinationKind,
} from '@nagi/shared';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { optimizeCover } from './cover-image';
import { coverUrl } from './model';
import { maxCoverSize, removeCover, uploadCover } from './storage';

export type DestinationActionState = {
  error?: string;
  fields?: Record<string, string>;
  success?: string;
  href?: string;
};

function refreshCatalog() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/app/[guildId]/discover', 'layout');
}

function mutationError(
  error: { code: string; message: string },
  kind: DestinationKind,
  deleting = false,
): DestinationActionState {
  const { code, message } = error;
  if (code === '23505') {
    if (message.includes('iso_code_key'))
      return { fields: { iso_code: 'Ce code ISO est déjà utilisé.' } };
    return { fields: { slug: 'Cette adresse est déjà utilisée à ce niveau du catalogue.' } };
  }
  if (code === '23503' && deleting) {
    if (message.includes('cities_country_id_fkey'))
      return {
        error:
          'Ce pays contient des villes. Réaffectez ou supprimez les villes avant de supprimer le pays.',
      };
    if (message.includes('neighborhoods_city_id_fkey'))
      return {
        error:
          'Cette ville contient des quartiers. Réaffectez ou supprimez les quartiers avant de supprimer la ville.',
      };
    return {
      error:
        'Des fiches utilisent encore cette destination. Réaffectez-les avant de supprimer la destination.',
    };
  }
  if (code === '23503') {
    if (kind === 'neighborhoods' && message.includes('entries_neighborhood_id_city_id_fkey'))
      return {
        fields: {
          city_id:
            'Des fiches utilisent ce quartier. Réaffectez-les avant de déplacer le quartier.',
        },
      };
    return {
      fields: {
        [kind === 'cities' ? 'country_id' : 'city_id']:
          'Cette destination parente est indisponible.',
      },
    };
  }
  if (code === '23514') {
    if (message.includes('countries_iso_required'))
      return { fields: { iso_code: 'Renseignez le code ISO du pays.' } };
    if (message.includes('disabled for this city'))
      return { fields: { city_id: 'La ville choisie doit avoir activé les quartiers.' } };
    if (message.includes('before disabling'))
      return {
        fields: {
          has_neighborhoods:
            'Réaffectez les fiches concernées et déplacez ou supprimez tous les quartiers avant de désactiver ce mode.',
        },
      };
    if (message.includes('before enabling'))
      return {
        fields: {
          has_neighborhoods:
            'Réorganisez les fiches rattachées directement à la ville avant d’activer les quartiers.',
        },
      };
  }
  if (code === '42501') return { error: 'Cette action est réservée à l’administration Nagi.' };
  console.error('Échec de mutation géographique.', { code, kind });
  return { error: 'L’opération a échoué. Réessayez dans quelques instants.' };
}

export async function saveDestination(
  kind: DestinationKind,
  id: string | null,
  version: string | null,
  form: FormData,
): Promise<DestinationActionState> {
  await requireAdmin();
  if (
    !destinationKindSchema.safeParse(kind).success ||
    (id !== null && !destinationIdSchema.safeParse(id).success)
  )
    return { error: 'Destination invalide.' };

  const values = Object.fromEntries(form.entries());
  const parsed = destinationInputs[kind].safeParse({ ...values, slug: values.slug || values.name });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] ??= issue.message;
    return { fields };
  }

  const db = await sessionDatabase();
  const previous = id ? await new GeographyService(db).get(kind, id) : null;
  if (id && (!previous || previous.updated_at !== version))
    return { error: 'Cette destination a changé. Actualisez la page avant de réessayer.' };

  const destinationId = id ?? randomUUID();
  const file = form.get('cover');
  let uploaded: string | undefined;
  if (file !== null) {
    const image = coverFileSchema(maxCoverSize()).safeParse(file);
    if (!image.success) return { fields: { cover: image.error.issues[0]!.message } };
    let optimized: Buffer;
    try {
      optimized = await optimizeCover(image.data);
    } catch {
      return {
        fields: {
          cover:
            'Cette image ne peut pas être lue. Choisissez une image statique valide, de 36 mégapixels maximum.',
        },
      };
    }
    uploaded = coverUrl(kind, destinationId, randomUUID());
    const { error } = await uploadCover(uploaded, optimized);
    if (error)
      return {
        fields: { cover: 'Le transfert de l’image a échoué. Réessayez dans quelques instants.' },
      };
  }

  const cover =
    uploaded ?? (form.get('remove_cover') === 'true' ? null : (previous?.cover_image_url ?? null));
  const payload = { ...parsed.data, cover_image_url: cover };
  const insert = { ...payload, id: destinationId };
  const result = previous
    ? await db
        .from(kind)
        .update(payload)
        .eq('id', destinationId)
        .eq('updated_at', previous.updated_at)
        .select('id')
        .maybeSingle()
    : 'iso_code' in insert
      ? await db.from('countries').insert(insert).select('id').single()
      : 'country_id' in insert
        ? await db.from('cities').insert(insert).select('id').single()
        : await db.from('neighborhoods').insert(insert).select('id').single();

  if (result.error) {
    // A timeout or gateway error can leave the commit status unknown. Keep the object in that case.
    if (result.status >= 400 && result.status < 500) await removeCover(uploaded);
    return mutationError(result.error, kind);
  }
  if (!result.data) {
    await removeCover(uploaded);
    return { error: 'Cette destination a changé. Actualisez la page avant de réessayer.' };
  }
  if (previous?.cover_image_url !== cover) await removeCover(previous?.cover_image_url);
  refreshCatalog();
  return {
    success: previous ? 'Modifications enregistrées.' : 'Destination créée.',
    href: previous ? undefined : `/admin/${kind}/${destinationId}`,
  };
}

export async function manageDestination(
  kind: DestinationKind,
  id: string,
  version: string,
  operation: 'publish' | 'unpublish' | 'delete',
): Promise<DestinationActionState> {
  await requireAdmin();
  if (
    !destinationKindSchema.safeParse(kind).success ||
    !destinationIdSchema.safeParse(id).success ||
    !['publish', 'unpublish', 'delete'].includes(operation)
  )
    return { error: 'Action invalide.' };
  const db = await sessionDatabase();
  const query =
    operation === 'delete'
      ? db.from(kind).delete()
      : db.from(kind).update({ is_published: operation === 'publish' });
  const result = await query
    .eq('id', id)
    .eq('updated_at', version)
    .select('cover_image_url')
    .maybeSingle();
  if (result.error) {
    const outcome = mutationError(result.error, kind, operation === 'delete');
    return { error: outcome.error ?? Object.values(outcome.fields ?? {})[0] };
  }
  if (!result.data)
    return { error: 'Cette destination a changé. Actualisez la page avant de réessayer.' };
  if (operation === 'delete') await removeCover(result.data.cover_image_url);
  refreshCatalog();
  return {
    success:
      operation === 'delete'
        ? 'Destination supprimée.'
        : operation === 'publish'
          ? 'Destination publiée.'
          : 'Publication retirée.',
  };
}

export async function findNeighborhoodCities(search: string) {
  await requireAdmin();
  if (typeof search !== 'string') return [];
  return new GeographyService(await sessionDatabase()).eligibleCities(search);
}
