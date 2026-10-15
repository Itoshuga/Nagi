import type { PublicGeography } from "../types/destinations";
import { universeSlugs, type ActivityDiscovery, type AddressDiscovery, type Discovery, type DiscoveryCardData, type FoodDiscovery, type GeographicReference, type LocalDestination, type UniverseSlug } from "../types/discoveries";
import { belongsToDestination, resolveGeography } from "./discovery-geography";

export function isUniverse(value: string): value is UniverseSlug {
  return (universeSlugs as readonly string[]).includes(value);
}

export function getPublishedDiscoveries(catalogue: readonly Discovery[]): Discovery[] {
  return catalogue.filter((item) => item.status === "published");
}

export function getDiscoveryBySlug(universe: string, slug: string, catalogue: readonly Discovery[]): Discovery | undefined {
  return catalogue.find((item) => item.status === "published" && item.universe === universe && item.slug === slug);
}

export function getDiscoveryById(id: string, catalogue: readonly Discovery[]): Discovery | undefined {
  return catalogue.find((item) => item.status === "published" && item.id === id);
}

export function getDiscoveryGeography(item: Discovery): readonly GeographicReference[] {
  return item.universe === "gastronomie" ? item.destinations : [item.location];
}

export function getDiscoveriesForDestination(scope: GeographicReference, universe: UniverseSlug | undefined, catalogue: readonly Discovery[], geography: PublicGeography): Discovery[] {
  if (!resolveGeography(scope, geography)) return [];
  // filter, plutôt que flatMap des associations : une fiche ne ressort qu’une fois.
  return getPublishedDiscoveries(catalogue).filter((item) => (!universe || item.universe === universe) && getDiscoveryGeography(item).some((reference) => belongsToDestination(reference, scope, geography)));
}

export function getAddressesForSpecialty(specialtyId: string, catalogue: readonly Discovery[]): AddressDiscovery[] {
  const specialty = getDiscoveryById(specialtyId, catalogue);
  if (specialty?.universe !== "gastronomie") return [];
  return getPublishedDiscoveries(catalogue).filter((item): item is AddressDiscovery => item.universe === "adresses" && item.specialtyIds.includes(specialtyId));
}

export function getSpecialtiesForAddress(addressId: string, catalogue: readonly Discovery[]): FoodDiscovery[] {
  const address = getDiscoveryById(addressId, catalogue);
  if (address?.universe !== "adresses") return [];
  return getPublishedDiscoveries(catalogue).filter((item): item is FoodDiscovery => item.universe === "gastronomie" && address.specialtyIds.includes(item.id));
}

export function getActivitiesForVenue(venueId: string, catalogue: readonly Discovery[]): ActivityDiscovery[] {
  const venue = getDiscoveryById(venueId, catalogue);
  if (!venue || (venue.universe !== "tourisme" && venue.universe !== "adresses")) return [];
  return getPublishedDiscoveries(catalogue).filter((item): item is ActivityDiscovery => item.universe === "activites" && item.venue?.id === venueId && item.venue.universe === venue.universe);
}

export function getAssociatedVenue(activity: ActivityDiscovery, catalogue: readonly Discovery[]) {
  if (!activity.venue) return undefined;
  const venue = getDiscoveryById(activity.venue.id, catalogue);
  return venue?.universe === activity.venue.universe ? venue : undefined;
}

export function getSimilarDiscoveries(item: Discovery, limit: number, catalogue: readonly Discovery[], geography: PublicGeography): Discovery[] {
  const scopes = getDiscoveryGeography(item);
  return getPublishedDiscoveries(catalogue).filter((candidate) => candidate.id !== item.id && candidate.universe === item.universe && candidate.tags.some((tag) => item.tags.includes(tag)) && getDiscoveryGeography(candidate).some((reference) => scopes.some((scope) => belongsToDestination(reference, scope, geography) || belongsToDestination(scope, reference, geography)))).slice(0, Math.max(0, limit));
}

export function discoveryPath(item: Pick<Discovery, "universe" | "slug">): string {
  return `/decouvertes/${item.universe}/${encodeURIComponent(item.slug)}`;
}

export function discoveryType(item: Discovery): string {
  switch (item.universe) {
    case "tourisme": return item.placeType;
    case "activites": return item.activityType;
    case "gastronomie": return item.foodType;
    case "adresses": return item.establishmentType;
  }
}

export function toDiscoveryCard(item: Discovery, context: LocalDestination | undefined, geography: PublicGeography): DiscoveryCardData {
  const practicalDetails = item.universe === "activites" && item.duration ? [{ label: "Durée indicative", value: item.duration }] : item.universe === "adresses" && item.budget ? [{ label: "Budget indicatif", value: item.budget }] : undefined;
  return {
    id: item.id, universe: item.universe, title: item.title, summary: item.summary, photograph: item.photograph, tags: item.tags, typeLabel: discoveryType(item),
    imageNote: item.universe === "adresses" && item.photographCaption ? "Vue du quartier · photographie d’ambiance" : undefined,
    href: discoveryPath(item) + (context ? `?depuis=${encodeURIComponent(context.id)}&univers=${item.universe}` : ""),
    locationLabel: item.universe === "gastronomie" ? item.origins : resolveGeography(item.location, geography)?.label ?? "",
    originalName: item.universe === "gastronomie" ? item.originalName : undefined,
    practicalDetails,
  };
}

export function visibleDiscoveryCatalogue(geography: PublicGeography, catalogue: readonly Discovery[]) {
  return getPublishedDiscoveries(catalogue).filter((item) => getDiscoveryGeography(item).some((reference) => resolveGeography(reference, geography)));
}
