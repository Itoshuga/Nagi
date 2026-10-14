import type { PublicGeography } from "../types/destinations";
import { staticGeography } from "./destinations";
import { cityPath, countryPath, districtPath, getDistrictsByCity } from "./destinations";
import type { GeographicReference, LocalDestination, UniverseSlug } from "../types/discoveries";
import { destinationExplorationPath } from "./universe-navigation";

export function resolveGeography(reference: GeographicReference, geography: PublicGeography = staticGeography) {
  const { countries, cities, districts } = geography;
  const district = reference.kind === "district" ? districts.find((item) => item.id === reference.id) : undefined;
  const city = reference.kind === "city" ? cities.find((item) => item.id === reference.id) : district ? cities.find((item) => item.id === district.cityId) : undefined;
  const country = reference.kind === "country" ? countries.find((item) => item.id === reference.id) : city ? countries.find((item) => item.id === city.countryId) : undefined;
  if (!country || (reference.kind !== "country" && !city) || (reference.kind === "district" && !district)) return undefined;
  const place = district ?? city ?? country;
  const path = district && city ? districtPath(country, city, district) : city ? cityPath(country, city) : countryPath(country);
  const hasDistricts = reference.kind === "city" && !!city && getDistrictsByCity(city.id, geography).length > 0;
  return { reference, country, city, district, name: place.name, path, hasDistricts, label: [district?.name, city?.name, country.name].filter(Boolean).join(" · ") };
}

// Les contenus de quartier remontent à leur ville. Un contenu associé seulement
// à la ville ou au pays ne descend pas implicitement dans chaque quartier.
export function belongsToDestination(association: GeographicReference, scope: GeographicReference, geography: PublicGeography = staticGeography): boolean {
  if (association.kind === scope.kind && association.id === scope.id) return true;
  const resolved = resolveGeography(association, geography);
  if (!resolved || !resolveGeography(scope, geography)) return false;
  return scope.kind === "country" ? resolved.country.id === scope.id : scope.kind === "city" && resolved.city?.id === scope.id;
}

export function explorerPath(scope: LocalDestination, universe: UniverseSlug, geography: PublicGeography = staticGeography): string {
  const destination = resolveGeography(scope, geography);
  if (!destination) throw new Error(`Destination inconnue : ${scope.id}`);
  return destinationExplorationPath(destination, universe);
}

export function getLocalDestinations(geography: PublicGeography = staticGeography): LocalDestination[] {
  const { cities, districts } = geography;
  return [...cities.map((city): LocalDestination => ({ kind: "city", id: city.id })), ...districts.map((district): LocalDestination => ({ kind: "district", id: district.id }))];
}

export function getNavigationContexts(geography: PublicGeography = staticGeography) {
  return getLocalDestinations(geography).flatMap((reference) => {
    const scope = resolveGeography(reference, geography);
    return scope ? [{ key: reference.id, name: scope.name, path: scope.path, hasDistricts: scope.hasDistricts }] : [];
  });
}
