import { photoCreditSchema } from "../photos/legacy";
import { z } from "zod";
import { coverUploadSchema, legacyPhotosSchema } from "../photos/schema";
import { idSchema } from "../geography/schema";
import { universeSlugs } from "../../types/discoveries";
import { normalizeSearch } from "../discovery-filter";

const text = (max = 4000) => z.string().trim().max(max).default("");
const url = z.union([z.literal(""), z.url().max(1000).refine((value) => ["https:", "http:"].includes(new URL(value).protocol), "Utilisez une adresse http ou https.")]).default("");
const list = z.array(z.string().trim().min(1).max(300)).max(40).refine((items) => new Set(items).size === items.length, "Retirez les doublons.").default([]);
export const referenceSchema = z.object({ kind: z.enum(["country", "city", "district"]), id: idSchema }).strict();
export const contentReferenceSchema = z.object({ id: idSchema, type: z.enum(universeSlugs) }).strict();
const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().nullable().default(null);
const reservation = z.enum(["", "required", "recommended", "not-required"]).default("");
export const classifications = {
  tourisme: ["Monument", "Temple ou sanctuaire", "Parc ou jardin", "Musée", "Site historique", "Point de vue", "Spot photographique", "Rue remarquable", "Shopping", "Nature", "Autre"],
  activites: ["Atelier artisanal", "Expérience culturelle", "Spectacle", "Événement sportif", "Excursion", "Expérience gastronomique", "Loisirs", "Activité traditionnelle", "Autre"],
  gastronomie: ["Plat", "Dessert", "Pâtisserie", "Boisson", "Confiserie", "Autre"],
  adresses: ["Restaurant", "Café", "Salon de thé", "Confiserie", "Pâtisserie", "Boulangerie", "Boutique", "Marché", "Établissement culturel", "Autre"],
} as const;
const category = z.string().trim().min(1, "Choisissez une catégorie.").max(100);
export const detailSchemas = {
  tourisme: z.object({ category, history: text(12000), features: text(), address: text(600), coordinates, visitDuration: text(200), admission: z.enum(["", "free", "paid", "mixed"]).default(""), price: text(300), openingHours: text(1500), officialUrl: url, access: text(), tips: text() }).strict(),
  activites: z.object({ category, experience: text(), format: z.enum(["editorial-idea", "offered-experience"]).default("editorial-idea"), duration: text(200), budget: text(300), reservation, bookingUrl: url, conditions: text(), audience: list, additionalInformation: text() }).strict(),
  gastronomie: z.object({ category: z.enum(classifications.gastronomie), originalName: text(200), transliteration: text(200), origins: text(1000), history: text(12000), ingredients: list, preparation: text(), variants: list, culturalNotes: text() }).strict(),
  adresses: z.object({ category, mainSpecialty: text(300), postalAddress: text(600), coordinates, openingHours: text(1500), closedDays: text(500), budget: text(300), waitingTime: text(300), reservation, website: url, bookingUrl: url, tips: text() }).strict(),
};
const base = z.object({
  title: z.string().trim().min(1, "Renseignez un titre.").max(160),
  slug: z.string().min(1, "Renseignez une adresse URL.").max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Utilisez des minuscules, des chiffres et des tirets."),
  coverPhoto: coverUploadSchema.optional(),
  summary: text(600), description: text(20000), coverImage: text(250),
  coverPresentation: z.object({ alt: z.string().min(1).max(400), position: z.string().max(60) }).strict().nullable().default(null),
  photographCaption: text(600), tags: list,
  status: z.enum(["draft", "published"]), visibility: z.enum(["public", "private"]).default("public"),
  destinations: z.array(referenceSchema).max(30).default([]),
  sources: z.array(z.object({ label: z.string().min(1).max(200), url: url.refine(Boolean, "Renseignez une adresse.") }).strict()).max(20).default([]),
  verifiedAt: z.union([z.literal(""), z.iso.date(), z.iso.datetime()]).default(""),
});
const variants = [
  base.extend({ type: z.literal("tourisme"), details: detailSchemas.tourisme }).strict(),
  base.extend({ type: z.literal("activites"), details: detailSchemas.activites }).strict(),
  base.extend({ type: z.literal("gastronomie"), details: detailSchemas.gastronomie }).strict(),
  base.extend({ type: z.literal("adresses"), details: detailSchemas.adresses }).strict(),
] as const;
function validate(item: z.infer<typeof base> & { type: string }, context: z.RefinementCtx) {
  if (new Set(item.destinations.map((ref) => `${ref.kind}:${ref.id}`)).size !== item.destinations.length) context.addIssue({ code: "custom", path: ["destinations"], message: "Retirez les destinations en double." });
  if (item.type !== "gastronomie" && (item.destinations.length > 1 || item.destinations.some((ref) => ref.kind === "country"))) context.addIssue({ code: "custom", path: ["destinations"], message: "Choisissez une ville et, si utile, son quartier." });
  if (item.status === "published") {
    for (const field of ["summary", "description"] as const) if (!item[field]) context.addIssue({ code: "custom", path: [field], message: "Complétez ce texte avant de publier." });
    if (!item.destinations.length) context.addIssue({ code: "custom", path: ["destinations"], message: "Choisissez une destination avant de publier." });
  }
}
export const contentInputSchema = z.discriminatedUnion("type", variants).superRefine(validate);
export type ContentInput = z.infer<typeof contentInputSchema>;
const metadata = { coverCredit: photoCreditSchema.nullable().optional(), images: z.array(z.string().max(250)).max(12).default([]), imageCaptions: z.array(z.string().max(600)).max(12).default([]), photos: legacyPhotosSchema.optional(), photoAssetIds: z.array(z.uuid()).max(13).default([]), id: idSchema, schemaVersion: z.literal(1), locale: z.literal("fr"), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), publishedAt: z.iso.datetime().nullable(), archivedAt: z.iso.datetime().nullable(), revision: z.number().int().positive(), searchTitle: z.string().max(200), geographyKeys: z.array(z.string().max(150)).max(90), isArchived: z.boolean() };
export const contentDocumentSchema = z.discriminatedUnion("type", [variants[0].extend(metadata), variants[1].extend(metadata), variants[2].extend(metadata), variants[3].extend(metadata)]).superRefine((item, context) => {
  validate(item, context);
  if (item.isArchived !== Boolean(item.archivedAt) || item.archivedAt && item.status !== "draft") context.addIssue({ code: "custom", message: "Archive incohérente." });
  if (item.status === "published" && !item.publishedAt) context.addIssue({ code: "custom", message: "Date de publication manquante." });
  if (item.searchTitle !== normalizeSearch(item.title)) context.addIssue({ code: "custom", message: "Index de titre incohérent." });
});
export type ManagedContent = z.infer<typeof contentDocumentSchema>;
export type ContentType = ContentInput["type"];
export type ContentReference = z.infer<typeof contentReferenceSchema>;
export const contentKey = (item: ContentReference) => `${item.type}:${item.id}`;
export const relationSchema = z.object({ id: z.string().min(1).max(300), kind: z.enum(["serves", "hosts"]), source: contentReferenceSchema, target: contentReferenceSchema, memberKeys: z.array(z.string()).length(2) }).strict();
export type ContentRelation = z.infer<typeof relationSchema>;
export function relationBetween(a: ContentReference, b: ContentReference): ContentRelation | null {
  let source: ContentReference, target: ContentReference, kind: ContentRelation["kind"];
  if (a.type === "adresses" && b.type === "gastronomie" || a.type === "gastronomie" && b.type === "adresses") {
    source = a.type === "adresses" ? a : b; target = a.type === "gastronomie" ? a : b; kind = "serves";
  } else if (a.type === "activites" && ["tourisme", "adresses"].includes(b.type) || b.type === "activites" && ["tourisme", "adresses"].includes(a.type)) {
    source = a.type === "activites" ? a : b; target = a.type === "activites" ? b : a; kind = "hosts";
  } else return null;
  // Les arguments peuvent être des documents complets côté migration. Une
  // relation ne stocke que l’identité, jamais une copie du contenu de ses cibles.
  return { id: `${contentKey(source)}~${contentKey(target)}`, kind, source: { id: source.id, type: source.type }, target: { id: target.id, type: target.type }, memberKeys: [contentKey(source), contentKey(target)] };
}
