import type { ManagedCountry, ManagedCity, ManagedDistrict } from "../lib/geography/schema";
import type { TourismDiscovery, ActivityDiscovery, FoodDiscovery, AddressDiscovery } from "./discoveries";

export const catalogueCollections = ["countries", "cities", "districts", "tourism", "activities", "food", "addresses"] as const;
export type CatalogueCollection = (typeof catalogueCollections)[number];

export interface PublicationMetadata {
  readonly status: "draft" | "published";
  readonly visibility: "public" | "private";
  // ISO 8601 UTC : réutilise les dates actuelles sans conversion implicite Timestamp.
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CatalogueDocument<T> = Omit<T, keyof PublicationMetadata> & PublicationMetadata;

export interface CatalogueDocuments {
  countries: ManagedCountry;
  cities: ManagedCity;
  districts: ManagedDistrict;
  tourism: CatalogueDocument<TourismDiscovery>;
  activities: CatalogueDocument<ActivityDiscovery>;
  food: CatalogueDocument<FoodDiscovery>;
  addresses: CatalogueDocument<AddressDiscovery>;
}
