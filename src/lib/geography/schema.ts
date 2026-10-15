import { photoCreditSchema } from "../photos/legacy";
import { z } from "zod";
import { coverUploadSchema, legacyPhotosSchema } from "../photos/schema";

export const destinationKinds = ["countries", "cities", "districts"] as const;
export type DestinationKind = (typeof destinationKinds)[number];
export const destinationLabels = { countries: "pays", cities: "ville", districts: "quartier" } as const;
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/, "Identifiant de destination invalide.");
export const continents = ["Afrique", "Amérique du Nord", "Amérique du Sud", "Asie", "Europe", "Océanie", "Antarctique"] as const;
const slug = z.string().trim().min(1, "Renseignez une adresse URL.").max(80, "Limitez l’adresse à 80 caractères.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Utilisez des lettres minuscules sans accents, des chiffres et des tirets.");
const base = z.object({
  name: z.string().trim().min(1, "Renseignez un nom.").max(120, "Limitez le nom à 120 caractères."),
  nativeName: z.string().trim().max(120).default(""), slug,
  summary: z.string().trim().min(1, "Ajoutez un résumé.").max(600, "Limitez le résumé à 600 caractères."),
  description: z.string().trim().min(1, "Ajoutez une présentation.").max(20_000, "Limitez la présentation à 20 000 caractères."),
  coverImage: z.string().max(250).default(""), coverPhoto: coverUploadSchema.optional(),
  status: z.enum(["draft", "published"]), visibility: z.enum(["public", "private"]).default("public"),
  sortOrder: z.number().int("Utilisez un nombre entier.").min(0, "L’ordre doit être positif ou nul.").max(1_000_000, "L’ordre doit être inférieur ou égal à 1 000 000.").default(0),
});
const countryFields = { isoCode: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/, "Utilisez un code ISO de deux lettres, par exemple JP.").default(""), continent: z.enum(["", ...continents]).default("") };
export const destinationInputSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("countries"), ...countryFields }).strict(),
  base.extend({ kind: z.literal("cities"), countryId: idSchema }).strict(),
  base.extend({ kind: z.literal("districts"), cityId: idSchema, slug: slug.refine((value) => value !== "explorer", "Cette adresse est réservée à la navigation du site.") }).strict(),
]);
export type DestinationInput = z.infer<typeof destinationInputSchema>;

export const photographSchema = z.object({ credit: photoCreditSchema.optional(), src: z.string().regex(/^\/images\/[a-z0-9-]+\.(jpg|png|webp)$/), alt: z.string().min(1).max(400), position: z.string().max(60), id: z.string().max(120).optional(), author: z.string().max(200).optional(), sourceUrl: z.url().max(1000).optional(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional() }).strict();
const editorialSchema = z.object({
  mood: z.string().max(300).optional(), region: z.string().max(200).optional(), caption: z.string().max(400).optional(),
  presentation: z.array(z.object({ label: z.string(), value: z.string() }).strict()).max(12).optional(),
  discoveryPhotograph: photographSchema.optional(), featurePhotograph: photographSchema.optional(),
}).strict();
const documentBase = base.omit({ coverImage: true }).extend({
  // Un ancien brouillon peut encore attendre sa présentation. L’écriture via
  // destinationInputSchema exige toujours ces textes avant l’enregistrement.
  summary: z.string().trim().max(600), description: z.string().trim().max(20_000),
  photos: legacyPhotosSchema.optional(),
  photoAssetIds: z.array(z.uuid()).max(13).default([]),
  id: idSchema, schemaVersion: z.literal(1), locale: z.literal("fr"),
  coverImage: photographSchema.nullable(), editorial: editorialSchema.nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), publishedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(), revision: z.number().int().positive(),
});
export const destinationDocumentSchema = z.discriminatedUnion("kind", [
  documentBase.extend({ kind: z.literal("countries"), ...countryFields }).strict(),
  documentBase.extend({ kind: z.literal("cities"), countryId: idSchema }).strict(),
  documentBase.extend({ kind: z.literal("districts"), cityId: idSchema }).strict(),
]).superRefine((item, context) => {
  if (item.status === "published") {
    for (const field of ["summary", "description"] as const) if (!item[field]) context.addIssue({ code: "custom", path: [field], message: "Complétez la présentation avant de publier." });
  }
  if (item.status === "published" && !item.publishedAt) context.addIssue({ code: "custom", path: ["publishedAt"], message: "Une destination publiée doit posséder sa date de première publication." });
  if (item.archivedAt && item.status !== "draft") context.addIssue({ code: "custom", path: ["status"], message: "Une archive doit rester en brouillon." });
  if (item.kind === "districts" && item.slug === "explorer") context.addIssue({ code: "custom", path: ["slug"], message: "Cette adresse est réservée." });
});
export type ManagedDestination = z.infer<typeof destinationDocumentSchema>;
export type ManagedCountry = Extract<ManagedDestination, { kind: "countries" }>;
export type ManagedCity = Extract<ManagedDestination, { kind: "cities" }>;
export type ManagedDistrict = Extract<ManagedDestination, { kind: "districts" }>;
export interface ManagedGeography { countries: ManagedCountry[]; cities: ManagedCity[]; districts: ManagedDistrict[] }

export function proposedSlug(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
}
export function destinationParentId(item: DestinationInput | ManagedDestination) {
  return item.kind === "countries" ? null : item.kind === "cities" ? item.countryId : item.cityId;
}
export function slugReservationId(item: DestinationInput | ManagedDestination) {
  return `${item.kind}:${destinationParentId(item) ?? "root"}:${item.slug}`;
}
export function ownPublication(item: ManagedDestination) {
  return item.status === "published" && item.visibility === "public" && item.archivedAt === null;
}
export function visibilityReason(item: ManagedDestination, geography: ManagedGeography): string | null {
  if (item.archivedAt) return "Archivé";
  if (item.status === "draft") return "Brouillon";
  if (item.visibility === "private") return "Privé";
  if (item.kind === "countries") return null;
  const city = item.kind === "districts" ? geography.cities.find((city) => city.id === item.cityId) : item;
  if (!city || !ownPublication(city)) return "Masqué : la ville parente n’est pas publique";
  const country = geography.countries.find((country) => country.id === city.countryId);
  return country && ownPublication(country) ? null : "Masqué : le pays parent n’est pas public";
}
