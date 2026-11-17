import { z } from 'zod';
import { slugSchema } from './identifiers';

export const destinationKindSchema = z.enum(['countries', 'cities', 'neighborhoods']);
export type DestinationKind = z.infer<typeof destinationKindSchema>;
export const destinationIdSchema = z.uuid('Sélectionnez une destination valide.');
export const coverMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const coverMebibyte = 1024 * 1024;
export const coverLimitMib = z.coerce.number().int().min(1).max(8).default(8);

export function toDestinationSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae')
    .replaceAll('ß', 'ss')
    .replaceAll('ø', 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Escape LIKE metacharacters while leaving room for an infix search.
export function destinationNamePattern(value: string) {
  return `%${value
    .trim()
    .slice(0, 100)
    .replace(/[\\%_*]/g, '\\$&')}%`;
}

const publication = z.enum(['true', 'false']).transform((value) => value === 'true');
const base = z
  .object({
    name: z.string().trim().min(1, 'Saisissez un nom.').max(100, '100 caractères maximum.'),
    slug: z.string().transform(toDestinationSlug).pipe(slugSchema).catch(''),
    description: z
      .string()
      .trim()
      .max(5000, '5 000 caractères maximum.')
      .transform((value) => value || null),
    is_published: publication,
    sort_order: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Saisissez un entier positif ou zéro.')
      .transform(Number)
      .pipe(z.number().int().min(0).max(2147483647, 'Position trop élevée.')),
  })
  .refine((value) => Boolean(value.slug), {
    path: ['slug'],
    message:
      'Saisissez une adresse contenant des lettres de a à z ou des chiffres, sur 100 caractères maximum.',
  });

function coordinate(min: number, max: number) {
  return z
    .string()
    .trim()
    .regex(/^(?:[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))?$/, 'Saisissez une coordonnée décimale.')
    .transform((value) => (value === '' ? null : Number(value.replace(',', '.'))))
    .pipe(
      z
        .number({ error: `Saisissez un nombre entre ${min} et ${max}.` })
        .min(min, `Minimum ${min}.`)
        .max(max, `Maximum ${max}.`)
        .nullable(),
    );
}

const coordinates = { latitude: coordinate(-90, 90), longitude: coordinate(-180, 180) };
export const destinationInputs = {
  countries: base.safeExtend({
    iso_code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Saisissez les deux lettres du code ISO.'),
  }),
  cities: base.safeExtend({
    ...coordinates,
    country_id: destinationIdSchema,
    has_neighborhoods: publication,
  }),
  neighborhoods: base.safeExtend({ ...coordinates, city_id: destinationIdSchema }),
};

export function coverFileSchema(maxSize: number) {
  return z
    .file('Choisissez une image.')
    .min(1, 'Cette image est vide.')
    .max(maxSize, `L’image ne doit pas dépasser ${maxSize / coverMebibyte} Mo.`)
    .mime([...coverMimeTypes], 'Choisissez une image JPEG, PNG ou WebP.');
}
