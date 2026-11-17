import { describe, expect, it } from 'vitest';
import {
  coverFileSchema,
  destinationInputs,
  destinationNamePattern,
  toDestinationSlug,
} from '../packages/shared/src/geography';
import { optimizeCover } from '../apps/web/src/features/geography/cover-image';

const basic = {
  name: ' Côte d’Ivoire ',
  slug: ' Côte d’Ivoire ',
  description: ' ',
  is_published: 'false',
  sort_order: '0',
};
const parent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Destination forms', () => {
  it('normalizes the slug and ISO code while defaulting empty descriptions to null', () => {
    expect(toDestinationSlug(' Île-de-France / Cœur ')).toBe('ile-de-france-coeur');
    expect(destinationInputs.countries.parse({ ...basic, iso_code: ' ci ' })).toMatchObject({
      name: 'Côte d’Ivoire',
      slug: 'cote-d-ivoire',
      iso_code: 'CI',
      description: null,
      is_published: false,
      sort_order: 0,
    });
    expect(destinationInputs.countries.safeParse({ ...basic, iso_code: 'CIV' }).success).toBe(
      false,
    );
    expect(
      destinationInputs.countries.safeParse({ ...basic, iso_code: 'CI', slug: '東京' }).success,
    ).toBe(false);
  });

  it('accepts optional decimal coordinates and rejects invalid coordinates and parent IDs', () => {
    const city = {
      ...basic,
      country_id: parent,
      has_neighborhoods: 'true',
      latitude: '35,68',
      longitude: '',
    };
    expect(destinationInputs.cities.parse(city)).toMatchObject({
      latitude: 35.68,
      longitude: null,
      has_neighborhoods: true,
    });
    expect(destinationInputs.cities.safeParse({ ...city, latitude: '91' }).success).toBe(false);
    expect(destinationInputs.cities.safeParse({ ...city, longitude: '0xAB' }).success).toBe(false);
    expect(destinationInputs.cities.safeParse({ ...city, country_id: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(destinationNamePattern('  100%_nagi  ')).toBe('%100\\%\\_nagi%');
  });
});

describe('Destination covers', () => {
  const pixels = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMoXna/eNl9BggFADV+B+HzP3zAAAAAAElFTkSuQmCC',
    'base64',
  );

  it('validates input limits and re-encodes an uploaded image as WebP', async () => {
    const image = new File([pixels], 'cover.png', { type: 'image/png' });
    expect(coverFileSchema(1024).safeParse(image).success).toBe(true);
    expect(coverFileSchema(12).safeParse(image).success).toBe(false);
    const output = await optimizeCover(image);
    expect(output.toString('ascii', 0, 4)).toBe('RIFF');
    expect(output.toString('ascii', 8, 12)).toBe('WEBP');
  });

  it('rejects unsupported types, disguised files and invalid image data', async () => {
    const svg = new File(['<svg/>'], 'cover.svg', { type: 'image/svg+xml' });
    expect(coverFileSchema(1024).safeParse(svg).success).toBe(false);
    await expect(
      optimizeCover(new File([pixels], 'cover.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow();
    await expect(
      optimizeCover(new File(['not an image'], 'cover.png', { type: 'image/png' })),
    ).rejects.toThrow();
  });
});
