import { relationSearchInput } from '@nagi/shared';
import {
  searchCatalogEntries,
  searchCatalogLocations,
  suggestRelationEntries,
} from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  await requireAdmin();
  const params = relationSearchInput.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!params.success)
    return Response.json({ error: 'Recherche invalide.' }, { status: 400, headers });
  const values = params.data;
  if (
    (values.mode === 'entries' && !values.exclude) ||
    (values.mode === 'locations' && !values.kind)
  )
    return Response.json({ error: 'Recherche invalide.' }, { status: 400, headers });
  try {
    const db = await sessionDatabase();
    if (values.mode === 'locations')
      return Response.json(
        {
          rows: await searchCatalogLocations(
            db,
            values.kind!,
            values.q,
            values.parent,
            request.signal,
          ),
          hasMore: false,
        },
        { headers },
      );
    if (
      !values.q &&
      !values.category &&
      !values.country &&
      !values.city &&
      !values.neighborhood &&
      values.page === 0
    )
      return Response.json(
        {
          rows: await suggestRelationEntries(db, values.exclude!, request.signal),
          hasMore: false,
          suggested: true,
        },
        { headers },
      );
    return Response.json(
      {
        ...(await searchCatalogEntries(db, values.q, values.exclude!, values.category, {
          countryId: values.country,
          cityId: values.city,
          neighborhoodId: values.neighborhood,
          page: values.page,
          signal: request.signal,
        })),
        suggested: false,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'La recherche est indisponible. Réessayez.' },
      { status: request.signal.aborted ? 499 : 503, headers },
    );
  }
}
