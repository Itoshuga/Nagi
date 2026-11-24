import { describe, expect, it } from 'vitest';
import {
  automaticCommonsPhoto,
  matchPlaceName,
  matchesPhoto,
  searchNames,
} from '../apps/web/src/features/images/matching';
import { imageContextSchema, type OpenImage } from '../apps/web/src/features/images/model';
import { unsuitablePhoto } from '../apps/web/src/features/images/metadata';
const context = imageContextSchema.parse({
  name: 'Shibuya PARCO',
  city: 'Tokyo',
  country: 'Japan',
  neighborhood: 'Shibuya',
  category: 'shopping_mall',
  latitude: 35.6621,
  longitude: 139.6986,
});
const photo = {
  id: 'a',
  title: 'PARCO building in Shibuya',
  sourceId: 'PARCO - Tokyo.jpg',
  description: 'Shibuya shopping centre in Tokyo, Japan.',
  width: 1600,
  height: 1200,
  sourceCoordinates: { latitude: 35.6622, longitude: 139.6985 },
} as OpenImage;
describe('broader venue names with geographic confirmation', () => {
  it.each([
    'PARCO Shibuya',
    'Shibuya PARCO Store',
    'Shibuya PARCO Tokyo',
    'Shibuya PARCO Boutique',
  ])('accepts reordered or descriptive names: %s', (name) =>
    expect(matchPlaceName(context, name).rank).toBeGreaterThanOrEqual(2),
  );
  it('accepts category descriptors and small spelling differences', () => {
    expect(
      matchPlaceName({ ...context, name: 'Shinjuku Gyoen National Garden' }, 'Shinjuku Gyoen').rank,
    ).toBe(2);
    expect(
      matchPlaceName({ ...context, name: 'Pokmon Center SHIBUYA' }, 'Pokemon Centre Shibuya').rank,
    ).toBe(2);
    expect(matchPlaceName({ ...context, name: 'Musée du Louvre' }, 'Louvre Museum').rank).toBe(2);
  });
  it('uses explicit multilingual aliases', () =>
    expect(matchPlaceName({ ...context, aliases: ['渋谷PARCO'] }, '渋谷PARCO').rank).toBe(3));
  it.each(['Nintendo Shibuya', 'PARCO Shinjuku', 'PARCO Tokyo Tower', 'PARCO Shibuya 2'])(
    'rejects another identity or branch: %s',
    (name) => expect(matchPlaceName(context, name).rank).toBe(0),
  );
  it('does not reduce a museum to the city it is in', () =>
    expect(matchPlaceName({ ...context, name: 'Tokyo Museum' }, 'Tokyo').rank).toBe(0));
  it('allows one extra building name only as a partial match', () =>
    expect(
      matchPlaceName(
        { ...context, neighborhood: undefined, name: 'Pokémon Center SHIBUYA PARCO' },
        'Pokémon Center SHIBUYA',
      ).rank,
    ).toBe(1));
  it('searches cleaned names without losing the original', () =>
    expect(searchNames({ ...context, name: 'PARCO Shibuya (Tokyo)' })).toEqual(
      expect.arrayContaining(['PARCO Shibuya (Tokyo)', 'PARCO Shibuya']),
    ));
  it('matches photo identity across filename, caption and description', () =>
    expect(matchesPhoto(context, photo)).toBe(true));
  it('does not borrow a generic image of the same city', () =>
    expect(
      matchesPhoto(context, {
        ...photo,
        title: 'Tokyo street',
        sourceId: 'Tokyo.jpg',
        description: 'An ordinary shopping street in Japan',
      }),
    ).toBe(false));
  it('does not propose a namesake historic building as a photograph of a small shop', () => {
    expect(
      matchesPhoto(
        { ...context, name: 'Les Fleurs', city: 'Paris', category: 'shop' },
        {
          ...photo,
          title: 'Château des Fleurs, Paris',
          sourceId: 'Château des Fleurs, rue des Vignes.jpg',
          description: 'Vue de Paris, collection historique.',
        },
      ),
    ).toBe(false);
  });
  it('automatically chooses a named photo with close source coordinates', () =>
    expect(automaticCommonsPhoto(context, [photo])?.id).toBe('a'));
  it('keeps photos lacking coordinates and far-away namesakes out of automatic selection', () => {
    expect(automaticCommonsPhoto(context, [{ ...photo, sourceCoordinates: undefined }])).toBeNull();
    expect(
      automaticCommonsPhoto(context, [
        { ...photo, sourceCoordinates: { latitude: 48.85, longitude: 2.35 } },
      ]),
    ).toBeNull();
  });
  it('does not reject a current photo describing a historic building or a shop sign', () => {
    expect(
      unsuitablePhoto('Tokyo Tower 2025.jpg', 'Built in 1958; a logo is visible on the building.'),
    ).toBe(false);
    expect(unsuitablePhoto('Temple 1900.jpg')).toBe(true);
    expect(unsuitablePhoto('Company logo.jpg')).toBe(true);
  });
});
