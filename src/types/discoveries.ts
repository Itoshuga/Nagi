import type { Photograph } from "./content";

export const universeSlugs = ["tourisme", "activites", "gastronomie", "adresses"] as const;
export type UniverseSlug = (typeof universeSlugs)[number];
export type LocalDestination = { kind: "city" | "district"; id: string };
export type GeographicReference = LocalDestination | { kind: "country"; id: string };
export type Reservation = "required" | "recommended" | "not-required";
export interface Source { label: string; url: string }

interface DiscoveryBase {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly description: readonly string[];
  readonly photograph?: Photograph;
  readonly photographCaption?: string;
  readonly gallery?: readonly (Photograph & { caption: string })[];
  readonly tags: readonly string[];
  readonly status: "draft" | "published";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly verifiedAt?: string;
  readonly sources: readonly Source[];
  readonly sections?: readonly { title: string; text: string }[];
  readonly extraFacts?: readonly { label: string; value: string }[];
}

interface LocatedDiscovery extends DiscoveryBase {
  // Un seul parent géographique ; la ville et le pays sont dérivés.
  readonly location: LocalDestination;
}

export interface TourismDiscovery extends LocatedDiscovery {
  readonly universe: "tourisme";
  readonly placeType: string;
  readonly coordinates?: { latitude: number; longitude: number };
  readonly address?: string;
  readonly access?: string;
  readonly visitDuration?: string;
  readonly admission?: { type: "free" | "paid" | "mixed"; detail?: string };
  readonly openingHours?: string;
  readonly officialUrl?: string;
}

export interface ActivityDiscovery extends LocatedDiscovery {
  readonly universe: "activites";
  readonly activityType: string;
  readonly experience: string;
  // Une idée éditoriale ne constitue pas une prestation réservable.
  readonly format: "editorial-idea" | "offered-experience";
  readonly duration?: string;
  readonly budget?: string;
  readonly reservation?: Reservation;
  readonly bookingUrl?: string;
  readonly audience?: readonly string[];
  readonly venue?: { universe: "tourisme" | "adresses"; id: string };
  readonly organizer?: { universe: "tourisme" | "adresses"; id: string };
  readonly additionalInformation?: string;
}

export interface FoodDiscovery extends DiscoveryBase {
  readonly universe: "gastronomie";
  readonly originalName: string;
  readonly foodType: "Plat" | "Dessert" | "Pâtisserie" | "Boisson" | "Confiserie" | "Autre";
  readonly origins: string;
  readonly history: readonly string[];
  readonly ingredients: readonly string[];
  readonly variants: readonly string[];
  readonly destinations: readonly GeographicReference[];
}

export interface AddressDiscovery extends LocatedDiscovery {
  readonly universe: "adresses";
  readonly establishmentType: string;
  readonly postalAddress: string;
  readonly coordinates?: { latitude: number; longitude: number };
  readonly website?: string;
  readonly openingHours?: string;
  readonly budget?: string;
  readonly waitingTime?: string;
  readonly reservation?: Reservation;
  readonly bookingUrl?: string;
  // Source unique de la relation plusieurs-à-plusieurs avec les spécialités.
  readonly specialtyIds: readonly string[];
}

export type Discovery = TourismDiscovery | ActivityDiscovery | FoodDiscovery | AddressDiscovery;

export interface DiscoveryCardData {
  id: string;
  title: string;
  summary: string;
  universe: UniverseSlug;
  typeLabel: string;
  photograph?: Photograph;
  imageNote?: string;
  tags: readonly string[];
  href: string;
  locationLabel: string;
  originalName?: string;
  practicalDetails?: readonly { label: string; value: string }[];
}
