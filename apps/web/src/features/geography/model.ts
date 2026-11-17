import { destinationIdSchema, type DestinationKind } from '@nagi/shared';

export const selectClass =
  'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50';

export const destinationLabels = {
  countries: { plural: 'Pays', singular: 'pays', add: 'Ajouter un pays', published: 'Publié' },
  cities: { plural: 'Villes', singular: 'ville', add: 'Ajouter une ville', published: 'Publiée' },
  neighborhoods: {
    plural: 'Quartiers',
    singular: 'quartier',
    add: 'Ajouter un quartier',
    published: 'Publié',
  },
} satisfies Record<
  DestinationKind,
  { plural: string; singular: string; add: string; published: string }
>;

export type SearchParams = Record<string, string | string[] | undefined>;
export type Breadcrumb = { label: string; href?: string };

export function firstParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function pageParam(params: SearchParams) {
  const page = Number(firstParam(params, 'page'));
  return Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1;
}

export function idParam(params: SearchParams, key: string) {
  return destinationIdSchema.safeParse(firstParam(params, key)).data;
}

export function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.size ? `${path}?${query}` : path;
}

export function coverUrl(kind: DestinationKind, id: string, version: string) {
  return `/app/catalog-cover/${kind}/${id}/${version}`;
}
