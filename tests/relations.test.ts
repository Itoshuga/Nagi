import { describe, expect, it, vi } from 'vitest';
import {
  groupCatalogRelations,
  relationEndpoints,
  relationLabel,
  relationOptions,
  relationReading,
} from '../packages/shared/src/relations';
import { catalogRelationTypeInput } from '../packages/shared/src/catalog';
import { listEntryRelations } from '../packages/database/src/catalog';
import type { NagiDatabase } from '../packages/database/src/client';
const type = {
  id: 'located',
  forward_label: 'Se situe dans',
  inverse_label: 'Abrite',
  is_symmetric: false,
};
describe('Shared semantic reading', () => {
  it('resolves both perspectives without making a second edge', () => {
    expect(
      relationReading('pokemon', 'pokemon', 'parco', type, { source: 'Pokémon', target: 'PARCO' }),
    ).toMatchObject({
      entry: 'PARCO',
      label: 'Se situe dans',
      inverseLabel: 'Abrite',
      direction: 'forward',
    });
    expect(
      relationReading('parco', 'pokemon', 'parco', type, { source: 'Pokémon', target: 'PARCO' }),
    ).toMatchObject({
      entry: 'Pokémon',
      label: 'Abrite',
      inverseLabel: 'Se situe dans',
      direction: 'inverse',
    });
    expect(
      relationReading('unrelated', 'pokemon', 'parco', type, {
        source: 'Pokémon',
        target: 'PARCO',
      }),
    ).toBeNull();
    expect(relationEndpoints('parco', 'pokemon', type, 'inverse')).toEqual({
      source_id: 'pokemon',
      target_id: 'parco',
    });
  });
  it('offers both asymmetric readings and one canonical symmetric choice', () => {
    const symmetric = {
      ...type,
      id: 'nearby',
      is_symmetric: true,
      forward_label: 'À proximité',
      inverse_label: 'Ignored legacy label',
    };
    expect(relationOptions([type, symmetric]).map((o) => o.label)).toEqual([
      'Se situe dans',
      'Abrite',
      'À proximité',
    ]);
    expect(relationLabel(symmetric, 'inverse')).toBe('À proximité');
    expect(relationEndpoints('z', 'a', symmetric, 'inverse')).toEqual({
      source_id: 'a',
      target_id: 'z',
    });
  });
  it('groups by contextual type and label rather than a generic relation heading', () => {
    const rows = [
      { id: 1, type, label: 'Se situe dans' },
      { id: 2, type, label: 'Abrite' },
      { id: 3, type, label: 'Abrite' },
    ];
    expect(groupCatalogRelations(rows).map(([, g]) => [g.label, g.relations.length])).toEqual([
      ['Se situe dans', 1],
      ['Abrite', 2],
    ]);
  });
  it('validates type settings and fills symmetric inverse labels automatically', () => {
    const raw = {
      name: 'À proximité',
      slug: 'custom-nearby',
      forward_label: 'À proximité',
      inverse_label: '',
      is_symmetric: 'true',
      is_acyclic: 'false',
      sort_order: '0',
      icon: 'map-pin',
      is_enabled: 'true',
    };
    expect(catalogRelationTypeInput.parse(raw)).toMatchObject({
      inverse_label: 'À proximité',
      is_enabled: true,
      description: '',
    });
    expect(catalogRelationTypeInput.safeParse({ ...raw, is_symmetric: 'false' }).success).toBe(
      false,
    );
    expect(catalogRelationTypeInput.safeParse({ ...raw, is_acyclic: 'true' }).success).toBe(false);
    expect(catalogRelationTypeInput.safeParse({ ...raw, icon: '../private.svg' }).success).toBe(
      false,
    );
  });
  it('resolves and sorts both ends in one database query, omitting RLS-hidden destinations', async () => {
    const rows = [
      {
        id: 'edge',
        source_id: 'pokemon',
        target_id: 'parco',
        updated_at: 'stamp',
        type: { ...type, sort_order: 0, name: 'Localisation' },
        source: { id: 'pokemon', title: 'Pokémon' },
        target: { id: 'parco', title: 'PARCO' },
      },
      {
        id: 'hidden',
        source_id: 'draft',
        target_id: 'parco',
        type,
        source: null,
        target: { id: 'parco', title: 'PARCO' },
      },
    ];
    const query = {
      select: vi.fn(() => query),
      or: vi.fn(() => query),
      order: vi.fn(async () => ({ data: rows, error: null })),
    };
    const from = vi.fn(() => query);
    const result = await listEntryRelations({ from } as unknown as NagiDatabase, 'parco');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'edge',
      label: 'Abrite',
      entry: { id: 'pokemon' },
      updated_at: 'stamp',
    });
    expect(from).toHaveBeenCalledTimes(1);
  });
});
