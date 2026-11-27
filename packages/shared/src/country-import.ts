import { z } from 'zod';
import { destinationInputs } from './geography';

export const countryImportMaxBytes = 1024 * 1024;
export const countryImportMaxRows = 500;
export const countryImportExample = JSON.stringify(
  [
    { displayOrder: 1, name: 'Japon', iso: 'JP' },
    { displayOrder: 2, name: 'Côte d’Ivoire', iso: 'CI' },
  ],
  null,
  2,
);

const record = z
  .object({
    displayOrder: z
      .number({ error: 'L’ordre d’affichage doit être un nombre.' })
      .int('L’ordre doit être un entier.')
      .min(0, 'L’ordre doit être positif ou nul.')
      .max(2147483647, 'L’ordre d’affichage est trop élevé.'),
    name: z.string({ error: 'Le nom doit être un texte.' }),
    iso: z.string({ error: 'Le code ISO doit être un texte.' }),
  })
  .strict()
  .transform((value, ctx) => {
    const result = destinationInputs.countries.safeParse({
      name: value.name,
      slug: value.name,
      iso_code: value.iso,
      sort_order: String(value.displayOrder),
      description: '',
      is_published: 'false',
    });
    if (!result.success) {
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: [
            issue.path[0] === 'iso_code'
              ? 'iso'
              : issue.path[0] === 'slug'
                ? 'name'
                : issue.path[0] === 'sort_order'
                  ? 'displayOrder'
                  : String(issue.path[0]),
          ],
          message: issue.message,
        });
      return z.NEVER;
    }
    return { ...result.data, cover_image_url: null };
  });
export type ImportedCountry = z.output<typeof record>;
export type CountryImportResult =
  { ok: true; countries: ImportedCountry[] } | { ok: false; error: string; issues?: string[] };

/** Shared preview/server validation. Publication and addresses are always derived here. */
export function parseCountryImport(text: string): CountryImportResult {
  if (new TextEncoder().encode(text).byteLength > countryImportMaxBytes)
    return { ok: false, error: 'Le fichier ne doit pas dépasser 1 Mo.' };
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return {
      ok: false,
      error:
        'Le fichier ne contient pas un JSON valide. Mettez les noms des champs et les textes entre guillemets.',
    };
  }
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length || rows.length > countryImportMaxRows)
    return {
      ok: false,
      error: `Le fichier doit contenir entre 1 et ${countryImportMaxRows} pays.`,
    };
  const parsed = z.array(record).safeParse(rows);
  if (!parsed.success)
    return {
      ok: false,
      error: 'Corrigez le fichier avant de l’importer.',
      issues: parsed.error.issues
        .slice(0, 20)
        .map(
          (issue) =>
            `Pays ${Number(issue.path[0]) + 1} : ${issue.code === 'unrecognized_keys' ? 'seuls displayOrder, name et iso sont acceptés.' : issue.message}`,
        ),
    };
  const iso = new Map<string, number>(),
    slugs = new Map<string, number>(),
    issues: string[] = [];
  parsed.data.forEach((country, i) => {
    const priorIso = iso.get(country.iso_code),
      priorSlug = slugs.get(country.slug);
    if (priorIso !== undefined)
      issues.push(
        `Pays ${i + 1} : le code ISO ${country.iso_code} figure déjà au pays ${priorIso + 1}.`,
      );
    else if (priorSlug !== undefined)
      issues.push(
        `Pays ${i + 1} : l’adresse « ${country.slug} » est identique à celle du pays ${priorSlug + 1}.`,
      );
    iso.set(country.iso_code, i);
    slugs.set(country.slug, i);
  });
  return issues.length
    ? { ok: false, error: 'Le fichier contient des doublons.', issues: issues.slice(0, 20) }
    : { ok: true, countries: parsed.data };
}
