import type { PublicGeography } from "../../types/destinations";
import { visibilityReason, type ManagedDestination, type ManagedGeography } from "./schema";

function place(item: ManagedDestination) {
  return { id: item.id, name: item.name, slug: item.slug, description: item.summary, introduction: item.description,
    mood: item.editorial?.mood ?? "", photograph: item.coverImage ?? { src: "/images/destination-placeholder.svg", alt: `Illustration Nagi — ${item.name} ne possède pas encore de photographie`, position: "50% 50%" } };
}
export function publicGeographyFromDocuments(data: ManagedGeography): PublicGeography {
  return {
    countries: data.countries.filter((item) => !visibilityReason(item, data)).map((item) => ({ ...place(item), region: item.continent || item.editorial?.region || "", presentation: item.editorial?.presentation ?? [] })),
    cities: data.cities.filter((item) => !visibilityReason(item, data)).map((item) => ({ ...place(item), countryId: item.countryId, region: item.editorial?.region ?? "", caption: item.editorial?.caption || item.name, discoveryPhotograph: item.editorial?.discoveryPhotograph, featurePhotograph: item.editorial?.featurePhotograph })),
    districts: data.districts.filter((item) => !visibilityReason(item, data)).map((item) => ({ ...place(item), cityId: item.cityId })),
  };
}
