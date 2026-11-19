import { z } from 'zod';
import { destinationIdSchema, toDestinationSlug } from './geography';
import { slugSchema } from './identifiers';

export const catalogFieldTypes = [
  'short_text',
  'long_text',
  'number',
  'boolean',
  'url',
  'date',
  'select',
  'multi_select',
  'buttons',
] as const;
export type CatalogFieldType = (typeof catalogFieldTypes)[number];
export const catalogButtonsLimit = 12;
export const catalogButtonsValue = z
  .array(
    z
      .object({
        label: z.string().trim().min(1).max(80),
        url: z
          .string()
          .trim()
          .max(2048)
          .refine((value) => Boolean(safeCatalogUrl(value))),
      })
      .strict(),
  )
  .max(catalogButtonsLimit);
export type CatalogButton = z.infer<typeof catalogButtonsValue>[number];
export type CatalogValue = string | number | boolean | string[] | CatalogButton[];

export const catalogIcons = {
  compass: 'Boussole',
  landmark: 'Monument',
  footprints: 'Marche',
  utensils: 'Couverts',
  'shopping-basket': 'Panier',
  'map-pin': 'Repère',
  mountain: 'Montagne',
  camera: 'Photo',
  coffee: 'Café',
  trees: 'Nature',
  tent: 'Camping',
  bike: 'Vélo',
  waves: 'Mer',
  train: 'Train',
  palette: 'Art',
  music: 'Musique',
  shopping: 'Boutique',
  ticket: 'Billet',
  bed: 'Hébergement',
  book: 'Livre',
  flower: 'Fleur',
  theater: 'Théâtre',
  heart: 'Cœur',
  sun: 'Soleil',
} as const;
export type CatalogIconName = keyof typeof catalogIcons;

const position = z.coerce.number().int().min(0).max(2147483647);
const label = (max: number) => z.string().trim().min(1, 'Saisissez un libellé.').max(max);
const slug = z.string().transform(toDestinationSlug).pipe(slugSchema);
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalId = z.union([z.literal('').transform(() => null), destinationIdSchema]);
const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value ? Number(value.replace(',', '.')) : null))
    .pipe(z.number().min(min).max(max).nullable());

export const catalogCategoryInput = z.object({
  name: label(80),
  slug,
  description: z.string().trim().max(1500),
  icon: z.custom<CatalogIconName>(
    (value) => typeof value === 'string' && Object.hasOwn(catalogIcons, value),
  ),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Choisissez une couleur valide.'),
  is_enabled: flag,
  position,
});

export const catalogFieldInput = z
  .object({
    icon: z
      .string()
      .trim()
      .max(80)
      .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/, 'Choisissez une icône valide.')
      .optional()
      .transform((value) => value || null),
    key: slug.pipe(z.string().max(80)),
    label: label(100),
    type: z.enum(catalogFieldTypes),
    is_required: flag,
    sort_order: position,
    options: z
      .string()
      .transform((value) =>
        value
          .split(/\r?\n/)
          .map((option) => option.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(100)).max(60)),
  })
  .superRefine((field, ctx) => {
    const multiple = field.type === 'select' || field.type === 'multi_select';
    if (
      multiple &&
      (!field.options.length || new Set(field.options).size !== field.options.length)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Ajoutez des options distinctes, une par ligne.',
      });
    }
  })
  .transform((field) => ({
    ...field,
    options: field.type === 'select' || field.type === 'multi_select' ? field.options : [],
  }));

export const catalogEntryInput = z.object({
  title: label(180),
  summary: z.string().trim().max(400),
  description: z.string().trim().max(20000),
  country_id: destinationIdSchema,
  city_id: destinationIdSchema,
  neighborhood_id: optionalId,
  category_id: destinationIdSchema,
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
  published: flag,
  sort_order: position,
});

export const catalogRelationTypeInput = z
  .object({
    name: label(100),
    slug,
    forward_label: label(120),
    inverse_label: z.string().trim().max(120).default(''),
    description: z.string().trim().max(1000).default(''),
    icon: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .or(z.literal('').transform(() => null))
      .default(null),
    is_enabled: flag.default(true),
    is_symmetric: flag,
    is_acyclic: flag,
    sort_order: position,
  })
  .transform((type) => ({
    ...type,
    inverse_label: type.is_symmetric ? type.forward_label : type.inverse_label,
  }))
  .refine((type) => type.is_symmetric || type.inverse_label.length > 0, {
    path: ['inverse_label'],
    message: 'Renseignez le libellé inverse.',
  })
  .refine((type) => !(type.is_symmetric && type.is_acyclic), {
    path: ['is_acyclic'],
    message: 'La prévention des cycles est réservée aux relations orientées.',
  });

export function catalogEntrySlug(title: string, id: string) {
  const base = toDestinationSlug(title).slice(0, 62).replace(/-$/, '') || 'fiche';
  return `${base}-${id.replaceAll('-', '')}`;
}

export function safeCatalogUrl(value: string) {
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.href;
  } catch {
    return null;
  }
}

export function readCatalogValue(
  field: { type: CatalogFieldType; options: string[]; label: string; is_required: boolean },
  raw: string[],
  published: boolean,
): CatalogValue | undefined {
  const value = raw[0]?.trim();
  if (field.type === 'buttons' && value) {
    let parsed;
    try {
      parsed = value.length <= 28000 ? catalogButtonsValue.safeParse(JSON.parse(value)) : undefined;
    } catch {
      // Invalid serialized values follow the same validation path as other fields.
    }
    if (!parsed?.success)
      throw new Error(`Vérifiez les libellés et les liens du champ « ${field.label} ».`);
    if (parsed.data.length) return parsed.data;
    if (field.is_required && published)
      throw new Error(`Ajoutez au moins un bouton dans « ${field.label} » avant de publier.`);
    return undefined;
  }
  if (!value) {
    if (field.is_required && published)
      throw new Error(`Renseignez « ${field.label} » avant de publier.`);
    return undefined;
  }
  switch (field.type) {
    case 'short_text':
      if (value.length <= 250) return value;
      break;
    case 'long_text':
      if (value.length <= 5000) return value;
      break;
    case 'number': {
      const number = Number(value.replace(',', '.'));
      if (/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value) && Number.isFinite(number))
        return number;
      break;
    }
    case 'boolean':
      if (value === 'true' || value === 'false') return value === 'true';
      break;
    case 'url':
      if (value.length <= 2048 && safeCatalogUrl(value)) return value;
      break;
    case 'date':
      if (z.iso.date().safeParse(value).success && !value.startsWith('0000-')) return value;
      break;
    case 'select':
      if (field.options.includes(value)) return value;
      break;
    case 'multi_select':
      if (new Set(raw).size === raw.length && raw.every((option) => field.options.includes(option)))
        return raw;
      break;
  }
  throw new Error(`Vérifiez la valeur du champ « ${field.label} ».`);
}
