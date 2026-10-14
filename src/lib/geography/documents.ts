import { z } from "zod";
import { geographicCover } from "../../data/geographic-covers";
import { destinationDocumentSchema, destinationInputSchema, idSchema, type DestinationKind, type ManagedDestination } from "./schema";

// Format historique : collection comme type, image sous forme de chemin et
// aucune métadonnée de version. Ne pas assouplir les documents déjà versionnés.
const legacyFields = {
  id: idSchema, summary: z.string().trim().max(600), description: z.string().trim().max(20_000),
  coverImage: z.string().max(250), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable().optional(), archivedAt: z.iso.datetime().nullable().default(null),
};
const unusedCountryFields = { isoCode: z.literal("").optional(), continent: z.literal("").optional() };
const legacySchemas = {
  countries: destinationInputSchema.options[0].omit({ kind: true }).extend(legacyFields).strict(),
  cities: destinationInputSchema.options[1].omit({ kind: true }).extend({ ...legacyFields, ...unusedCountryFields }).strict(),
  districts: destinationInputSchema.options[2].omit({ kind: true }).extend({ ...legacyFields, ...unusedCountryFields }).strict(),
};

export function decodeDestinationDocument(kind: DestinationKind, id: string, raw: unknown): ManagedDestination | null {
  const current = destinationDocumentSchema.safeParse(raw);
  if (current.success) return current.data.kind === kind && current.data.id === id ? current.data : null;

  const legacy = legacySchemas[kind].safeParse(raw);
  if (!legacy.success || legacy.data.id !== id) return null;
  const { isoCode, continent, ...data } = legacy.data;
  const coverImage = data.coverImage ? geographicCover(data.coverImage) : null;
  if (data.coverImage && !coverImage) return null;
  const normalized = destinationDocumentSchema.safeParse({
    ...data, ...(kind === "countries" ? { isoCode, continent } : {}), kind,
    schemaVersion: 1, locale: "fr", revision: 1, editorial: null, coverImage,
    publishedAt: data.publishedAt ?? (data.status === "published" ? data.updatedAt : null),
  });
  // Cette adaptation reste en mémoire ; seule une sauvegarde volontaire écrit
  // ensuite le format courant, avec les mêmes identifiants et relations.
  return normalized.success ? normalized.data : null;
}
