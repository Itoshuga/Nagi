import { z } from 'zod';
import { destinationIdSchema, destinationKindSchema } from './geography';

export const relationSearchInput = z.object({
  mode: z.enum(['entries', 'locations']).default('entries'),
  q: z.string().trim().max(180).default(''),
  exclude: destinationIdSchema.optional(),
  category: destinationIdSchema.optional(),
  country: destinationIdSchema.optional(),
  city: destinationIdSchema.optional(),
  neighborhood: destinationIdSchema.optional(),
  kind: destinationKindSchema.optional(),
  parent: destinationIdSchema.optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});

export type RelationDirection = 'forward' | 'inverse';
export type SemanticRelationType = {
  id: string;
  forward_label: string;
  inverse_label: string;
  is_symmetric: boolean;
};
export function relationLabel(type: SemanticRelationType, direction: RelationDirection) {
  return type.is_symmetric || direction === 'forward' ? type.forward_label : type.inverse_label;
}
export function relationOptions<T extends SemanticRelationType>(types: T[]) {
  return types.flatMap((type) =>
    (type.is_symmetric ? ['forward'] : ['forward', 'inverse']).map((direction) => ({
      value: `${type.id}:${direction}`,
      type,
      direction: direction as RelationDirection,
      label: relationLabel(type, direction as RelationDirection),
    })),
  );
}
export function relationEndpoints(
  current: string,
  other: string,
  type: SemanticRelationType,
  direction: RelationDirection,
) {
  const pair = direction === 'inverse' ? [other, current] : [current, other];
  if (type.is_symmetric) pair.sort();
  return { source_id: pair[0]!, target_id: pair[1]! };
}
export function relationReading<T>(
  current: string,
  source: string,
  target: string,
  type: SemanticRelationType,
  entries: { source: T | null; target: T | null },
) {
  const id = current.toLowerCase();
  if (id !== source.toLowerCase() && id !== target.toLowerCase()) return null;
  const isIncoming = target.toLowerCase() === id;
  const direction: RelationDirection = isIncoming && !type.is_symmetric ? 'inverse' : 'forward';
  return {
    entry: isIncoming ? entries.source : entries.target,
    isIncoming,
    direction,
    label: relationLabel(type, direction),
    inverseLabel: relationLabel(type, direction === 'forward' ? 'inverse' : 'forward'),
  };
}
export function groupCatalogRelations<T extends { type: { id: string }; label: string }>(
  relations: T[],
) {
  const groups = new Map<string, { label: string; relations: T[] }>();
  for (const relation of relations) {
    const key = `${relation.type.id}:${relation.label}`;
    const group = groups.get(key);
    if (group) group.relations.push(relation);
    else groups.set(key, { label: relation.label, relations: [relation] });
  }
  return [...groups.entries()];
}
export const entryRelationInput = z.object({
  target: destinationIdSchema,
  type: destinationIdSchema,
  direction: z.enum(['forward', 'inverse']),
  updated_at: z
    .union([z.literal('').transform(() => null), z.iso.datetime({ offset: true })])
    .default(''),
});
