import { countries, cities, districts } from "../../data/geography";
import type { GeographicReference } from "../../types/discoveries";
import type { ManagedGeography } from "../geography/schema";

function unique<T extends { id: string; slug: string }>(items: T[], id: string | undefined, slug: string | undefined) {
  const exact = items.find((item) => item.id === id); if (exact) return exact;
  const matches = slug ? items.filter((item) => item.slug === slug) : [];
  return matches.length === 1 ? matches[0] : undefined;
}
export function remapDemonstrationDestination(reference: GeographicReference, geography: ManagedGeography): GeographicReference | null {
  const originalDistrict = reference.kind === "district" ? districts.find((item) => item.id === reference.id) : undefined;
  const originalCity = reference.kind === "city" ? cities.find((item) => item.id === reference.id) : originalDistrict ? cities.find((item) => item.id === originalDistrict.cityId) : undefined;
  const originalCountry = reference.kind === "country" ? countries.find((item) => item.id === reference.id) : originalCity ? countries.find((item) => item.id === originalCity.countryId) : undefined;
  const country = unique(geography.countries, originalCountry?.id, originalCountry?.slug);
  const city = originalCity && country ? unique(geography.cities.filter((item) => item.countryId === country.id), originalCity.id, originalCity.slug) : undefined;
  const district = originalDistrict && city ? unique(geography.districts.filter((item) => item.cityId === city.id), originalDistrict.id, originalDistrict.slug) : undefined;
  const result = reference.kind === "country" ? country : reference.kind === "city" ? city : district;
  return result ? { kind: reference.kind, id: result.id } : null;
}
