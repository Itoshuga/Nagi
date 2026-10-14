import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { cities, countries, districts } from "../../data/geography";
import type { PublicGeography } from "../../types/destinations";
import { getAdminFirestore } from "../firebase/admin";
import { readManagedGeography } from "./store";
import { publicGeographyFromDocuments } from "./presentation";

export function geographySource() {
  const source = process.env.NAGI_GEOGRAPHY_SOURCE ?? "static";
  if (source !== "static" && source !== "firestore") throw new Error("NAGI_GEOGRAPHY_SOURCE doit valoir static ou firestore.");
  return source;
}
function ordered<T extends { sortOrder: number; name: string; id: string }>(items: T[]) {
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id));
}
// Cache React limité à la requête. Aucun cache persistant ne conserve un brouillon
// dépublié ou une ancienne visibilité parentale entre deux requêtes.
export async function loadPublicGeography(): Promise<PublicGeography> {
  if (geographySource() === "static") return { countries, cities, districts };
  const data = await readManagedGeography(getAdminFirestore(), true);
  return publicGeographyFromDocuments({ countries: ordered(data.countries), cities: ordered(data.cities), districts: ordered(data.districts) });
}

export const getPublicGeography = cache(async () => {
  await connection();
  return loadPublicGeography();
});
