import { importedPhotograph } from "../photo-credit";
import { countries, cities, districts } from "../geography";
import { destinationDocumentSchema, type ManagedDestination } from "../../../src/lib/geography/schema";

// Les textes, identifiants et photographies proviennent exclusivement du carnet
// existant. Les métadonnées datent l’import, pas une création éditoriale supposée.
export function demonstrationDestinations(now = new Date().toISOString()): ManagedDestination[] {
  return [
    ...countries.map((item, index) => ({ ...item, kind: "countries" as const, sortOrder: index })),
    ...cities.map((item, index) => ({ ...item, kind: "cities" as const, sortOrder: index })),
    ...districts.map((item, index) => ({ ...item, kind: "districts" as const, sortOrder: index })),
  ].map((item) => destinationDocumentSchema.parse({
    id: item.id, kind: item.kind, name: item.name, nativeName: "", slug: item.slug,
    summary: item.description, description: item.introduction, coverImage: importedPhotograph(item.photograph),
    ...(item.kind === "countries" ? { isoCode: "", continent: "" } : item.kind === "cities" ? { countryId: item.countryId } : { cityId: item.cityId }),
    editorial: {
      mood: item.mood,
      ...("region" in item ? { region: item.region } : {}),
      ...("presentation" in item ? { presentation: item.presentation } : {}),
      ...("caption" in item ? { caption: item.caption } : {}),
      ...("discoveryPhotograph" in item && item.discoveryPhotograph ? { discoveryPhotograph: importedPhotograph(item.discoveryPhotograph) } : {}),
      ...("featurePhotograph" in item && item.featurePhotograph ? { featurePhotograph: importedPhotograph(item.featurePhotograph) } : {}),
    },
    status: "published", visibility: "public", sortOrder: item.sortOrder,
    schemaVersion: 1, locale: "fr", revision: 1, createdAt: now, updatedAt: now, publishedAt: now, archivedAt: null,
  }));
}
